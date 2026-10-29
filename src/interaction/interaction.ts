import { type Intersection, type Object3D, Raycaster, Vector3 } from 'three';
import type { SoundFx } from '../audio/sfx';
import { PumpTracker, TwistTracker } from '../input/gestures';
import type { Pointer } from '../input/pointer';
import type { Verdict } from '../lessons/engine/runner';
import { HAND, type ItemId, type Measure, type StepDef, type TargetId } from '../lessons/engine/types';
import type { Panel } from '../ui/panel';
import type { PickInfo, Registry } from './registry';

export interface InteractionHooks {
  /** Whether lesson actions are allowed right now (no dialog, no replay running). */
  canAct(): boolean;
  attempt(item: ItemId, target: TargetId): Verdict;
  complete(target: TargetId, value?: number): Verdict;
  /** Is this target part of the current step (used to prefer it among overlapping hits)? */
  isCurrentTarget(target: TargetId): boolean;
  expectsHand(target: TargetId): boolean;
  /** Value of a 'setting' measure (the torque wrench dial), in US units. */
  toolSetting(item: ItemId): number;
  onVerdict(v: Verdict, pointer: Pointer, item: ItemId): void;
  onIgnored(reason: string, target: TargetId, item: ItemId): void;
  onTeleport(spotId: string): void;
  onGrab(item: ItemId, pointer: Pointer): void;
  onRelease(item: ItemId): void;
  onProgress(target: TargetId | null, progress: number, active: ActiveAction | null): void;
  onHover(pick: PickInfo | null, object: Object3D | null): void;
  onAdjust(pointer: Pointer, delta: number): void;
  simpleGestures(): boolean;
}

export interface ActiveAction {
  pointer: Pointer;
  item: ItemId;
  target: TargetId;
  step: StepDef;
  kind: 'hold' | 'twist' | 'pump';
  seconds: number;
  progress: number;
  twist: TwistTracker | null;
  pump: PumpTracker | null;
  measure?: Measure;
  /** Accumulated value for fill measures. */
  value: number;
  /** Seconds since the last ratchet click sound. */
  soundTimer: number;
}

interface Hit {
  pick: PickInfo;
  object: Object3D;
  distance: number;
  point: Vector3;
  uv?: { x: number; y: number };
}

const HOLD_TWIST_SECONDS_PER_TURN = 1.1;
const HOLD_SECONDS_PER_PUMP = 0.45;
/**
 * A part may sit this far behind the surface in front of it and still be
 * picked, so things mounted on a surface (lug nuts, terminals) stay usable.
 */
export const OCCLUSION_TOLERANCE = 0.03;
const _center = new Vector3();
const _dir = new Vector3();

/**
 * Turns pointer input into grabbing tools, using them on targets with gestures,
 * clicking panels and teleporting. All lesson decisions are delegated to hooks.
 */
export class Interaction {
  private raycaster = new Raycaster();
  readonly held = new Map<string, ItemId>();
  active: ActiveAction | null = null;
  /** Partial progress per target so a released twist can be resumed. */
  private partial = new Map<string, number>();
  /** Fill measures keep their value between holds. */
  readonly fillValues = new Map<string, number>();
  panels: Panel[] = [];
  hover = new Map<string, Hit | null>();
  private stickLatch = new Map<string, boolean>();

  constructor(
    private readonly registry: Registry,
    private readonly hooks: InteractionHooks,
    private readonly sfx: SoundFx,
  ) {
    this.raycaster.far = 12;
  }

  heldBy(pointer: Pointer): ItemId | null {
    return this.held.get(pointer.id) ?? null;
  }

  /** The pointer currently holding an item, if any. */
  holderOf(item: ItemId): string | null {
    for (const [p, i] of this.held) if (i === item) return p;
    return null;
  }

