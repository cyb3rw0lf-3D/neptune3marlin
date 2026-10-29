import type { Rng } from '../../core/random';
import { formatBoth, type UnitSystem } from '../../core/units';
import type { VehicleSpec } from '../../vehicles/specs';
import { type Choice, HAND, type LessonDef, type MistakeDef, type Reading, type StepDef } from '../engine/types';
import { ppeStep } from './common';

/** 0 green (OK), 1 yellow (soon), 2 red (now). */
export type Severity = 0 | 1 | 2;

interface CheckDef {
  id: string;
  /** Short name used in labels and mistake text. */
  name: string;
  target: string;
  spot: string;
  item?: string;
  /** How to check it, spoken in Learn mode. */
  say: string;
  hint: string;
  /** What the student finds at each severity. Missing entries cannot happen for this item. */
  findings: [string, string | null, string | null];
  /** Visible fault shown in the world for yellow / red. */
  visual?: string;
  hold?: number;
}

const CHECKS: CheckDef[] = [
  {
    id: 'oil',
    name: 'engine oil',
    target: 'dipstick',
    spot: 'hood',
    say: 'Pull the yellow dipstick, wipe it, dip it again and read the level and color.',
    hint: 'Engine oil is checked with the yellow handle.',
    findings: [
      'Between the marks, clean amber color',
      'At the ADD mark, and dark brown',
      'Below ADD, barely on the stick',
    ],
  },
  {
    id: 'coolant',
    name: 'coolant',
    target: 'coolant-reservoir',
    spot: 'hood',
    say: 'Check the coolant level against the marks on the see-through reservoir. Never open the radiator cap on a hot engine.',
    hint: 'Coolant is read on the side of the plastic reservoir, not at the radiator cap.',
    findings: ['At the FULL mark', 'Just above the MIN mark', 'Below MIN, nearly empty'],
  },
  {
    id: 'brake-fluid',
    name: 'brake fluid',
    target: 'brake-reservoir',
    spot: 'hood',
    say: 'Look at the brake fluid reservoir with the yellow cap. Check the level and the color.',
    hint: 'Brake fluid lives in the small reservoir with the yellow cap.',
    findings: [
      'Near MAX, clear golden color',
      'Dark amber: due for a fluid flush',
      'Below MIN: possible leak or worn pads',
    ],
  },
  {
    id: 'washer',
    name: 'washer fluid',
    target: 'washer-cap',
    spot: 'hood',
    say: 'Pop the blue washer fluid cap and look in.',
    hint: 'The washer fluid cap is blue.',
    findings: ['Full', 'Low: top it off', null],
  },
  {
    id: 'belt',
    name: 'drive belt',
    target: 'drive-belt',
    spot: 'hood',
    say: 'Look closely at the ribbed drive belt for cracks, missing chunks and fraying.',
    hint: 'The belt wraps around the pulleys on the side of the engine.',
    findings: ['No cracks, sharp clean ribs', 'A few small cracks across the ribs', 'Deep cracks and a frayed edge'],
  },
  {
    id: 'hose',
    name: 'upper radiator hose',
    target: 'upper-hose',
    spot: 'hood',
    say: 'Squeeze the upper radiator hose. It should feel firm, not soft or swollen.',
    hint: 'The big black hose runs from the engine to the radiator.',
    findings: ['Firm, no bulges', 'Slightly soft', 'Soft and swollen at the clamp, weeping coolant'],
    hold: 0.8,
  },
  {
    id: 'air-filter',
    name: 'engine air filter',
    target: 'air-filter',
    spot: 'hood',
    say: 'Open the air filter box and hold the filter up to the light.',
    hint: 'The air filter is inside the black box.',
    findings: ['Clean, light passes through', 'Dirty, light barely shows through', 'Clogged with dirt and leaves'],
  },
  {
    id: 'terminals',
    name: 'battery terminals',
    target: 'battery-posts',
    spot: 'hood',
    say: 'Look at the battery posts and cable clamps for corrosion and check they are tight.',
    hint: 'The battery posts are on top of the battery.',
    findings: ['Clean and tight', 'White-green crust on the positive post', null],
    visual: 'terminals',
  },
  {
    id: 'wipers',
    name: 'wiper blades',
    target: 'wipers',
    spot: 'hood',
    say: 'Lift a wiper arm and run a finger along the rubber blade.',
    hint: 'The wipers sit at the bottom of the windshield.',
    findings: ['Soft rubber, clean edge', 'Hard rubber that streaks', 'Rubber torn and hanging off'],
  },
  {
    id: 'lights',
    name: 'lights',
    target: 'light-switch',
    spot: 'driver',
    say: 'Turn the headlight switch on. I will press the brake pedal so you can see the brake lights too.',
    hint: 'The light switch is on the dash to the left of the steering wheel.',
    findings: ['All lamps work', null, 'Left brake light is out'],
    visual: 'lamp-TL',
  },
  {
    id: 'tires',
    name: 'tires',
    target: 'tread-FL',
    item: 'tread-gauge',
    spot: 'left-front',
    say: 'Measure the tread on the left front tire with the tread gauge.',
    hint: 'The tread gauge measures how deep the grooves are.',
    findings: ['Plenty of tread left', 'Tread is getting low', 'Tread is down to the legal minimum'],
  },
  {
    id: 'leaks',
    name: 'leaks',
    target: 'leak-check',
    spot: 'hood',
    say: 'Look at the floor under the front of the car for drips.',
    hint: 'Fresh drips show up on the floor under the engine.',
    findings: ['Floor is dry', 'A few drops of oil under the engine', 'A spreading puddle under the engine'],
    visual: 'leak',
  },
];

