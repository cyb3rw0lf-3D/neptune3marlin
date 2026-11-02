import type { UnitSystem } from '../core/units';
import type { BatteryVariant } from '../lessons/content/battery';
import { courtesyCheck } from '../lessons/content/inspection';
import type { ItemId, StepDef } from '../lessons/engine/types';
import type { VehicleSpec } from '../vehicles/specs';
import { EXTRAS } from './jobs';
import type { UpgradeId } from './model';
import type { ShiftJob } from './shift';

/** How a Shop job changes the lesson it runs on. */
export interface JobPlan {
  match?: (variant: unknown) => boolean;
  adjustSteps: (steps: StepDef[], vehicle: VehicleSpec, variant: unknown, units: UnitSystem) => StepDef[];
  cartExtra: ItemId[];
  workOrderExtra: string[];
}

/** Battery state of health shown by the digital analyzer upgrade. */
function stateOfHealth(v: BatteryVariant): number {
  return v.state === 'good' ? 92 : v.state === 'weak' ? 46 : 18;
}

/** Applies the shop's upgrades to a lesson's steps. Pure: returns new step objects. */
export function applyUpgrades(steps: StepDef[], upgrades: UpgradeId[], variant: unknown): StepDef[] {
  return steps.map((step) => {
    let s = step;
    if (upgrades.includes('impact') && s.item === 'impact-wrench' && s.gesture.kind === 'hold') {
      s = { ...s, gesture: { kind: 'press' }, say: `${s.say} The cordless impact wrench zips each one off.` };
    }
    if (upgrades.includes('analyzer') && s.item === 'multimeter' && s.readings?.['battery-posts']) {
      const v = variant as BatteryVariant;
      if (v && typeof v.state === 'string') {
        const r = s.readings['battery-posts'];
        s = {
          ...s,
          readings: {
            ...s.readings,
            'battery-posts': { ...r, note: `${r.note ? `${r.note}. ` : ''}Analyzer: ${stateOfHealth(v)}% health` },
          },
        };
      }
    }
    return s;
  });
}

export function planJob(sj: ShiftJob, upgrades: UpgradeId[]): JobPlan {
  const extra = sj.extra;
  const check = extra ? EXTRAS[extra.id].check : null;
  return {
    match: sj.job.match,
    adjustSteps: (steps, vehicle, variant, units) => {
      const out = applyUpgrades(steps, upgrades, variant);
      if (extra && check) out.push(courtesyCheck(check, extra.severity, vehicle, units));
      return out;
    },
    cartExtra: check === 'tires' ? ['tread-gauge'] : [],
    workOrderExtra: [
      ...(sj.comeback ? [`COMEBACK: ${sj.comeback.note ?? ''}`] : []),
      ...(check ? [`Courtesy check: ${check === 'tires' ? 'tire tread' : check}. Tag it honestly.`] : []),
    ],
  };
}
