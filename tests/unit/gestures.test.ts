import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { PumpTracker, signedAngleAround, TwistTracker } from '../../src/input/gestures';

const forward = new Vector3(0, 0, -1); // pointing away from the viewer

function upAt(angle: number): Vector3 {
  // Rotating the up vector clockwise as seen by the viewer looking along -Z.
  return new Vector3(Math.sin(angle), Math.cos(angle), 0);
}

describe('twist gestures', () => {
  it('measures clockwise (viewer) rotation as positive around the forward axis', () => {
    expect(signedAngleAround(forward, upAt(0), upAt(0.3))).toBeCloseTo(0.3, 6);
    expect(signedAngleAround(forward, upAt(0.3), upAt(0))).toBeCloseTo(-0.3, 6);
  });

  it('accumulates progress only in the requested direction', () => {
    const t = new TwistTracker(1, 'cw');
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.2) t.update(forward, upAt(a));
    expect(t.progress).toBeGreaterThan(0.95);

    const loosen = new TwistTracker(1, 'ccw');
    for (let a = 0; a <= 1; a += 0.1) loosen.update(forward, upAt(a));
    expect(loosen.progress).toBe(0);
    expect(loosen.wrongWay).toBeGreaterThan(0.9);
  });

  it('ignores tracking jumps and supports hold-to-turn', () => {
    const t = new TwistTracker(0.5, 'cw');
    t.update(forward, upAt(0));
    t.update(forward, upAt(3));
    expect(t.turned).toBe(0);
    t.advance(Math.PI);
    expect(t.progress).toBe(1);
  });
});

describe('PumpTracker', () => {
  it('counts a stroke on each push down, only after the handle comes back up', () => {
    const p = new PumpTracker(3, 0.1);
    // Down 12 cm, up 12 cm, three times.
    for (let i = 0; i < 3; i++) for (const h of [1.0, 0.94, 0.88, 0.94, 1.0]) p.update(h);
    expect(p.strokes).toBe(3);
    expect(p.progress).toBe(1);
  });

  it('ignores small jiggles and counts clicks', () => {
    const p = new PumpTracker(4, 0.1);
    for (const h of [1.0, 0.97, 1.0, 0.96, 0.99]) p.update(h);
    expect(p.strokes).toBe(0);
    p.click();
    expect(p.progress).toBe(0.25);
  });

  it('needs the handle to rise again before the next stroke', () => {
    const p = new PumpTracker(2, 0.1);
    for (const h of [1.0, 0.88, 0.76, 0.64]) p.update(h);
    expect(p.strokes).toBe(1);
  });
});
