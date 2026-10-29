import { type Object3D, Vector3 } from 'three';
import type { SoundFx } from '../audio/sfx';
import { createRng, randomSeed } from '../core/random';
import type { RunRecord, SaveStore } from '../core/save';
import type { Settings } from '../core/settings';
import { ease, type Tweens } from '../core/tween';
import { format, fromDisplay, stepSize, toDisplay, type UnitSystem } from '../core/units';
import { LINES } from '../guide/lines';
import type { Narrator } from '../guide/narration';
import type { Valkyrie } from '../guide/valkyrie';
import type { Pointer } from '../input/pointer';
import type { ActiveAction, Interaction, InteractionHooks } from '../interaction/interaction';
import { itemName } from '../interaction/item-catalog';
import type { Registry } from '../interaction/registry';
import type { Hud } from '../ui/hud';
import type { Markers } from '../ui/markers';
import { UI } from '../ui/panel';
import { VEHICLES, type WheelPos } from '../vehicles/specs';
import { RAISE_HEIGHT } from '../world/lift';
import type { World } from '../world/world';
import type { ConsequencePlayer } from './consequences';
import { LessonRunner, type Verdict } from './engine/runner';
import {
  type Effect,
  HAND,
  type ItemId,
  type LessonDef,
  type LessonStage,
  type MistakeDef,
  type MistakeRecord,
  type Mode,
  type Reading,
  type RunResult,
  type StepDef,
  type TargetId,
  type VehicleId,
} from './engine/types';

export interface SessionDeps {
  world: World;
  registry: Registry;
  interaction: () => Interaction;
  hud: Hud;
  markers: Markers;
  narrator: Narrator;
  valkyrie: Valkyrie;
  sfx: SoundFx;
  tweens: Tweens;
  consequences: ConsequencePlayer;
  save: SaveStore;
  settings: () => Settings;
  camera: Object3D;
  pointers: () => Pointer[];
  teleport: (spotId: string) => void;
}

export interface FinishInfo {
  lesson: LessonDef;
  mode: Mode;
  result: RunResult;
  record: RunRecord | null;
  vehicleName: string;
}

const MODE_NAME: Record<Mode, string> = { learn: 'Learn', practice: 'Practice', test: 'Test' };

/**
 * Runs one lesson attempt in the world: sets the scene up, feeds actions to the
 * LessonRunner, applies effects, plays consequences, narrates and grades.
 */
export class LessonSession implements InteractionHooks {
  runner: LessonRunner | null = null;
  lesson: LessonDef | null = null;
  mode: Mode = 'learn';
  vehicleId: VehicleId = 'sedan';
  seed = 0;
  /** While true the student cannot act (replays, dialogs, transitions). */
  busy = false;
  torqueSetting = 10;
  onFinish: (info: FinishInfo) => void = () => {};
  onQuit: () => void = () => {};
  private units: UnitSystem = 'us';
  private status = '';
  private narrationToken = 0;
  private fillRedraw = 0;

  constructor(private readonly d: SessionDeps) {}

  get active(): boolean {
    return this.runner !== null;
  }

  start(lesson: LessonDef, mode: Mode, vehicleId: VehicleId, seed = randomSeed()): void {
    const d = this.d;
    this.lesson = lesson;
    this.mode = mode;
    this.vehicleId = vehicleId;
    this.seed = seed;
    this.units = d.settings().units;
    const vehicle = VEHICLES[vehicleId];
    const variant = lesson.variant(createRng(seed), vehicle);
    const steps = lesson.steps(vehicle, variant, this.units);
    this.runner = new LessonRunner(steps, mode, { itemName });
    this.torqueSetting = 10;
    this.status = '';
    this.busy = false;

    d.interaction().releaseAll(d.pointers());
    d.markers.hideTag();
    d.markers.hideReading();
    d.world.setVehicle(vehicleId);
    d.world.reset();
    d.world.layoutCart(lesson.cartItems);
    this.stage = lesson.stage?.(variant, vehicle) ?? {};
    d.world.applyStage(this.stage);
    this.applyFaults(this.stage.faults ?? []);
    this.workOrder = lesson.workOrder(vehicle, variant, this.units);

    d.hud.closeDialog();
    this.refreshClipboard();
    d.valkyrie.setMood('happy');
    d.valkyrie.snapHome(d.camera);
    d.teleport('start');

    const intro = mode === 'learn' ? lesson.intro : mode === 'practice' ? LINES.practiceIntro : LINES.testIntro;
    this.busy = true;
    d.hud.openDialog({
      tone: mode === 'test' ? 'warn' : 'info',
      title: `${lesson.title}: ${MODE_NAME[mode]}`,
      body: `${intro}\n\nVehicle: ${vehicle.name}, ${vehicle.kind}.`,
      buttons: [
        { id: 'begin', label: 'Start', variant: 'primary', onClick: () => this.begin() },
        { id: 'back', label: 'Back to menu', onClick: () => this.quit() },
      ],
    });
    void this.narrate([intro]);
  }

