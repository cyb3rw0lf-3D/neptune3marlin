import type { Rng } from '../../core/random';
import type { Quantity, UnitSystem } from '../../core/units';
import type { VehicleSpec } from '../../vehicles/specs';

export type LessonId =
  | 'oil-change'
  | 'tire-service'
  | 'brakes'
  | 'battery'
  | 'inspection'
  | 'obd2'
  | 'spark-plugs'
  | 'ev-safety';

export type Mode = 'learn' | 'practice' | 'test';
export type VehicleId = 'sedan' | 'pickup' | 'ev';
export type ItemId = string;
export type TargetId = string;
/** The empty hand, used for actions that need no tool. */
export const HAND = 'hand';

export type Gesture =
  | { kind: 'press' }
  | { kind: 'hold'; seconds: number }
  | { kind: 'twist'; turns: number; dir: 'cw' | 'ccw' }
  /** Pump a handle up and down (floor jack). */
  | { kind: 'pump'; strokes: number };

/**
 * wrong-item: the wrong tool or part. order: a step done too early.
 * value: a spec outside tolerance. procedure: a wrong technique.
 * safety: a safety-critical error, which fails a Test run.
 */
export type MistakeKind = 'wrong-item' | 'order' | 'value' | 'procedure' | 'safety';

export const PENALTY: Record<MistakeKind, number> = {
  'wrong-item': 2,
  order: 5,
  value: 10,
  procedure: 10,
  safety: 25,
};

export interface MistakeDef {
  /** Stable code used by report cards and the teacher dashboard, e.g. "oil.drain.no_pan". */
  code: string;
  kind: MistakeKind;
  /** Short report-card label. */
  label: string;
  /** What would happen and why, spoken by Valkyrie. */
  explain: string;
  consequence?: ConsequenceId;
  penalty?: number;
}

export type ConsequenceId =
  | 'car-drop'
  | 'car-tilt'
  | 'oil-spill'
  | 'oil-leak'
  | 'stripped-thread'
  | 'eye-splash'
  | 'wheel-wobble'
  | 'overfill'
  | 'tire-overinflate'
  | 'buzz'
  | 'car-slip'
  | 'caliper-hose'
  | 'spark'
  | 'pedal-sink'
  | 'fan-spin'
  | 'hot-steam'
  | 'wheel-spin';

export interface Measure {
  quantity: Quantity;
  /** Specs are always in US units; the UI converts. */
  spec: number;
  min: number;
  max: number;
  /** setting: read from the tool's dial (torque wrench). fill: accumulates while held. */
  source: 'setting' | 'fill';
  /** fill only: amount added per second of holding, in US units. */
  rate?: number;
  /** fill only: starting amount. */
  start?: number;
  over?: MistakeDef;
  under?: MistakeDef;
}

export interface Choice {
  prompt: string;
  options: string[];
  correct: number;
  wrong: MistakeDef;
  /** A different mistake for particular wrong options (e.g. missing a fault vs. flagging a good part). */
  wrongByOption?: Record<number, MistakeDef>;
  /** Spoken after a correct answer. */
  right?: string;
}

export interface Reading {
  quantity?: Quantity;
  value?: number;
  /** Shown instead of a number for things judged by eye ("Deep cracks across the ribs"). */
  text?: string;
  note?: string;
}

export type FxName =
  | 'ppe'
  | 'hood-open'
  | 'hood-close'
  | 'fillcap-off'
  | 'fillcap-on'
  | 'arm-place'
  | 'lift-raise'
  | 'lift-lock'
  | 'lift-lower'
  | 'pan-place'
  | 'drain-oil'
  | 'washer-new'
  | 'filter-off'
  | 'mount-clean'
  | 'filter-lube'
  | 'filter-on'
  | 'plug-in'
  | 'plug-torque'
  | 'oil-pick'
  | 'oil-fill'
  | 'engine-run'
  | 'dipstick'
  | 'oil-recycle'
  | 'placard'
  | 'gauge-pressure'
  | 'inflate'
  | 'gauge-tread'
  | 'wheel-off'
  | 'wheel-place'
  | 'lugs-hand'
  | 'lug-torque'
  | 'wheel-torque'
  | 'chock'
  | 'jack-place'
  | 'jack-raise'
  | 'stand-place'
  | 'stands-out'
  | 'jack-lower'
  | 'shake'
  | 'caliper-off'
  | 'caliper-hang'
  | 'caliper-on'
  | 'pads-out'
  | 'pads-in'
  | 'piston'
  | 'pedal'
  | 'drive-off'
  | 'cable-off'
  | 'cable-on'
  | 'holddown'
  | 'battery-out'
  | 'battery-in'
  | 'battery-core'
  | 'clean'
  | 'clamp-on'
  | 'clamp-off'
  | 'pack-power'
  | 'donor-start'
  | 'lights-on'
  | 'lights-off'
  | 'engine-off'
  | 'inspect';

