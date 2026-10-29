import { describe, expect, it } from 'vitest';
import manifest from '../../public/audio/narration/manifest.json';
import { createRng } from '../../src/core/random';
import type { UnitSystem } from '../../src/core/units';
import { BUILT_VEHICLES, collectLines } from '../../src/guide/collect-lines';
import { lineKey } from '../../src/guide/narration';
import { ITEMS } from '../../src/interaction/item-catalog';
import { LESSONS } from '../../src/lessons/content';
import { LessonRunner } from '../../src/lessons/engine/runner';
import { HAND, type MistakeDef, type StepDef } from '../../src/lessons/engine/types';
import { VEHICLES } from '../../src/vehicles/specs';

function mistakesOf(step: StepDef): MistakeDef[] {
  return [
    step.skipMistake,
    step.orderMistake,
    step.wrongItem,
    step.choice?.wrong,
    step.measure?.over,
    step.measure?.under,
    ...Object.values(step.wrongItems ?? {}),
    ...Object.values(step.wrongTargets ?? {}),
  ].filter((m): m is MistakeDef => !!m);
}

const runs = LESSONS.filter((l) => l.available).flatMap((lesson) =>
  lesson.vehicles
    .filter((v) => (BUILT_VEHICLES as readonly string[]).includes(v))
    .flatMap((v) =>
      (['us', 'metric'] as UnitSystem[]).flatMap((units) =>
        [0, 1, 2, 3, 4, 5, 17, 42].map((seed) => ({ lesson, vehicle: VEHICLES[v], units, seed })),
      ),
    ),
);

describe('lesson content', () => {
  it('has all eight lessons, with stage 1 lessons available', () => {
    expect(LESSONS).toHaveLength(8);
    expect(LESSONS.filter((l) => l.available).map((l) => l.id)).toEqual(['oil-change', 'tire-service']);
  });

  it.each(runs.map((r) => [`${r.lesson.id} ${r.vehicle.id} ${r.units} seed ${r.seed}`, r] as const))(
    '%s is well-formed',
    (_name, { lesson, vehicle, units, seed }) => {
      const steps = lesson.steps(vehicle, lesson.variant(createRng(seed), vehicle), units);
      const ids = new Set<string>();
      for (const [i, step] of steps.entries()) {
        expect(ids.has(step.id), `duplicate step ${step.id}`).toBe(false);
        ids.add(step.id);
        expect(step.label.length).toBeGreaterThan(3);
        expect(step.say.length).toBeGreaterThan(10);
        expect(step.hint.length).toBeGreaterThan(5);
        if (step.choice) {
          expect(step.targets).toEqual([]);
          expect(step.choice.correct).toBeLessThan(step.choice.options.length);
        } else {
          expect(step.targets.length, `${step.id} has no targets`).toBeGreaterThan(0);
        }
        for (const req of step.requires ?? []) {
          const at = steps.findIndex((s) => s.id === req);
          expect(at, `${step.id} requires unknown or later step ${req}`).toBeGreaterThanOrEqual(0);
          expect(at).toBeLessThan(i);
        }
        const items = [step.item, ...Object.values(step.targetItems ?? {}), ...Object.keys(step.wrongItems ?? {})];
        for (const item of items) expect(item === HAND || item in ITEMS, `unknown item ${item}`).toBe(true);
        if (step.measure) {
          expect(step.measure.min).toBeLessThanOrEqual(step.measure.spec);
          expect(step.measure.max).toBeGreaterThanOrEqual(step.measure.spec);
          if (step.measure.source === 'fill') expect(step.gesture.kind).toBe('hold');
        }
        for (const m of mistakesOf(step)) {
          expect(m.code).toMatch(/^[a-z0-9]+(\.[a-z0-9_]+)+$/);
          expect(m.explain.length).toBeGreaterThan(20);
        }
      }
      for (const item of lesson.cartItems) expect(item in ITEMS, `unknown cart item ${item}`).toBe(true);
      expect(lesson.workOrder(vehicle, lesson.variant(createRng(seed), vehicle), units).length).toBeGreaterThan(0);
    },
  );

  it('every lesson can be completed perfectly by doing each step with the right tool', () => {
    for (const { lesson, vehicle, units, seed } of runs) {
      const steps = lesson.steps(vehicle, lesson.variant(createRng(seed), vehicle), units);
      const r = new LessonRunner(steps, 'test');
      for (let guard = 0; guard < 200 && !r.finished; guard++) {
        const step = r.current as StepDef;
        if (step.choice) {
          r.answer(step.choice.correct);
          continue;
        }
        const target = r.remainingTargets()[0] as string;
        const item = r.itemFor(target) as string;
        expect(r.attempt(item, target).kind).toBe('start');
        r.complete(target, step.measure?.spec);
      }
      expect(r.result(), `${lesson.id} ${units} ${seed}`).toMatchObject({ completed: true, score: 100, passed: true });
    }
  });

  it('a stable mistake code always means the same thing', () => {
    const labels = new Map<string, string>();
    for (const { lesson, vehicle, units, seed } of runs) {
      for (const step of lesson.steps(vehicle, lesson.variant(createRng(seed), vehicle), units)) {
        for (const m of mistakesOf(step)) {
          const seen = labels.get(m.code);
          if (seen) expect(seen, m.code).toBe(m.label);
          labels.set(m.code, m.label);
        }
      }
    }
    expect(labels.size).toBeGreaterThan(15);
  });

  it('has a recorded narration clip for every scripted line', () => {
    const clips = (manifest as { clips: Record<string, string> }).clips;
    const missing = collectLines().filter((line) => !clips[lineKey(line)]);
    expect(missing, 'run scripts/gen-narration.mjs').toEqual([]);
  });
});