  private workOrder: string[] = [];
  private stage: LessonStage = {};

  /** Visible faults for the inspection lesson (others show up in readings). */
  private applyFaults(faults: string[]): void {
    const w = this.d.world;
    w.vehicle.corrosion.visible = faults.includes('terminals');
    if (faults.includes('leak')) {
      const p = this.d.registry.targetWorldPosition('leak-check');
      if (p) {
        w.puddle.position.set(p.x - 0.35, 0.004, p.z + 0.1);
        w.puddle.scale.setScalar(0.22);
        w.puddle.visible = true;
      }
    }
  }

  private begin(): void {
    this.d.hud.closeDialog();
    this.busy = false;
    this.onStepStart();
  }

  quit(): void {
    this.stopNarration();
    this.d.hud.closeDialog();
    this.d.markers.hideTag();
    this.d.hud.showClipboard(null);
    this.unguide();
    this.d.markers.hideReading();
    this.d.hud.showDial(null, '');
    this.d.interaction().releaseAll(this.d.pointers());
    this.d.sfx.stopAll();
    this.runner = null;
    this.onQuit();
  }

  restart(): void {
    if (this.lesson) this.start(this.lesson, this.mode, this.vehicleId);
  }

  // --- narration ---

  private stopNarration(): void {
    this.narrationToken++;
    this.d.narrator.stop();
  }

  /** Speaks lines in order; a newer call cancels the rest of an older one. */
  async narrate(lines: string[]): Promise<boolean> {
    const token = ++this.narrationToken;
    for (const line of lines) {
      if (token !== this.narrationToken) return false;
      await this.d.narrator.say(line);
    }
    return token === this.narrationToken;
  }

  // --- step presentation ---

  private currentTargets(): TargetId[] {
    return this.runner?.remainingTargets() ?? [];
  }

  private onStepStart(): void {
    const r = this.runner;
    if (!r) return;
    const step = r.current;
    this.refreshClipboard();
    if (!step) return;
    if (step.choice) {
      this.showChoice(step);
      return;
    }
    if (r.awaitingTag) {
      this.showTag(step);
      return;
    }
    if (this.mode === 'learn') {
      this.guide(step);
      void this.narrate([step.say]);
    } else {
      this.unguide();
    }
  }

  /** Learn mode guidance: halos on targets, the needed tool and Valkyrie's spotlight. */
  private guide(step: StepDef): void {
    const targets = this.currentTargets();
    const anchors = targets
      .map((t) => this.d.registry.targets.get(t)?.anchor)
      .filter((a): a is Object3D => !!a)
      .slice(0, step.ordered ? 1 : 6);
    this.d.markers.showTargets(anchors);
    const first = targets[0];
    const need = first ? this.runner?.itemFor(first) : null;
    const item = need && need !== HAND ? this.d.registry.items.get(need) : null;
    const held = this.d.pointers().some((p) => this.d.interaction().heldBy(p) === need);
    this.d.markers.showItem(item && !held ? item.object : null);
    const p = first ? this.d.registry.targetWorldPosition(first) : null;
    this.d.valkyrie.showTarget(p, this.d.camera);
    const spot = p ? this.d.world.nearestSpot(p) : null;
    const cam = this.d.camera.getWorldPosition(new Vector3()).setY(0);
    // Only point at a spot when the student is not already standing near it.
    this.d.world.highlightSpot(spot && spot.position.distanceTo(cam) > 0.8 ? spot.id : null);
  }

  private unguide(): void {
    this.d.markers.showTargets([]);
    this.d.markers.showItem(null);
    this.d.valkyrie.showTarget(null, this.d.camera);
    this.d.world.highlightSpot(null);
  }

