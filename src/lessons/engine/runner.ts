import {
  type Effect,
  type Gesture,
  HAND,
  type ItemId,
  type Measure,
  type MistakeDef,
  type MistakeRecord,
  type Mode,
  PASS_SCORE,
  PENALTY,
  type Reading,
  type RunResult,
  type StepDef,
  type TargetId,
} from './types';

export type Verdict =
  | { kind: 'start'; step: StepDef; target: TargetId; gesture: Gesture; measure?: Measure }
  | { kind: 'mistake'; step: StepDef; mistake: MistakeDef; record: MistakeRecord }
  | { kind: 'ignored'; reason: 'finished' | 'done' | 'unrelated' | 'choice-pending' | 'not-yet' }
  | {
      kind: 'done';
      step: StepDef;
      target: TargetId | null;
      stepDone: boolean;
      lessonDone: boolean;
      effects: Effect[];
      reading?: Reading;
      /** Set when the step completed but with a recorded mistake (e.g. overfilled). */
      mistake?: { def: MistakeDef; record: MistakeRecord };
    };

export interface RunnerOptions {
  itemName?: (id: ItemId) => string;
  now?: () => number;
}

/**
 * Pure lesson state machine: no rendering or input. The world asks it whether an
 * action is allowed (attempt), reports when a gesture finishes (complete) and
 * applies the effects it returns. Steps run in order; a group step's targets can
 * be done in any order unless the step is `ordered`.
 */
export class LessonRunner {
  readonly mode: Mode;
  readonly steps: StepDef[];
  private index = 0;
  private doneTargets = new Map<string, Set<TargetId>>();
  private mistakes: MistakeRecord[] = [];
  private hintsUsed = 0;
  private readonly startedAt: number;
  private endedAt: number | null = null;
  private readonly itemName: (id: ItemId) => string;
  private readonly now: () => number;

  constructor(steps: StepDef[], mode: Mode, options: RunnerOptions = {}) {
    if (steps.length === 0) throw new Error('A lesson needs at least one step');
    this.steps = steps;
    this.mode = mode;
    this.itemName = options.itemName ?? ((id) => id);
    this.now = options.now ?? (() => Date.now());
    this.startedAt = this.now();
    for (const s of steps) this.doneTargets.set(s.id, new Set());
  }

  get current(): StepDef | null {
    return this.steps[this.index] ?? null;
  }

  get currentIndex(): number {
    return this.index;
  }

  get finished(): boolean {
    return this.index >= this.steps.length;
  }

  isStepDone(stepId: string): boolean {
    const i = this.steps.findIndex((s) => s.id === stepId);
    return i >= 0 && i < this.index;
  }

  isTargetDone(stepId: string, target: TargetId): boolean {
    return this.doneTargets.get(stepId)?.has(target) ?? false;
  }

  /** Targets of the current step that still need doing, in the order expected. */
  remainingTargets(): TargetId[] {
    const step = this.current;
    if (!step) return [];
    const done = this.doneTargets.get(step.id) ?? new Set();
    return step.targets.filter((t) => !done.has(t));
  }

  /** Called when the student uses `item` (or the empty hand) on `target`. */
  attempt(item: ItemId, target: TargetId): Verdict {
    const step = this.current;
    if (!step) return { kind: 'ignored', reason: 'finished' };

    if (step.targets.includes(target)) {
      if (this.isTargetDone(step.id, target)) return { kind: 'ignored', reason: 'done' };
      const need = expectedItem(step, target);
      if (step.ordered) {
        const expected = this.remainingTargets()[0];
        if (target !== expected && item === need) {
          return this.mistake(step, step.orderMistake ?? this.genericOrder(step));
        }
      }
      if (item !== need) {
        const specific = step.wrongItems?.[item] ?? step.wrongItem;
        return this.mistake(step, specific ?? this.genericWrongItem(step, need, item));
      }
      return { kind: 'start', step, target, gesture: step.gesture, measure: step.measure };
    }

    const wrongTarget = step.wrongTargets?.[target];
    if (wrongTarget) return this.mistake(step, wrongTarget);

    if (step.choice) return { kind: 'ignored', reason: 'choice-pending' };

    // Trying a later step too early, with the tool that step needs.
    for (let i = this.index + 1; i < this.steps.length; i++) {
      const future = this.steps[i] as StepDef;
      if (!future.targets.includes(target) || expectedItem(future, target) !== item) continue;
      for (const reqId of future.requires ?? []) {
        if (this.isStepDone(reqId)) continue;
        const req = this.steps.find((s) => s.id === reqId);
        if (req?.skipMistake) return this.mistake(step, req.skipMistake);
      }
      return this.mistake(step, this.genericOrder(step));
    }

    // Targets reused from earlier steps that are finished.
    for (let i = 0; i < this.index; i++) {
      if ((this.steps[i] as StepDef).targets.includes(target)) return { kind: 'ignored', reason: 'done' };
    }

    // Touching something that belongs to a later step with a different tool: just a nudge.
    for (let i = this.index + 1; i < this.steps.length; i++) {
      if ((this.steps[i] as StepDef).targets.includes(target)) return { kind: 'ignored', reason: 'not-yet' };
    }
    return { kind: 'ignored', reason: 'unrelated' };
  }