  private raycast(pointer: Pointer): Hit[] {
    this.raycaster.ray.copy(pointer.ray);
    const objects: Object3D[] = [];
    for (const c of this.registry.colliders) if (c.userData.enabled && isShown(c)) objects.push(c);
    for (const p of this.panels) if (p.mesh.visible && isShown(p.mesh)) objects.push(p.mesh);
    const hits: Intersection[] = this.raycaster.intersectObjects(objects, false);
    const wall = this.nearestOccluder();
    const out: Hit[] = [];
    const heldItem = this.held.get(pointer.id);
    for (const h of hits) {
      const pick = h.object.userData.pick as PickInfo | undefined;
      if (!pick) continue;
      // Solid things in front of a part block it; menus and dialogs float above everything.
      if (pick.kind !== 'ui' && h.distance > wall + OCCLUSION_TOLERANCE) continue;
      if (pick.kind === 'item' && (pick.id === heldItem || this.holderOf(pick.id))) continue;
      out.push({
        pick,
        object: h.object,
        distance: h.distance,
        point: h.point.clone(),
        uv: h.uv ? { x: h.uv.x, y: h.uv.y } : undefined,
      });
    }
    return out;
  }

  /** Distance along the current ray to the first solid surface (Infinity if none). */
  private nearestOccluder(): number {
    const shown = this.registry.occluders.filter(isShown);
    const hit = this.raycaster.intersectObjects(shown, false)[0];
    return hit ? hit.distance : Number.POSITIVE_INFINITY;
  }

  /** Whether a target can be pointed at from an eye position (nothing solid in the way). */
  canSee(eye: Vector3, target: TargetId): boolean {
    const entry = this.registry.targets.get(target);
    if (!entry) return false;
    const center = entry.collider.getWorldPosition(new Vector3());
    _dir.subVectors(center, eye).normalize();
    this.raycaster.ray.set(eye, _dir);
    const hit = this.raycaster.intersectObject(entry.collider, false)[0];
    if (!hit) return false;
    return hit.distance <= this.nearestOccluder() + OCCLUSION_TOLERANCE;
  }

  /** Picks the most useful hit, since colliders overlap (a lug inside a wheel, a jug that is also a target). */
  private choose(hits: Hit[], holding: ItemId | null): Hit | null {
    if (hits.length === 0) return null;
    const first = hits[0] as Hit;
    if (first.pick.kind === 'ui') return first;
    const near = hits.filter((h) => h.distance <= first.distance + 0.35 && h.pick.kind !== 'ui');
    const targets = near.filter((h) => h.pick.kind === 'target');
    // Overlapping tools: prefer the one whose center is closest to the ray.
    const items = near
      .filter((h) => h.pick.kind === 'item')
      .sort((a, b) => this.rayOffset(a.object) - this.rayOffset(b.object));
    const current = targets.find((h) => this.hooks.isCurrentTarget((h.pick as { id: string }).id));
    if (holding) {
      if (current) return current;
      if (targets[0]) return targets[0];
      if (items[0]) return items[0];
    } else {
      const handTarget = targets.find(
        (h) =>
          this.hooks.isCurrentTarget((h.pick as { id: string }).id) &&
          this.hooks.expectsHand((h.pick as { id: string }).id),
      );
      if (handTarget) return handTarget;
      if (items[0]) return items[0];
      if (current) return current;
      if (targets[0]) return targets[0];
    }
    return near[0] ?? first;
  }

  private rayOffset(o: Object3D): number {
    return this.raycaster.ray.distanceToPoint(o.getWorldPosition(_center));
  }

  hitFor(pointer: Pointer): Hit | null {
    return this.hover.get(pointer.id) ?? null;
  }

  /** True when the pointer is over anything interactive (desktop: click vs. drag-to-look). */
  isInteractive(pointer: Pointer): boolean {
    const hit = this.choose(this.raycast(pointer), this.heldBy(pointer));
    return !!hit && hit.pick.kind !== 'floor';
  }

  update(dt: number, pointers: Pointer[]): void {
    for (const pointer of pointers) {
      if (!pointer.connected) continue;
      const hits = this.raycast(pointer);
      const hit = this.choose(hits, this.heldBy(pointer));
      this.hover.set(pointer.id, hit);
      this.hooks.onHover(hit?.pick ?? null, hit?.object ?? null);

      if (this.active && this.active.pointer === pointer) {
        this.continueAction(dt, pointer);
        // A quick click can release one action and press again within one slow frame.
        if (!this.active && pointer.selectDown) this.onSelect(pointer, hit);
      } else if (pointer.selectDown) {
        this.onSelect(pointer, hit);
      }

      if (pointer.squeezeDown) this.onSqueeze(pointer, hit);
      this.handleStick(pointer);
    }
    this.updatePanelHover();
  }