  private showChoice(step: StepDef): void {
    const c = step.choice;
    if (!c) return;
    this.busy = true;
    this.unguide();
    this.d.valkyrie.setMood('thinking');
    this.d.hud.openDialog({
      tone: 'question',
      title: step.label,
      body: c.prompt,
      layout: 'stack',
      buttons: c.options.map((label, i) => ({
        id: `opt-${i}`,
        label: `${String.fromCharCode(65 + i)}. ${label}`,
        onClick: () => this.answer(i),
      })),
    });
    if (this.mode === 'learn') void this.narrate([step.say]);
  }

  /** The green / yellow / red popup beside an inspected part. */
  private showTag(step: StepDef): void {
    const tag = step.tag;
    const target = step.targets[step.targets.length - 1];
    const entry = target ? this.d.registry.targets.get(target) : undefined;
    if (!tag || !entry) return;
    this.unguide();
    this.d.valkyrie.setMood('thinking');
    const reading = target ? step.readings?.[target] : undefined;
    const finding = reading ? this.readingText(reading) : '';
    this.d.markers.showTag(
      entry.anchor,
      `${entry.label}: ${tag.prompt}`,
      finding + (reading?.note ? ` ${reading.note}` : ''),
      tag.options,
      (i) => this.answer(i),
    );
  }

  private readingText(r: Reading): string {
    if (r.text) return r.text;
    if (r.quantity && r.value !== undefined) return format(r.quantity, r.value, this.units);
    return '';
  }

  answer(i: number): void {
    const r = this.runner;
    const step = r?.current;
    if (!r || !step || (!step.choice && !r.awaitingTag)) return;
    // A tag popup can't be answered underneath a mistake dialog or the pause menu.
    if (!step.choice && (this.busy || this.d.hud.isDialogOpen)) return;
    const v = r.answer(i);
    this.d.hud.closeDialog();
    this.d.markers.hideTag();
    this.busy = false;
    if (v.kind === 'mistake') {
      void this.handleMistake(v.mistake, v.record, null).then(() => this.onStepStart());
      return;
    }
    if (v.kind === 'done') {
      this.d.sfx.play('step');
      this.d.valkyrie.setMood('happy');
      for (const e of v.effects) this.applyEffect(e, HAND, null);
      const after = () => (v.lessonDone ? this.finish() : this.onStepStart());
      const right = step.choice?.right ?? step.tag?.right;
      if (right) {
        this.busy = true;
        void this.narrate([right]).then(() => {
          this.busy = false;
          after();
        });
      } else after();
    }
  }

  hint(): void {
    const r = this.runner;
    if (!r || this.mode !== 'practice' || this.busy) return;
    const text = r.hint();
    if (!text) return;
    const step = r.current;
    if (step && !step.choice) this.guide(step);
    void this.narrate([text]);
    this.refreshClipboard();
    // Hints show the way briefly, then the halos fade again.
    void this.d.tweens.wait(6).then(() => {
      if (this.mode === 'practice' && this.runner === r) this.unguide();
    });
  }

  refreshClipboard(): void {
    const r = this.runner;
    const lesson = this.lesson;
    if (!r || !lesson) {
      this.d.hud.showClipboard(null);
      return;
    }
    const vehicle = VEHICLES[this.vehicleId];
    const res = r.result();
    this.d.hud.showClipboard({
      title: lesson.title,
      mode: this.mode,
      vehicle: `${vehicle.name} · ${vehicle.engine}`,
      workOrder: this.workOrder,
      steps: r.steps.map((s, i) => ({
        label: s.label,
        done: i < r.currentIndex,
        current: i === r.currentIndex,
        safety: !!s.safety,
      })),
      stepIndex: r.currentIndex,
      stepCount: r.steps.length,
      instruction: r.current?.label ?? 'Done',
      hintsUsed: res.hints,
      status: this.status,
    });
  }

  // --- InteractionHooks ---

  canAct(): boolean {
    return !!this.runner && !this.busy && !this.d.hud.isDialogOpen && !this.d.markers.tagOpen;
  }

  attempt(item: ItemId, target: TargetId): Verdict {
    if (!this.runner) return { kind: 'ignored', reason: 'finished' };
    return this.runner.attempt(item, target);
  }

  complete(target: TargetId, value?: number): Verdict {
    if (!this.runner) return { kind: 'ignored', reason: 'finished' };
    return this.runner.complete(target, value);
  }

  isCurrentTarget(target: TargetId): boolean {
    return this.currentTargets().includes(target);
  }

  expectsHand(target: TargetId): boolean {
    return this.runner?.itemFor(target) === HAND;
  }

  toolSetting(item: ItemId): number {
    return item === 'torque-wrench' ? this.torqueSetting : 0;
  }

