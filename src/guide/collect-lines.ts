import { createRng } from '../core/random';
import type { UnitSystem } from '../core/units';
import { LESSONS } from '../lessons/content';
import type { MistakeDef, StepDef } from '../lessons/engine/types';
import { VEHICLES } from '../vehicles/specs';
import { LINES } from './lines';

/** Vehicles that have 3D models so far. */
export const BUILT_VEHICLES = ['sedan', 'pickup'] as const;

function stepLines(step: StepDef): string[] {
  const out = [step.say, step.hint];
  if (step.why) out.push(step.why);
  if (step.choice?.right) out.push(step.choice.right);
  if (step.tag?.right) out.push(step.tag.right);
  const mistakes: (MistakeDef | undefined)[] = [
    step.skipMistake,
    step.orderMistake,
    step.wrongItem,
    step.choice?.wrong,
    step.tag?.wrong,
    ...Object.values(step.choice?.wrongByOption ?? {}),
    ...Object.values(step.tag?.wrongByOption ?? {}),
    step.measure?.over,
    step.measure?.under,
    ...Object.values(step.wrongItems ?? {}),
    ...Object.values(step.wrongTargets ?? {}),
  ];
  for (const m of mistakes) if (m) out.push(m.explain);
  return out;
}

/**
 * Every scripted line the game can speak, across vehicles, unit systems and
 * lesson variants. Used to pre-record narration; dynamic one-off messages fall
 * back to speech synthesis or captions.
 */
export function collectLines(seeds = 300): string[] {
  const lines = new Set<string>(Object.values(LINES));
  for (const lesson of LESSONS) {
    if (!lesson.available) continue;
    lines.add(lesson.intro);
    lines.add(lesson.outro);
    for (const vehicleId of lesson.vehicles) {
      if (!(BUILT_VEHICLES as readonly string[]).includes(vehicleId)) continue;
      const vehicle = VEHICLES[vehicleId];
      for (const units of ['us', 'metric'] as UnitSystem[]) {
        for (let seed = 0; seed < seeds; seed++) {
          const variant = lesson.variant(createRng(seed), vehicle);
          for (const step of lesson.steps(vehicle, variant, units)) for (const l of stepLines(step)) lines.add(l);
        }
      }
    }
  }
  return [...lines].filter((l) => l.trim().length > 0);
}
