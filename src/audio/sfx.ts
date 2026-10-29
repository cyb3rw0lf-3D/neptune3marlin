/**
 * Shop sound effects synthesized with Web Audio, so there are no audio files
 * to download or license. Every call is safe to make before audio is unlocked.
 */
export type Sfx =
  | 'click'
  | 'pickup'
  | 'drop'
  | 'ratchet'
  | 'impact'
  | 'hiss'
  | 'pour'
  | 'lift'
  | 'clunk'
  | 'success'
  | 'step'
  | 'error'
  | 'alarm'
  | 'spark'
  | 'torque-click'
  | 'engine'
  | 'teleport';

export class SoundFx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private loops = new Map<string, { stop: () => void }>();
  volume = 0.7;

  /** Must be called from a user gesture (click / enter VR). */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      const Ctx =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private burst(
    dur: number,
    filterFreq: number,
    gain: number,
    delay = 0,
    q = 1,
    type: BiquadFilterType = 'bandpass',
  ): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  play(name: Sfx): void {
    if (!this.ctx) return;
    switch (name) {
      case 'click':
        this.tone(1400, 0.04, 'square', 0.08);
        break;
      case 'pickup':
        this.tone(500, 0.08, 'triangle', 0.15, 0, 900);
        break;
      case 'drop':
        this.tone(700, 0.1, 'triangle', 0.12, 0, 350);
        break;
      case 'ratchet':
        for (let i = 0; i < 3; i++) this.burst(0.025, 3500, 0.35, i * 0.045, 4);
        break;
      case 'torque-click':
        this.burst(0.03, 2500, 0.8, 0, 2);
        this.tone(1800, 0.05, 'square', 0.12, 0.01);
        break;
      case 'impact':
        for (let i = 0; i < 12; i++) this.burst(0.03, 900 + Math.random() * 400, 0.4, i * 0.05, 3);
        this.tone(160, 0.6, 'sawtooth', 0.05);
        break;
      case 'hiss':
        this.burst(0.5, 5000, 0.18, 0, 0.7, 'highpass');
        break;
      case 'pour':
        this.burst(0.45, 600, 0.25, 0, 1.5, 'lowpass');
        break;
      case 'lift':
        this.tone(95, 0.55, 'sawtooth', 0.06);
        this.burst(0.5, 300, 0.1, 0, 1, 'lowpass');
        break;
      case 'clunk':
        this.tone(120, 0.18, 'square', 0.18, 0, 70);
        this.burst(0.1, 400, 0.4, 0, 2);
        break;
      case 'success':
        this.tone(660, 0.12, 'triangle', 0.18);
        this.tone(880, 0.12, 'triangle', 0.18, 0.1);
        this.tone(1320, 0.25, 'triangle', 0.18, 0.2);
        break;
      case 'step':
        this.tone(880, 0.09, 'sine', 0.15);
        this.tone(1175, 0.15, 'sine', 0.15, 0.08);
        break;
      case 'error':
        this.tone(220, 0.22, 'square', 0.12);
        this.tone(185, 0.3, 'square', 0.12, 0.15);
        break;
      case 'alarm':
        for (let i = 0; i < 4; i++) this.tone(i % 2 ? 620 : 880, 0.22, 'square', 0.12, i * 0.24);
        break;
      case 'spark':
        for (let i = 0; i < 8; i++) this.burst(0.02, 6000, 0.5, i * 0.03 + Math.random() * 0.02, 2);
        break;
      case 'engine':
        this.tone(55, 1.2, 'sawtooth', 0.08);
        this.tone(110, 1.2, 'square', 0.03);
        break;
      case 'teleport':
        this.tone(400, 0.12, 'sine', 0.08, 0, 800);
        break;
    }
  }

  /** A sound that repeats while a gesture is held (pouring, hissing, lift motor). */
  loop(key: string, name: Sfx, every: number): void {
    if (this.loops.has(key) || !this.ctx) return;
    this.play(name);
    const id = window.setInterval(() => this.play(name), every * 1000);
    this.loops.set(key, { stop: () => window.clearInterval(id) });
  }

  stopLoop(key: string): void {
    this.loops.get(key)?.stop();
    this.loops.delete(key);
  }

  stopAll(): void {
    for (const k of [...this.loops.keys()]) this.stopLoop(k);
  }
}