  private updatePanelHover(): void {
    for (const p of this.panels) {
      let id: string | null = null;
      for (const hit of this.hover.values()) {
        if (hit?.pick.kind === 'ui' && hit.object === p.mesh && hit.uv) {
          id = p.hit(hit.uv)?.id ?? null;
          if (id) break;
        }
      }
      p.setHover(id);
    }
  }

  private onSelect(pointer: Pointer, hit: Hit | null): void {
    if (!hit) return;
    const pick = hit.pick;
    if (pick.kind === 'ui') {
      const panel = this.panels.find((p) => p.mesh === hit.object);
      if (panel && hit.uv) {
        const b = panel.hit(hit.uv);
        if (b) {
          this.sfx.play('click');
          b.onClick();
        }
      }
      return;
    }
    if (pick.kind === 'spot') {
      this.hooks.onTeleport(pick.id);
      return;
    }
    if (pick.kind === 'item') {
      this.grab(pointer, pick.id);
      return;
    }
    if (pick.kind === 'target') {
      if (!this.hooks.canAct()) return;
      const item = this.heldBy(pointer) ?? HAND;
      this.useOn(pointer, item, pick.id);
    }
  }

  /** Starts using an item (or the hand) on a target; press gestures finish immediately. */
  useOn(pointer: Pointer, item: ItemId, target: TargetId): Verdict {
    const v = this.hooks.attempt(item, target);
    if (v.kind === 'start') {
      if (v.gesture.kind === 'press') {
        const value = v.measure?.source === 'setting' ? this.hooks.toolSetting(item) : undefined;
        const done = this.hooks.complete(target, value);
        this.hooks.onVerdict(done, pointer, item);
        return done;
      }
      const key = `${v.step.id}:${target}`;
      const g = v.gesture;
      const twist = g.kind === 'twist' ? new TwistTracker(g.turns, g.dir) : null;
      const pump = g.kind === 'pump' ? new PumpTracker(g.strokes, pointer.canTwist ? 0.1 : 0.06) : null;
      const saved = this.partial.get(key) ?? 0;
      if (twist) twist.advance(saved * twist.turns * Math.PI * 2);
      if (pump) {
        pump.strokes = Math.round(saved * pump.needed);
        // Every press of the handle is one stroke, so clicking or tapping works too.
        pump.click();
        this.sfx.play('clunk');
      }
      const fillStart = v.measure?.source === 'fill' ? (this.fillValues.get(key) ?? v.measure.start ?? 0) : 0;
      const progress = pump ? pump.progress : saved;
      this.active = {
        pointer,
        item,
        target,
        step: v.step,
        kind: g.kind,
        seconds:
          g.kind === 'hold'
            ? g.seconds
            : g.kind === 'twist'
              ? g.turns * HOLD_TWIST_SECONDS_PER_TURN
              : g.strokes * HOLD_SECONDS_PER_PUMP,
        progress,
        twist,
        pump,
        measure: v.measure,
        value: fillStart,
        soundTimer: 0,
      };
      if (pump && pump.progress >= 1) {
        this.finishAction(pointer);
        return v;
      }
      this.hooks.onProgress(target, progress, this.active);
      return v;
    }
    if (v.kind === 'mistake') this.hooks.onVerdict(v, pointer, item);
    else if (v.kind === 'ignored') this.hooks.onIgnored(v.reason, target, item);
    return v;
  }