  /**
   * Called when the gesture for an allowed attempt finishes. `value` is the tool
   * setting (torque wrench) or the accumulated amount (fill) for measured steps.
   */
  complete(target: TargetId, value?: number): Verdict {
    const step = this.current;
    if (!step?.targets.includes(target)) return { kind: 'ignored', reason: 'unrelated' };
    if (this.isTargetDone(step.id, target)) return { kind: 'ignored', reason: 'done' };

    const m = step.measure;
    let fillMistake: { def: MistakeDef; record: MistakeRecord } | undefined;
    if (m && value !== undefined) {
      if (value < m.min) {
        if (m.source === 'fill') return { kind: 'ignored', reason: 'not-yet' };
        return this.mistake(step, m.under ?? this.genericValue(step, 'low'));
      }
      if (value > m.max) {
        const def = m.over ?? this.genericValue(step, 'high');
        if (m.source === 'setting') return this.mistake(step, def);
        // Overfilling is corrected for the student (the excess is drained) and the step completes.
        const v = this.mistake(step, def);
        if (v.kind === 'mistake') fillMistake = { def, record: v.record };
      }
    }
    return this.markDone(step, target, fillMistake);
  }

  /** Answer the current step's multiple-choice question. */
  answer(optionIndex: number): Verdict {
    const step = this.current;
    if (!step?.choice) return { kind: 'ignored', reason: 'unrelated' };
    if (optionIndex !== step.choice.correct) return this.mistake(step, step.choice.wrong);
    return this.markDone(step, null);
  }

  /** The item the current step needs for a target (for highlighting the right tool). */
  itemFor(target: TargetId): ItemId | null {
    const step = this.current;
    return step ? expectedItem(step, target) : null;
  }

  /** Practice mode only: returns the hint and counts it. */
  hint(): string | null {
    if (this.mode !== 'practice' || !this.current) return null;
    this.hintsUsed++;
    return this.current.hint;
  }

  private markDone(
    step: StepDef,
    target: TargetId | null,
    mistake?: { def: MistakeDef; record: MistakeRecord },
  ): Verdict {
    const done = this.doneTargets.get(step.id) as Set<TargetId>;
    const effects: Effect[] = [];
    if (target !== null) {
      done.add(target);
      for (const e of step.effects ?? []) effects.push({ fx: e.fx, arg: e.arg ?? target });
    }
    const stepDone = step.targets.every((t) => done.has(t));
    if (stepDone) {
      for (const e of step.stepEffects ?? []) effects.push({ fx: e.fx, arg: e.arg ?? target ?? undefined });
      this.index++;
      if (this.finished) this.endedAt = this.now();
    }
    const reading = target !== null ? step.readings?.[target] : undefined;
    return { kind: 'done', step, target, stepDone, lessonDone: this.finished, effects, reading, mistake };
  }

  private mistake(step: StepDef, def: MistakeDef): Verdict {
    const existing = this.mistakes.find((m) => m.code === def.code);
    if (existing) {
      existing.count++;
      return { kind: 'mistake', step, mistake: def, record: existing };
    }
    const record: MistakeRecord = {
      code: def.code,
      kind: def.kind,
      label: def.label,
      explain: def.explain,
      critical: def.kind === 'safety',
      penalty: def.penalty ?? PENALTY[def.kind],
      stepId: step.id,
      count: 1,
    };
    this.mistakes.push(record);
    return { kind: 'mistake', step, mistake: def, record };
  }

  private genericWrongItem(step: StepDef, needItem: ItemId, item: ItemId): MistakeDef {
    const need = needItem === HAND ? 'your hands' : `the ${this.itemName(needItem)}`;
    const used = item === HAND ? 'your bare hand' : `the ${this.itemName(item)}`;
    return {
      code: `${step.id}.wrong_item`,
      kind: 'wrong-item',
      label: `Wrong tool for: ${step.label}`,
      explain: `That's ${used}. For this job you need ${need}.`,
    };
  }

  private genericOrder(step: StepDef): MistakeDef {
    return {
      code: `${step.id}.out_of_order`,
      kind: 'order',
      label: `Skipped ahead before: ${step.label}`,
      explain: `Not yet. Order matters in a service procedure. First: ${step.label.toLowerCase()}.`,
    };
  }

  private genericValue(step: StepDef, dir: 'low' | 'high'): MistakeDef {
    return {
      code: `${step.id}.value_${dir}`,
      kind: 'value',
      label: `${dir === 'low' ? 'Below' : 'Above'} spec: ${step.label}`,
      explain: `That's ${dir === 'low' ? 'below' : 'above'} the specification. Check the spec and try again.`,
    };
  }

  result(): RunResult {
    const penalty = this.mistakes.reduce((sum, m) => sum + m.penalty, 0);
    const score = Math.max(0, 100 - penalty);
    const criticalCount = this.mistakes.filter((m) => m.critical).length;
    const completed = this.finished;
    const end = this.endedAt ?? this.now();
    return {
      completed,
      score,
      passed: completed && score >= PASS_SCORE && criticalCount === 0,
      criticalCount,
      mistakes: this.mistakes.map((m) => ({ ...m })),
      hints: this.hintsUsed,
      durationSec: Math.round((end - this.startedAt) / 1000),
      stepsDone: this.index,
      stepsTotal: this.steps.length,
    };
  }
}

function expectedItem(step: StepDef, target: TargetId): ItemId {
  return step.targetItems?.[target] ?? step.item;
}