  simpleGestures(): boolean {
    return this.d.settings().simpleGestures;
  }

  onHover(): void {}

  onTeleport(spotId: string): void {
    this.d.teleport(spotId);
  }

  onGrab(item: ItemId, pointer: Pointer): void {
    if (item === 'torque-wrench')
      this.d.hud.showDial(
        pointer.holdAnchor.children.find((c) => c.name === 'item:torque-wrench') ?? null,
        this.dialLabel(),
      );
    if (this.mode === 'learn' && this.runner?.current) this.guide(this.runner.current);
  }

  onRelease(item: ItemId): void {
    if (item === 'torque-wrench') this.d.hud.showDial(null, '');
    if (this.mode === 'learn' && this.runner?.current) this.guide(this.runner.current);
  }

  private dialLabel(): string {
    return format('torque', this.torqueSetting, this.units);
  }

  onAdjust(_pointer: Pointer | null, delta: number): void {
    const step = stepSize('torque', this.units);
    const shown = toDisplay('torque', this.torqueSetting, this.units);
    const next = Math.max(5, Math.round((shown + delta * step) / step) * step);
    this.torqueSetting = Math.min(250, fromDisplay('torque', next, this.units));
    this.d.sfx.play('click');
    const holder = this.d.interaction().holderOf('torque-wrench');
    if (holder) {
      const pointer = this.d.pointers().find((p) => p.id === holder);
      const obj = pointer?.holdAnchor.children.find((c) => c.name === 'item:torque-wrench') ?? null;
      this.d.hud.showDial(obj, this.dialLabel());
    }
  }

  onProgress(target: TargetId | null, progress: number, active: ActiveAction | null): void {
    const anchor = target ? (this.d.registry.targets.get(target)?.anchor ?? null) : null;
    const fill = active?.measure?.source === 'fill';
    this.d.markers.progress(
      anchor,
      progress,
      fill && active && active.value > active.measure!.max ? 0xff5c5c : 0x3fbf6f,
    );
    if (!active) {
      this.d.sfx.stopLoop('gesture');
      return;
    }
    // Live effects while holding.
    const w = this.d.world;
    if (active.target === 'jack-handle') {
      const g = active.step.gesture;
      const strokes = g.kind === 'pump' ? g.strokes : 4;
      w.setJackRaise(active.step.id === 'jack-raise' ? progress : 0.97 + 0.09 * progress);
      w.jack.pump(-0.35 * Math.abs(Math.sin(progress * strokes * Math.PI)));
    } else if (active.target === 'jack-release') {
      w.setJackRaise(active.step.id === 'lower' ? 1.06 * (1 - progress) : 1 - 0.03 * progress);
      this.d.sfx.loop('gesture', 'hiss', 0.3);
    } else if (active.target === 'lift-up') {
      this.d.world.setLiftHeight(RAISE_HEIGHT * progress);
      this.d.sfx.loop('gesture', 'lift', 0.5);
    } else if (active.target === 'lift-down') {
      this.d.world.setLiftHeight(RAISE_HEIGHT * (1 - progress));
      this.d.sfx.loop('gesture', 'lift', 0.5);
    } else if (active.item === 'impact-wrench') {
      this.d.sfx.loop('gesture', 'impact', 0.6);
    } else if (fill && active.measure && anchor) {
      this.d.sfx.loop('gesture', active.item === 'air-chuck' ? 'hiss' : 'pour', 0.45);
      this.fillRedraw -= 1;
      if (this.fillRedraw <= 0) {
        this.fillRedraw = 6;
        const label = active.item === 'air-chuck' ? 'Tire pressure' : 'Oil added';
        this.d.markers.showReading(
          anchor,
          label,
          format(active.measure.quantity, active.value, this.units),
          `Target: ${format(active.measure.quantity, active.measure.spec, this.units)}`,
        );
      }
    } else if (active.target === 'recycle-drum') {
      this.d.sfx.loop('gesture', 'pour', 0.45);
    }
  }

  onIgnored(reason: string, target: TargetId, item: ItemId): void {
    if (reason === 'not-yet') {
      this.d.sfx.play('error');
      this.flashStatus(`Not yet: ${this.d.registry.targets.get(target)?.label ?? target} comes later.`);
    } else if (reason === 'done') {
      this.flashStatus('Already done.');
    } else if (reason === 'unrelated' && item !== HAND) {
      this.flashStatus(`The ${itemName(item)} isn't needed there.`);
    }
  }