const OPTIONS = ['Green: OK', 'Yellow: needs attention soon', 'Red: needs repair now'];

export interface InspectionVariant {
  /** Severity of each check by id. */
  found: Record<string, Severity>;
  /** Tread depth on the left front tire, in 32nds of an inch. */
  tread: number;
}

function pickFaults(rng: Rng): Record<string, Severity> {
  const found: Record<string, Severity> = Object.fromEntries(CHECKS.map((c) => [c.id, 0 as Severity]));
  const n = 2 + Math.floor(rng() * 3);
  const pool = [...CHECKS];
  for (let i = 0; i < n && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    const check = pool.splice(idx, 1)[0] as CheckDef;
    const options = ([1, 2] as const).filter((s) => check.findings[s] !== null);
    found[check.id] = options[Math.floor(rng() * options.length)] as Severity;
  }
  return found;
}

export const inspection: LessonDef<InspectionVariant> = {
  id: 'inspection',
  title: 'Multi-Point Inspection',
  summary: 'Check fluids, belts, hoses, filters, wipers and lights, and report honestly.',
  available: true,
  vehicles: ['sedan', 'pickup'],
  cartItems: ['tread-gauge', 'tire-gauge', 'rag'],
  intro:
    'A multi-point inspection is a health check for the whole car. Look at every item, then make an honest call: green if it is fine, yellow if it needs attention soon, red if it needs repair now. Every car hides a different set of problems.',
  outro:
    'Inspection complete. You found what was really wrong and did not flag anything that was fine. That honesty is what keeps customers coming back.',
  variant: (rng, vehicle) => {
    const found = pickFaults(rng);
    const sev = found.tires ?? 0;
    const tread = sev === 0 ? vehicle.tires.newTread32 - 3 : sev === 1 ? 4 : 2;
    return { found, tread };
  },
  stage: (v) => ({
    faults: CHECKS.filter((c) => c.visual && (v.found[c.id] ?? 0) > 0).map((c) => c.visual as string),
  }),
  workOrder: (vehicle) => [
    `${vehicle.name}: courtesy multi-point inspection`,
    'Tag each item: green OK, yellow soon, red now',
    'Tread: 4/32 in or less = yellow, 2/32 in = red',
  ],
  steps: (vehicle, v, units) => inspectionSteps(vehicle, v, units),
};

function tagFor(check: CheckDef, severity: Severity): Choice {
  const finding = check.findings[severity] ?? check.findings[0];
  const key = check.id.replace(/-/g, '_');
  const missed: MistakeDef = {
    code: `inspection.${key}.missed`,
    kind: 'value',
    label: `Missed a problem: ${check.name}`,
    explain: `There was a real problem here. ${finding}. Missing it means the customer drives away with it, and it can leave them stranded or unsafe.`,
  };
  const falseFlag: MistakeDef = {
    code: `inspection.${key}.false_flag`,
    kind: 'procedure',
    label: `Flagged a good part: ${check.name}`,
    explain: `This one was fine. ${check.findings[0]}. Calling a good part bad sells the customer work they do not need. Honest inspections are how a shop earns trust.`,
  };
  const severityOff: MistakeDef = {
    code: `inspection.${key}.severity`,
    kind: 'wrong-item',
    label: `Right problem, wrong urgency: ${check.name}`,
    explain:
      severity === 2
        ? `${finding}. That is more than a "soon" item. It needs repair now.`
        : `${finding}. That can wait a little. It needs attention soon, not an emergency repair.`,
  };
  const byOption: Record<number, MistakeDef> =
    severity === 0
      ? { 1: falseFlag, 2: falseFlag }
      : severity === 1
        ? { 0: missed, 2: severityOff }
        : { 0: missed, 1: severityOff };
  return {
    prompt: 'your call?',
    options: OPTIONS,
    correct: severity,
    wrong: severity === 0 ? falseFlag : missed,
    wrongByOption: byOption,
  };
}