export interface Effect {
  fx: FxName;
  /** Defaults to the target that was completed. */
  arg?: string;
}

export interface StepDef {
  id: string;
  /** Checklist label, e.g. "Remove the drain plug". */
  label: string;
  /** Learn-mode narration. */
  say: string;
  /** Practice-mode hint. */
  hint: string;
  /** Extra explanation spoken after the step in Learn mode. */
  why?: string;
  /** Work spot the student should stand at. */
  spot?: string;
  item: ItemId;
  /** All targets must be done. Any order unless `ordered`. Empty for choice steps. */
  targets: TargetId[];
  ordered?: boolean;
  gesture: Gesture;
  measure?: Measure;
  choice?: Choice;
  /** Steps that must be complete first. A missing one raises its skipMistake. */
  requires?: string[];
  /** Raised when a later step that requires this one is attempted too early. */
  skipMistake?: MistakeDef;
  /** Per-target item, for steps where each target needs a different part (e.g. wheels). */
  targetItems?: Record<TargetId, ItemId>;
  wrongItems?: Record<ItemId, MistakeDef>;
  /** Used for any wrong item not listed in wrongItems. */
  wrongItem?: MistakeDef;
  wrongTargets?: Record<TargetId, MistakeDef>;
  orderMistake?: MistakeDef;
  /** Applied as each target completes (arg defaults to the target id). */
  effects?: Effect[];
  /** Applied once the whole step completes. */
  stepEffects?: Effect[];
  readings?: Record<TargetId, Reading>;
  /**
   * Inspection call made right after the targets are done: the student tags the
   * part green, yellow or red on a popup beside it. The step finishes on the right call.
   */
  tag?: Choice;
  /** Marked as a safety step on the checklist. */
  safety?: boolean;
}

/** How a lesson wants the bay set up (see World.applyStage). */
export interface LessonStage {
  carNoseX?: number;
  donor?: boolean;
  jumpPack?: boolean;
  jack?: boolean;
  hoodOpen?: boolean;
  drainPan?: boolean;
  /** Visible faults for the inspection lesson. */
  faults?: string[];
}

export interface LessonDef<V = unknown> {
  id: LessonId;
  title: string;
  /** One-line card description. */
  summary: string;
  available: boolean;
  vehicles: VehicleId[];
  /** Tools and parts laid out on the cart (correct ones plus look-alikes). */
  cartItems: ItemId[];
  intro: string;
  outro: string;
  variant(rng: Rng, vehicle: VehicleSpec): V;
  /** Specs printed on the clipboard work order. */
  workOrder(vehicle: VehicleSpec, variant: V, units: UnitSystem): string[];
  /** Bay arrangement for this run. */
  stage?(variant: V, vehicle: VehicleSpec): LessonStage;
  steps(vehicle: VehicleSpec, variant: V, units: UnitSystem): StepDef[];
}

export interface MistakeRecord {
  code: string;
  kind: MistakeKind;
  label: string;
  explain: string;
  critical: boolean;
  penalty: number;
  stepId: string;
  count: number;
}

export interface RunResult {
  completed: boolean;
  score: number;
  passed: boolean;
  criticalCount: number;
  mistakes: MistakeRecord[];
  hints: number;
  durationSec: number;
  stepsDone: number;
  stepsTotal: number;
}

export const PASS_SCORE = 80;
