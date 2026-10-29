import { Vector3 } from 'three';

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();

/**
 * Signed angle (radians) that rotates `from` to `to` around `axis`, using the
 * right-hand rule. With `axis` pointing away from the viewer (along the tool),
 * a positive angle is a clockwise turn as the viewer sees it, which tightens.
 */
export function signedAngleAround(axis: Vector3, from: Vector3, to: Vector3): number {
  const n = _c.copy(axis).normalize();
  const a = _a.copy(from).addScaledVector(n, -from.dot(n));
  const b = _b.copy(to).addScaledVector(n, -to.dot(n));
  if (a.lengthSq() < 1e-8 || b.lengthSq() < 1e-8) return 0;
  a.normalize();
  b.normalize();
  const cross = a.clone().cross(b);
  return Math.atan2(n.dot(cross), a.dot(b));
}

/**
 * Turns wrist roll into progress on a twist gesture (wrench, filter, cap).
 * Feed it the tool's forward axis and its up vector each frame while the
 * trigger is held.
 */
export class TwistTracker {
  private prevUp: Vector3 | null = null;
  /** Radians turned in the requested direction, never negative. */
  turned = 0;
  /** Radians turned the wrong way since the last right-way turn. */
  wrongWay = 0;

  constructor(
    readonly turns: number,
    readonly dir: 'cw' | 'ccw',
  ) {}

  get progress(): number {
    return Math.min(1, this.turned / (this.turns * Math.PI * 2));
  }

  release(): void {
    this.prevUp = null;
  }

  /** Returns the angle change applied this frame (positive = right direction). */
  update(axis: Vector3, up: Vector3): number {
    if (!this.prevUp) {
      this.prevUp = up.clone();
      return 0;
    }
    let delta = signedAngleAround(axis, this.prevUp, up);
    this.prevUp.copy(up);
    if (Math.abs(delta) > Math.PI / 2) delta = 0; // tracking glitch, ignore
    const signed = this.dir === 'cw' ? delta : -delta;
    if (signed > 0) {
      this.turned += signed;
      this.wrongWay = Math.max(0, this.wrongWay - signed);
    } else {
      this.wrongWay += -signed;
    }
    return signed;
  }

  /** Used by mouse, touch and the simple-gestures setting: hold to turn at a steady rate. */
  advance(radians: number): void {
    this.turned += radians;
  }
}