function inspectionSteps(vehicle: VehicleSpec, v: InspectionVariant, units: UnitSystem): StepDef[] {
  const steps: StepDef[] = [
    ppeStep(
      'An engine bay is full of hot parts, sharp edges and chemicals. Glasses and gloves keep a quick look from turning into an injury.',
    ),
    {
      id: 'engine-off',
      label: 'Turn the engine off',
      say: 'The car just came back from a test drive and the engine is still running. Turn it off before you reach into the engine bay.',
      hint: 'Nothing goes near the belts or fan with the engine running.',
      spot: 'driver',
      item: HAND,
      targets: ['start-button'],
      gesture: { kind: 'press' },
      skipMistake: {
        code: 'inspection.engine.running',
        kind: 'safety',
        label: 'Reached into the engine bay with the engine running',
        explain:
          'A running engine has a spinning belt and an electric cooling fan that can switch on at any moment, even after the key is off on some cars. Engine off, and keep your hands clear of the fan.',
        consequence: 'fan-spin',
      },
      effects: [{ fx: 'engine-off' }],
      safety: true,
    },
    {
      id: 'hood',
      label: 'Open the hood',
      say: 'Pull the hood release and lift the hood.',
      hint: 'Most of the checks are under the hood.',
      spot: 'hood',
      item: HAND,
      targets: ['hood-latch'],
      gesture: { kind: 'press' },
      effects: [{ fx: 'hood-open' }],
    },
  ];

  for (const check of CHECKS) {
    const severity = (v.found[check.id] ?? 0) as Severity;
    let reading: Reading;
    if (check.id === 'tires') {
      reading = { quantity: 'tread', value: v.tread, note: 'Deepest groove reading' };
    } else {
      reading = { text: check.findings[severity] ?? check.findings[0] };
    }
    const step: StepDef = {
      id: `check-${check.id}`,
      label: `Check the ${check.name}`,
      say: `${check.say} Then make your call.`,
      hint: check.hint,
      spot: check.spot,
      item: check.item ?? HAND,
      targets: [check.target],
      gesture: check.hold ? { kind: 'hold', seconds: check.hold } : { kind: 'press' },
      requires: ['engine-off'],
      readings: { [check.target]: reading },
      tag: tagFor(check, severity),
      effects: [{ fx: check.id === 'lights' ? 'lights-on' : check.id === 'oil' ? 'dipstick' : 'inspect' }],
    };
    if (check.id === 'coolant') {
      step.wrongTargets = {
        'radiator-cap': {
          code: 'inspection.coolant.hot_cap',
          kind: 'safety',
          label: 'Opened the radiator cap on a hot engine',
          explain:
            'A hot cooling system is under pressure, far above boiling. Opening the radiator cap sprays scalding coolant and steam. Read the level on the reservoir, and only open the cap when the engine is cold.',
          consequence: 'hot-steam',
        },
      };
    }
    if (check.id === 'tires') {
      step.say = `Measure the tread on the left front tire with the tread gauge. Under ${formatBoth('tread', 4, units)} is a yellow, and ${formatBoth('tread', 2, units)} is the legal minimum, so that is a red.`;
    }
    steps.push(step);
  }

  steps.push({
    id: 'close',
    label: 'Turn the lights off and close the hood',
    say: 'All checked. Close the hood gently and make sure it latches.',
    hint: 'Leave the car the way it came in.',
    spot: 'hood',
    item: HAND,
    targets: ['hood-latch'],
    gesture: { kind: 'press' },
    effects: [{ fx: 'hood-close' }, { fx: 'lights-off' }],
  });
  void vehicle;
  return steps;
}
