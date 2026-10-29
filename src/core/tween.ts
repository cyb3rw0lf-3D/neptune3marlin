interface Tween {
  elapsed: number;
  duration: number;
  step: (t: number) => void;
  resolve: () => void;
}

/** Frame-driven animations, so they also run inside the WebXR frame loop. */
export class Tweens {
  private active: Tween[] = [];
  /** Multiplies time (tests speed animations up). */
  timeScale = 1;

  run(seconds: number, step: (t: number) => void = () => {}): Promise<void> {
    return new Promise((resolve) => {
      if (seconds <= 0) {
        step(1);
        resolve();
        return;
      }
      this.active.push({ elapsed: 0, duration: seconds, step, resolve });
    });
  }

  wait(seconds: number): Promise<void> {
    return this.run(seconds);
  }

  update(dt: number): void {
    if (this.active.length === 0) return;
    const done: Tween[] = [];
    for (const tw of this.active) {
      tw.elapsed += dt * this.timeScale;
      const t = Math.min(1, tw.elapsed / tw.duration);
      tw.step(t);
      if (t >= 1) done.push(tw);
    }
    if (done.length) {
      this.active = this.active.filter((t) => !done.includes(t));
      for (const t of done) t.resolve();
    }
  }

  get busy(): boolean {
    return this.active.length > 0;
  }
}

export const ease = {
  inOut: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  out: (t: number) => 1 - (1 - t) ** 3,
  in: (t: number) => t * t * t,
};
