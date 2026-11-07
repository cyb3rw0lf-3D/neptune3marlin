import { describe, expect, it } from 'vitest';
import manifest from '../../public/audio/narration/manifest.json';
import { createRng } from '../../src/core/random';
import type { UnitSystem } from '../../src/core/units';
import { BUILT_VEHICLES, collectSpoken } from '../../src/guide/collect-lines';
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
    step.tag?.wrong,
    ...Object.values(step.choice?.wrongByOption ?? {}),
    ...Object.values(step.tag?.wrongByOption ?? {}),
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
  it('has all twelve lessons, all available', () => {
    expect(LESSONS).toHaveLength(12);
    expect(LESSONS.every((l) => l.available)).toBe(true);
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
        } else if (step.tag) {
          expect(step.targets).toHaveLength(1);
          expect(step.tag.correct).toBeLessThan(step.tag.options.length);
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
        if (r.awaitingTag && step.tag) {
          r.answer(step.tag.correct);
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

  it('every tool fitted to the car is taken off again later in the lesson', () => {
    for (const { lesson, vehicle, units, seed } of runs) {
      const steps = lesson.steps(vehicle, lesson.variant(createRng(seed), vehicle), units);
      const on = new Set<string>();
      for (const step of steps) {
        if (step.fit) {
          const items = step.targetItems ? Object.values(step.targetItems) : [step.item];
          for (const item of items) {
            expect(item, `${lesson.id}/${step.id} fits a bare hand`).not.toBe(HAND);
            on.add(item);
          }
        }
        for (const item of step.unfit ?? []) {
          expect(on.has(item), `${lesson.id}/${step.id} removes ${item}, which was never fitted`).toBe(true);
          expect(step.skipMistake, `${lesson.id}/${step.id} needs a left-on mistake`).toBeDefined();
          on.delete(item);
        }
      }
      expect([...on], `${lesson.id} on ${vehicle.id} leaves tools on the car`).toEqual([]);
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
    const clips = (manifest as { clips: Record<string, unknown> }).clips;
    const missing = collectSpoken().filter((line) => !clips[lineKey(line.text, line.speaker)]);
    expect(missing, 'run scripts/gen-narration.mjs').toEqual([]);
  });
});

describe('stage 3 scenarios', () => {
  const variants = <T>(id: string, vehicle: keyof typeof VEHICLES, n = 200): T[] => {
    const lesson = LESSONS.find((l) => l.id === id)!;
    return Array.from({ length: n }, (_, i) => lesson.variant(createRng(i * 7919 + 13), VEHICLES[vehicle]) as T);
  };

  it('OBD-II picks every fault scenario', () => {
    const codes = new Set(variants<{ code: string }>('obd2', 'sedan').map((v) => v.code));
    expect([...codes].sort()).toEqual(['P0128', 'P0171', 'P0301', 'P0455']);
  });

  it('EV safety sometimes hands out gloves with a pinhole', () => {
    const holes = new Set(variants<{ pinhole: boolean }>('ev-safety', 'ev').map((v) => v.pinhole));
    expect([...holes].sort()).toEqual([false, true]);
  });

  it('an EV jump-start always uses the jump pack', () => {
    const jumps = new Set(variants<{ jump: string }>('battery', 'ev').map((v) => v.jump));
    expect([...jumps]).toEqual(['pack']);
  });

  it('the EV inspection has no engine checks and adds the cabin filter', () => {
    const lesson = LESSONS.find((l) => l.id === 'inspection')!;
    const ev = VEHICLES.ev;
    const ids = lesson.steps(ev, lesson.variant(createRng(1), ev), 'us').map((s) => s.id);
    expect(ids).toContain('check-cabin-filter');
    for (const gas of ['check-oil', 'check-belt', 'check-hose', 'check-air-filter']) expect(ids).not.toContain(gas);
  });
});