  private flashStatus(text: string): void {
    this.status = text;
    this.refreshClipboard();
    const s = text;
    void this.d.tweens.wait(4).then(() => {
      if (this.status === s) {
        this.status = '';
        this.refreshClipboard();
      }
    });
  }

  onVerdict(v: Verdict, pointer: Pointer, item: ItemId): void {
    if (v.kind === 'mistake') {
      const at = this.anchorPosition(v.step.targets[0]);
      void this.handleMistake(v.mistake, v.record, at).then(() => {
        if (this.runner && !this.runner.finished) this.onStepStart();
      });
      return;
    }
    if (v.kind !== 'done') return;
    this.d.markers.hideReading();
    for (const e of v.effects) this.applyEffect(e, item, pointer);
    if (v.reading && v.target) {
      const anchor = this.d.registry.targets.get(v.target)?.anchor;
      if (anchor) {
        const label = this.d.registry.targets.get(v.target)?.label ?? '';
        if (!v.tagPending) this.d.markers.showReading(anchor, label, this.readingText(v.reading), v.reading.note);
      }
    }
    if (v.mistake) {
      void this.handleMistake(v.mistake.def, v.mistake.record, this.anchorPosition(v.target ?? undefined)).then(() =>
        this.afterDone(v),
      );
      return;
    }
    this.afterDone(v);
  }

  private afterDone(v: Extract<Verdict, { kind: 'done' }>): void {
    this.d.sfx.play(v.stepDone ? 'step' : 'click');
    this.refreshClipboard();
    if (v.tagPending) {
      this.onStepStart();
      return;
    }
    if (v.lessonDone) {
      this.busy = true;
      void this.d.tweens.wait(0.8).then(() => this.finish());
      return;
    }
    if (!v.stepDone) {
      if (this.mode === 'learn' && this.runner?.current) this.guide(this.runner.current);
      return;
    }
    const why = this.mode === 'learn' ? v.step.why : undefined;
    if (why) {
      this.d.markers.showTargets([]);
      void this.narrate([why]).then((finished) => {
        if (finished && this.runner && !this.runner.finished) this.onStepStart();
      });
      // Let the student continue while the explanation plays.
      void this.d.tweens.wait(0.1).then(() => this.refreshClipboard());
      this.guideNextQuietly();
    } else {
      this.onStepStart();
    }
  }

  /** Shows the next step's halos without interrupting the current explanation. */
  private guideNextQuietly(): void {
    const next = this.runner?.current;
    if (next && !next.choice && this.mode === 'learn') this.guide(next);
  }

  private anchorPosition(target?: TargetId): Vector3 | null {
    if (!target) return null;
    return this.d.registry.targetWorldPosition(target);
  }

  private async handleMistake(def: MistakeDef, record: MistakeRecord, at: Vector3 | null): Promise<void> {
    this.busy = true;
    this.stopNarration();
    this.d.interaction().active = null;
    this.d.markers.progress(null, 0);
    this.d.sfx.stopLoop('gesture');
    const safety = def.kind === 'safety';
    this.d.valkyrie.setMood(safety ? 'alarm' : 'concerned');
    if (def.consequence) {
      this.d.consequences.reducedMotion = this.d.settings().reducedMotion;
      await this.d.consequences.play(def.consequence, at);
    } else {
      this.d.sfx.play('error');
    }
    const repeat = record.count > 1 ? ' (again)' : '';
    const penalty = this.mode === 'learn' ? '' : safety ? ' Safety errors fail a Test.' : ` −${record.penalty} points.`;
    await new Promise<void>((resolve) => {
      this.d.hud.openDialog({
        tone: safety ? 'safety' : 'warn',
        title: `${safety ? 'Safety: ' : ''}${def.label}${repeat}`,
        body: `${def.explain}${record.count === 1 ? penalty : ''}`,
        buttons: [
          {
            id: 'retry',
            label: 'Got it, try again',
            variant: 'primary',
            onClick: () => {
              this.stopNarration();
              this.d.hud.closeDialog();
              resolve();
            },
          },
        ],
      });
      void this.narrate([def.explain]);
    });
    this.d.valkyrie.setMood('happy');
    this.busy = false;
    this.refreshClipboard();
  }

