import { Object3D, type PerspectiveCamera, Vector2, Vector3 } from 'three';
import { Pointer } from './pointer';

export interface DesktopCallbacks {
  /** True when the pointer is over something it can interact with. */
  isInteractive(): boolean;
  look(dYaw: number, dPitch: number): void;
  move(forward: number, right: number, dt: number): void;
  adjust(delta: number): void;
  key(key: string): void;
}

/**
 * Mouse, keyboard and touch play without a headset. Click to grab or use,
 * drag empty space (or right-drag) to look, WASD/arrow keys to walk.
 */
export class DesktopInput {
  readonly pointer: Pointer;
  private ndc = new Vector2();
  private looking = false;
  private lastX = 0;
  private lastY = 0;
  private keys = new Set<string>();
  private moved = 0;
  /** Clicks that arrived before the previous one was handled (slow frames), in order. */
  private queued: { ndc: Vector2; released: boolean }[] = [];
  /** Where the latest click aimed, kept until a frame handles it even if the mouse moves on. */
  private pressNdc: Vector2 | null = null;
  enabled = true;

  constructor(
    private readonly el: HTMLElement,
    private readonly camera: PerspectiveCamera,
    private readonly cb: DesktopCallbacks,
  ) {
    const anchor = new Object3D();
    anchor.position.set(0.2, -0.17, -0.45);
    anchor.rotation.set(0.25, 0.15, 0);
    anchor.scale.setScalar(0.65);
    camera.add(anchor);
    this.pointer = new Pointer('mouse', 'mouse', anchor);
    this.pointer.connected = true;

    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointermove', (e) => this.onMove(e));
    el.addEventListener('pointerdown', (e) => this.onDown(e));
    el.addEventListener('pointerup', (e) => this.onUp(e));
    el.addEventListener('pointercancel', (e) => this.onUp(e));
    el.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        e.preventDefault();
        this.cb.adjust(e.deltaY < 0 ? 1 : -1);
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if (!this.enabled || e.target instanceof HTMLInputElement) return;
      this.keys.add(e.key.toLowerCase());
      if (['+', '=', ']'].includes(e.key)) this.cb.adjust(e.shiftKey ? 5 : 1);
      if (['-', '_', '['].includes(e.key)) this.cb.adjust(e.shiftKey ? -5 : -1);
      this.cb.key(e.key);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private setNdc(e: PointerEvent): void {
    const r = this.el.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private onMove(e: PointerEvent): void {
    if (!this.enabled) return;
    this.pointer.kind = e.pointerType === 'touch' ? 'touch' : 'mouse';
    if (this.looking) {
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.moved += Math.abs(dx) + Math.abs(dy);
      const speed = e.pointerType === 'touch' ? 0.006 : 0.004;
      this.cb.look(-dx * speed, -dy * speed);
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      return;
    }
    this.setNdc(e);
  }

  private onDown(e: PointerEvent): void {
    if (!this.enabled) return;
    this.el.setPointerCapture?.(e.pointerId);
    this.pointer.kind = e.pointerType === 'touch' ? 'touch' : 'mouse';
    // A frame has not handled the previous click yet: queue this one behind it.
    const pending = this.pointer.selectDown || this.queued.length > 0;
    this.setNdc(e);
    this.updateRay();
    if (e.button === 2 || (e.button === 0 && !this.cb.isInteractive())) {
      this.looking = true;
      this.moved = 0;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      return;
    }
    if (e.button !== 0) return;
    if (pending) {
      this.queued.push({ ndc: this.ndc.clone(), released: false });
      return;
    }
    this.pressNdc = this.ndc.clone();
    this.pointer.pressSelect();
  }

  private onUp(e: PointerEvent): void {
    if (this.looking) {
      this.looking = false;
      return;
    }
    if (e.button !== 0 && e.pointerType !== 'touch') return;
    const last = this.queued[this.queued.length - 1];
    if (last && !last.released) {
      last.released = true;
      return;
    }
    this.pointer.releaseSelect();
  }

  /** Replays one queued click per frame, so quick clicks on a slow device are not lost. */
  private replayQueued(): void {
    const next = this.queued[0];
    if (!next || this.pointer.select || this.pointer.selectDown) return;
    this.queued.shift();
    this.pressNdc = next.ndc;
    this.pointer.pressSelect();
    if (next.released) this.pointer.releaseSelect();
  }

  private updateRay(ndc = this.ndc): void {
    this.camera.updateMatrixWorld();
    const origin = this.camera.getWorldPosition(new Vector3());
    const target = new Vector3(ndc.x, ndc.y, 0.5).unproject(this.camera);
    this.pointer.ray.origin.copy(origin);
    this.pointer.ray.direction.copy(target.sub(origin).normalize());
    this.pointer.up.set(0, 1, 0).applyQuaternion(this.camera.getWorldQuaternion(this.camera.quaternion.clone()));
  }

  update(dt: number): void {
    if (!this.enabled) return;
    this.replayQueued();
    // An unhandled click keeps its own aim; otherwise follow the mouse.
    this.updateRay(this.pointer.selectDown && this.pressNdc ? this.pressNdc : this.ndc);
    const k = this.keys;
    const forward = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const right = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    if (forward || right) this.cb.move(forward, right, dt);
  }
}