  private continueAction(dt: number, pointer: Pointer): void {
    const a = this.active as ActiveAction;
    const key = `${a.step.id}:${a.target}`;
    if (!pointer.select) {
      // Released before finishing.
      this.active = null;
      if (a.measure?.source === 'fill') {
        this.fillValues.set(key, a.value);
        const v = this.hooks.complete(a.target, a.value);
        if (v.kind !== 'ignored') this.hooks.onVerdict(v, pointer, a.item);
      } else {
        this.partial.set(key, a.progress);
      }
      a.twist?.release();
      a.pump?.release();
      this.hooks.onProgress(null, 0, null);
      return;
    }
    if (a.measure?.source === 'fill') {
      a.value += (a.measure.rate ?? 1) * dt;
      a.progress = Math.min(1, a.value / a.measure.spec);
      this.hooks.onProgress(a.target, a.progress, a);
      if (a.value > a.measure.max) {
        this.active = null;
        this.fillValues.set(key, a.measure.spec);
        this.hooks.onProgress(null, 0, null);
        this.hooks.onVerdict(this.hooks.complete(a.target, a.value), pointer, a.item);
      }
      return;
    }
    if (a.pump) {
      if (this.hooks.simpleGestures()) {
        a.progress = Math.min(1, a.progress + dt / a.seconds);
      } else {
        const signal = pointer.canTwist ? pointer.ray.origin.y : pointer.ray.direction.y;
        if (a.pump.update(signal)) this.sfx.play('clunk');
        a.progress = a.pump.progress;
      }
    } else if (a.twist) {
      const useHold = !pointer.canTwist || this.hooks.simpleGestures();
      if (useHold) a.twist.advance((dt / HOLD_TWIST_SECONDS_PER_TURN) * Math.PI * 2);
      else a.twist.update(pointer.ray.direction, pointer.up);
      a.progress = a.twist.progress;
      a.soundTimer += dt;
      if (a.soundTimer > 0.3 && (useHold || a.twist.turned > 0)) {
        a.soundTimer = 0;
        if (a.item !== HAND) this.sfx.play('ratchet');
      }
    } else {
      a.progress = Math.min(1, a.progress + dt / a.seconds);
    }
    this.hooks.onProgress(a.target, a.progress, a);
    if (a.progress >= 1) this.finishAction(pointer);
  }

  private finishAction(pointer: Pointer): void {
    const a = this.active as ActiveAction;
    this.active = null;
    this.partial.delete(`${a.step.id}:${a.target}`);
    this.hooks.onProgress(null, 0, null);
    const value = a.measure?.source === 'setting' ? this.hooks.toolSetting(a.item) : undefined;
    this.hooks.onVerdict(this.hooks.complete(a.target, value), pointer, a.item);
  }

  grab(pointer: Pointer, id: ItemId): void {
    const item = this.registry.items.get(id);
    if (!item?.available) return;
    const current = this.heldBy(pointer);
    if (current === id) return;
    if (current) this.release(pointer);
    const otherHolder = this.holderOf(id);
    if (otherHolder) this.held.delete(otherHolder);
    pointer.holdAnchor.add(item.object);
    item.object.position.copy(item.grip.position);
    item.object.quaternion.copy(item.grip.quaternion);
    // Big parts would fill a flat screen, so they are shown smaller there.
    const bulky = id.startsWith('wheel-') || id === 'drain-pan';
    item.object.scale.setScalar(bulky && (pointer.kind === 'mouse' || pointer.kind === 'touch') ? 0.35 : 1);
    item.collider.userData.enabled = false;
    this.held.set(pointer.id, id);
    this.sfx.play('pickup');
    this.hooks.onGrab(id, pointer);
  }

  release(pointer: Pointer): void {
    const id = this.heldBy(pointer);
    if (!id) return;
    this.held.delete(pointer.id);
    const item = this.registry.items.get(id);
    if (item) {
      this.registry.sendHome(id);
      item.collider.userData.enabled = item.available;
    }
    this.sfx.play('drop');
    this.hooks.onRelease(id);
  }

  /** Drops every held item back home (lesson reset). */
  releaseAll(pointers: Pointer[]): void {
    for (const p of pointers) this.release(p);
    this.active = null;
    this.partial.clear();
    this.fillValues.clear();
  }

  /** The held item was consumed by an effect (e.g. installed); forget it without sending it home. */
  consume(id: ItemId): void {
    for (const [p, i] of this.held) if (i === id) this.held.delete(p);
  }

  private onSqueeze(pointer: Pointer, hit: Hit | null): void {
    if (hit?.pick.kind === 'item' && this.heldBy(pointer) !== hit.pick.id) {
      this.grab(pointer, hit.pick.id);
    } else if (this.heldBy(pointer)) {
      this.release(pointer);
    }
  }

  private handleStick(pointer: Pointer): void {
    const held = this.heldBy(pointer);
    if (held !== 'torque-wrench') return;
    const y = pointer.stick.y;
    const latched = this.stickLatch.get(pointer.id) ?? false;
    if (Math.abs(y) > 0.6 && !latched) {
      this.stickLatch.set(pointer.id, true);
      this.hooks.onAdjust(pointer, y < 0 ? 1 : -1);
    } else if (Math.abs(y) < 0.3) {
      this.stickLatch.set(pointer.id, false);
    }
  }
}

function isShown(o: Object3D): boolean {
  for (let n: Object3D | null = o; n; n = n.parent) if (!n.visible) return false;
  return true;
}