  private finish(): void {
    const r = this.runner;
    const lesson = this.lesson;
    if (!r || !lesson) return;
    this.busy = true;
    this.unguide();
    this.d.interaction().releaseAll(this.d.pointers());
    this.d.hud.showDial(null, '');
    const result = r.result();
    const vehicle = VEHICLES[this.vehicleId];
    const record = this.d.save.recordRun({
      ...result,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      mode: this.mode,
      vehicleName: vehicle.name,
    });
    this.d.sfx.play(result.passed || this.mode === 'learn' ? 'success' : 'error');
    this.d.valkyrie.setMood(result.passed || this.mode === 'learn' ? 'happy' : 'concerned');
    this.onFinish({ lesson, mode: this.mode, result, record, vehicleName: vehicle.name });
  }

  // --- world effects ---

  private applyEffect(e: Effect, item: ItemId, pointer: Pointer | null): void {
    const w = this.d.world;
    const v = w.vehicle;
    const reg = this.d.registry;
    const tw = this.d.tweens;
    const sfx = this.d.sfx;
    const arg = e.arg ?? '';
    const wheelOf = (id: string) => id.split('-').pop() as WheelPos;
    const frontOf = (id: string) => (id.endsWith('FR') ? 'FR' : 'FL') as 'FL' | 'FR';
    const consume = (id: ItemId) => {
      this.d.interaction().consume(id);
      reg.setItemAvailable(id, false);
      if (id === 'torque-wrench') this.d.hud.showDial(null, '');
    };
    /** Takes an item out of the hand and leaves it somewhere new (still in the world). */
    const place = (id: ItemId, parent: Object3D, at: Vector3, grabbable: boolean) => {
      this.d.interaction().consume(id);
      reg.rehome(id, parent, at);
      const entry = reg.items.get(id);
      if (entry) {
        entry.object.scale.setScalar(1);
        entry.available = true;
        entry.object.visible = true;
        entry.collider.userData.enabled = grabbable;
      }
    };
    switch (e.fx) {
      case 'ppe':
        if (arg === 'ppe-glasses') w.ppeGlasses.visible = false;
        if (arg === 'ppe-gloves') w.ppeGloves.visible = false;
        sfx.play('pickup');
        break;
      case 'hood-open':
        void tw.run(0.8, (t) => v.setHoodOpen(true, ease.inOut(t)));
        break;
      case 'hood-close':
        void tw.run(0.8, (t) => v.setHoodOpen(true, 1 - ease.inOut(t)));
        break;
      case 'fillcap-off': {
        const home = v.fillCapHome;
        void tw.run(0.5, (t) => {
          v.fillCap.position.set(home.x + 0.25 * t, home.y + 0.1 * Math.sin(t * Math.PI), home.z + 0.45 * t);
        });
        break;
      }
      case 'fillcap-on': {
        const home = v.fillCapHome;
        void tw.run(0.5, (t) => {
          const k = 1 - t;
          v.fillCap.position.set(home.x + 0.25 * k, home.y + 0.1 * Math.sin(t * Math.PI), home.z + 0.45 * k);
        });
        break;
      }
      case 'arm-place': {
        const pos = wheelOf(arg);
        sfx.play('clunk');
        void tw.run(0.6, (t) => w.lift.swingArm(pos, ease.inOut(t))).then(() => w.lift.setArmPlaced(pos, true));
        break;
      }
      case 'lift-raise':
        w.setLiftHeight(RAISE_HEIGHT);
        break;
      case 'lift-lock':
        w.lift.setLocked(true);
        sfx.play('clunk');
        void tw.run(0.2, (t) => w.setLiftHeight(RAISE_HEIGHT - 0.03 * t));
        break;
      case 'lift-lower':
        w.lift.setLocked(false);
        w.setLiftHeight(0);
        sfx.stopLoop('gesture');
        if (
          reg.items.get('drain-pan')?.object.parent === w.scene &&
          !reg.items.get('drain-pan')?.collider.userData.enabled
        ) {
          // Slide the pan out from under the car so it can be carried to recycling.
          const plug = v.layout.at.drainPlug;
          reg.rehome('drain-pan', w.scene, new Vector3(w.carX + plug[0] + 1.0, 0, 1.25));
          reg.items.get('drain-pan')!.collider.userData.enabled = true;
        }
        break;
      case 'pan-place': {
        const spot = reg.targetWorldPosition('pan-spot') ?? new Vector3(1.78, 0, 0.08);
        this.d.interaction().consume('drain-pan');
        reg.rehome('drain-pan', w.scene, new Vector3(spot.x, 0, spot.z));
        reg.items.get('drain-pan')!.collider.userData.enabled = false;
        break;
      }
      case 'drain-oil': {
        v.drainPlug.visible = false;
        reg.setItemAvailable('drain-plug', true);
        reg.rehome('drain-plug', w.trayPlug, new Vector3());
        w.panOil.visible = true;
        w.oilStream.visible = true;
        sfx.loop('drain', 'pour', 0.45);
        void tw
          .run(4, (t) => {
            const from = reg.targetWorldPosition('drain-plug') ?? new Vector3();
            this.d.consequences.placeStream(from, 0.1);
            w.panOil.scale.set(1, 1 + t * 4, 1);
            w.panOil.position.y = 0.02 + t * 0.03;
          })
          .then(() => {
            w.oilStream.visible = false;
            sfx.stopLoop('drain');
          });
        break;
      }
      case 'washer-new':
        consume('new-washer');
        sfx.play('click');
        break;
      case 'filter-off':
        v.oilFilter.visible = false;
        sfx.play('drop');
        break;
      case 'mount-clean':
      case 'filter-lube':
      case 'placard':
      case 'gauge-pressure':
      case 'gauge-tread':
      case 'inspect':
      case 'pack-power':
        sfx.play('click');
        break;
      case 'filter-on':
        consume('new-filter');
        v.oilFilter.visible = true;
        break;
      case 'plug-in':
        consume('drain-plug');
        v.drainPlug.visible = true;
        break;
      case 'plug-torque':
        sfx.play('torque-click');
        break;
      case 'oil-pick': {
        for (const [grade, jug] of w.oilJugs)
          if (arg.endsWith(grade.toLowerCase().replace(/[^a-z0-9]/g, ''))) jug.visible = false;
        reg.setItemAvailable('oil-bottle', true);
        sfx.play('pickup');
        break;
      }
      case 'oil-fill':
      case 'inflate':
        sfx.stopLoop('gesture');
        break;
      case 'engine-run':
      case 'donor-start': {
        sfx.play('engine');
        const root = e.fx === 'donor-start' ? w.donor.root : v.root;
        const x = root.position.x;
        void tw.run(1.5, (t) => {
          root.position.x = x + Math.sin(t * 90) * 0.0015 * (1 - t);
        });
        break;
      }
      case 'engine-off':
        sfx.play('click');
        v.setLights(false);
        break;
      case 'dipstick': {
        const y = v.dipstickHome.y;
        void tw.run(1.6, (t) => {
          v.dipstick.position.y = y + Math.sin(t * Math.PI) * 0.4;
        });
        break;
      }
      case 'oil-recycle':
        w.panOil.visible = false;
        sfx.stopLoop('gesture');
        break;
      case 'wheel-off': {
        const pos = wheelOf(arg);
        const part = v.removeWheel(pos);
        if (part) w.parkWheel(part.origin, pos);
        sfx.stopLoop('gesture');
        break;
      }
      case 'wheel-place': {
        const hubPos = wheelOf(arg);
        const origin = item.startsWith('wheel-') ? (item.slice(6) as WheelPos) : null;
        if (!origin) break;
        this.d.interaction().consume(item);
        v.mountWheel(hubPos, origin);
        const entry = reg.items.get(item);
        if (entry) {
          entry.home = {
            parent: v.wheels[hubPos].hub,
            position: new Vector3(),
            quaternion: entry.object.quaternion.clone().identity(),
          };
          entry.collider.userData.enabled = false;
        }
        sfx.play('clunk');
        break;
      }
      case 'lugs-hand':
        v.setLugsVisible(wheelOf(arg), true);
        break;
      case 'lug-torque': {
        const parts = arg.split('-');
        v.markLug(parts[1] as WheelPos, Number(parts[2]));
        sfx.play('torque-click');
        break;
      }
      case 'wheel-torque': {
        const pos = wheelOf(arg);
        for (let i = 0; i < v.spec.tires.lugsPerWheel; i++) v.markLug(pos, i);
        sfx.play('torque-click');
        break;
      }
      // --- brakes ---
      case 'chock':
        w.placeChock(arg.endsWith('RR') ? 1 : 0);
        sfx.play('clunk');
        break;
      case 'jack-place':
        w.placeJack();
        sfx.play('clunk');
        break;
      case 'jack-raise':
        w.setJackRaise(1);
        w.jack.pump(0);
        break;
      case 'stand-place':
        w.placeStand(arg.endsWith('FR') ? 1 : 0, true);
        sfx.play('clunk');
        break;
      case 'stands-out':
        w.setJackRaise(1.06);
        w.placeStand(0, false);
        w.placeStand(1, false);
        w.jack.pump(0);
        sfx.play('clunk');
        break;
      case 'jack-lower': {
        const from = w.jackRaise;
        const to = arg === 'ground' ? 0 : 0.97;
        sfx.play('hiss');
        void tw.run(arg === 'ground' ? 1.2 : 0.4, (t) => w.setJackRaise(from + (to - from) * ease.inOut(t)));
        break;
      }
      case 'shake': {
        const root = v.root;
        sfx.play('clunk');
        void tw.run(0.8, (t) => {
          root.rotation.x = Math.sin(t * 40) * 0.006 * (1 - t);
        });
        break;
      }
      case 'caliper-off': {
        const cal = reg.items.get(`caliper-${frontOf(arg)}`);
        if (cal) cal.collider.userData.enabled = true;
        sfx.play('ratchet');
        break;
      }
      case 'caliper-hang': {
        const pos = frontOf(arg);
        const b = v.brakes[pos];
        place(`caliper-${pos}`, v.wheels[pos].hub, b.caliperHung, true);
        v.setCaliper(pos, 'hung');
        const cal = reg.items.get(`caliper-${pos}`);
        if (cal) cal.home.quaternion.copy(b.caliper.quaternion);
        sfx.play('clunk');
        break;
      }
      case 'caliper-on': {
        const pos = frontOf(arg);
        const b = v.brakes[pos];
        place(`caliper-${pos}`, v.wheels[pos].hub, b.caliperHome, false);
        v.setCaliper(pos, 'home');
        const cal = reg.items.get(`caliper-${pos}`);
        if (cal) cal.home.quaternion.copy(b.caliper.quaternion);
        sfx.play('clunk');
        break;
      }
      case 'pads-out': {
        const pos = frontOf(arg);
        const pad = v.brakes[pos].pads[arg.startsWith('pad-outer') ? 0 : 1];
        if (pad) pad.visible = false;
        sfx.play('drop');
        break;
      }
      case 'pads-in':
        consume('new-pads');
        v.setPadsVisible(frontOf(arg), true);
        sfx.play('click');
        break;
      case 'piston': {
        const res = reg.targets.get('brake-reservoir');
        if (res)
          this.d.markers.showReading(
            res.anchor,
            'Brake fluid reservoir',
            'Level rose to MAX',
            'Fluid pushed back from the caliper',
          );
        break;
      }
      case 'pedal':
        sfx.play('click');
        void tw.wait(0.3).then(() => sfx.play('click'));
        break;
      case 'drive-off':
        sfx.play('engine');
        break;
      // --- battery ---
      case 'cable-off':
        v.setCable(arg.endsWith('neg') ? 'neg' : 'pos', false);
        sfx.play('click');
        break;
      case 'cable-on':
        v.setCable(arg.endsWith('neg') ? 'neg' : 'pos', true);
        sfx.play('click');
        break;
      case 'holddown':
        sfx.play('ratchet');
        break;
      case 'battery-out': {
        const L = v.layout;
        const floor = new Vector3(w.carX + L.at.battery[0] + 0.3, 0.09, -L.halfWidth - 0.35);
        place('old-battery', w.scene, floor, true);
        sfx.play('clunk');
        break;
      }
      case 'battery-core':
        place('old-battery', w.coreShelf, new Vector3(0, 0.08, 0), false);
        sfx.play('clunk');
        break;
      case 'battery-in': {
        const pos = v.batteryHome.clone().add(new Vector3(0, -v.layout.at.batterySize[1] / 2, 0));
        place('battery-new', v.root, pos, false);
        const entry = reg.items.get('battery-new');
        if (entry) entry.object.quaternion.identity();
        sfx.play('clunk');
        break;
      }
      case 'clean':
        v.corrosion.visible = false;
        sfx.play('ratchet');
        break;
      case 'clamp-on':
        w.setClamp(arg, true);
        sfx.play('click');
        break;
      case 'clamp-off':
        w.setClamp(arg, false);
        sfx.play('click');
        break;
      // --- inspection ---
      case 'lights-on': {
        const out = (this.stage.faults ?? []).find((f) => f.startsWith('lamp-'));
        v.setLights(true, out ?? null);
        sfx.play('click');
        break;
      }
      case 'lights-off':
        v.setLights(false);
        break;
    }
    void pointer;
  }

  /** Color for a report-card score. */
  static scoreColor(r: RunResult, mode: Mode): string {
    if (mode === 'learn') return UI.accent;
    return r.passed ? UI.good : UI.bad;
  }
}
