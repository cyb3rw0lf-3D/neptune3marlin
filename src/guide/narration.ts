/**
 * Valkyrie's voice. Lines play from pre-recorded clips when the build has them
 * (so every headset gets the same voice), fall back to the browser's speech
 * synthesis, and otherwise just wait long enough to read the caption.
 * Captions are always shown.
 */

/**
 * Where each recorded line lives. A clip is either its own file, or a slice of a
 * pack file: [pack index, start seconds, length seconds]. Packs keep the number
 * of files small enough for hosts with file limits.
 */
export interface NarrationManifest {
  clips: Record<string, string | [number, number, number]>;
  packs?: string[];
}

/** Who is talking: Valkyrie (no speaker) or a Shop customer's voice. */
export type Speaker = string | undefined;

/** Turns symbols and units into words a voice reads naturally. */
export function speakable(text: string): string {
  return text
    .replace(/(\d)\/32 in\b/g, '$1 thirty-seconds of an inch')
    .replace(/\bft-lb\b/g, 'foot-pounds')
    .replace(/N·m/g, 'newton-meters')
    .replace(/\bkPa\b/g, 'kilopascals')
    .replace(/\bpsi\b/g, 'P S I')
    .replace(/(\d) qt\b/g, '$1 quarts')
    .replace(/(\d) L\b/g, '$1 liters')
    .replace(/(\d) mm\b/g, '$1 millimeters')
    .replace(/\bOBD-II\b/g, 'O B D two')
    .replace(/\bEV\b/g, 'E V')
    .replace(/(\d)W-(\d+)/g, '$1 W $2')
    .replace(/[()]/g, ', ');
}

/** Stable short key for a line of narration (FNV-1a). Shared with the clip generator. */
export function lineKey(text: string, speaker?: Speaker): string {
  let h = 0x811c9dc5;
  const s = speaker ? `${speaker}|${speakable(text)}` : speakable(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function readingSeconds(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1.6, words / 2.7 + 0.6);
}

type CaptionListener = (text: string | null) => void;

export class Narrator {
  private manifest: NarrationManifest = { clips: {} };
  private audio: HTMLAudioElement | null = null;
  private timer: number | null = null;
  private resolveCurrent: (() => void) | null = null;
  private token = 0;
  private voice: SpeechSynthesisVoice | null = null;
  private source: AudioBufferSourceNode | null = null;
  private packs = new Map<number, Promise<AudioBuffer | null>>();
  /** The audio context packs are decoded and played with (null until audio is unlocked). */
  context: () => AudioContext | null = () => null;
  volume = 0.9;
  /** Set to make every line finish instantly (automated tests). */
  instant = false;
  onCaption: CaptionListener = () => {};

  constructor(private readonly baseUrl: string) {
    try {
      const synth = window.speechSynthesis;
      const pickVoice = () => {
        const voices = synth.getVoices().filter((v) => v.lang.startsWith('en'));
        this.voice =
          voices.find((v) => /female|samantha|zira|aria|jenny|google us english/i.test(v.name)) ?? voices[0] ?? null;
      };
      pickVoice();
      synth.addEventListener?.('voiceschanged', pickVoice);
    } catch {
      this.voice = null;
    }
  }

  async loadManifest(): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}audio/narration/manifest.json`, { cache: 'no-cache' });
      if (res.ok) this.manifest = (await res.json()) as NarrationManifest;
    } catch {
      // No clips: speech synthesis or captions only.
    }
  }

  get hasClips(): boolean {
    return Object.keys(this.manifest.clips).length > 0;
  }

  /** Speaks a line, interrupting anything already playing. Resolves when it ends. */
  say(text: string, speaker?: Speaker): Promise<void> {
    this.stop();
    const token = ++this.token;
    this.onCaption(text);
    return new Promise<void>((resolve) => {
      const finish = () => {
        if (token !== this.token) return;
        this.clearTimer();
        this.resolveCurrent = null;
        this.onCaption(null);
        resolve();
      };
      this.resolveCurrent = () => {
        this.onCaption(null);
        resolve();
      };
      if (this.instant) {
        queueMicrotask(finish);
        return;
      }
      // Safety net in case audio never reports the end.
      const fallbackMs = readingSeconds(text) * 1000 + 6000;
      const clip = this.manifest.clips[lineKey(text, speaker)];
      if (Array.isArray(clip) && this.volume > 0 && this.context()) {
        const [pack, start, length] = clip;
        this.timer = window.setTimeout(finish, fallbackMs + 20000);
        void this.playSlice(pack, start, length, token).then((ok) => {
          if (token !== this.token) return;
          if (ok) return;
          if (!this.speak(text, finish, speaker)) this.timed(text, finish);
        });
        this.onSliceEnd = () => window.setTimeout(finish, 250);
        return;
      }
      if (typeof clip === 'string' && this.volume > 0) {
        const audio = new Audio(`${this.baseUrl}audio/narration/${clip}`);
        audio.volume = this.volume;
        this.audio = audio;
        audio.onended = () => window.setTimeout(finish, 250);
        audio.onerror = () => this.timed(text, finish);
        audio.play().catch(() => this.timed(text, finish));
        this.timer = window.setTimeout(finish, fallbackMs + 20000);
        return;
      }
      if (this.speak(text, finish, speaker)) {
        this.timer = window.setTimeout(finish, fallbackMs);
        return;
      }
      this.timed(text, finish);
    });
  }

  private onSliceEnd: () => void = () => {};

  /** Plays part of a pack file. Resolves false if the pack could not be loaded. */
  private async playSlice(pack: number, start: number, length: number, token: number): Promise<boolean> {
    const ctx = this.context();
    if (!ctx) return false;
    const decoded = await this.loadPack(ctx, pack);
    if (!decoded) {
      this.packs.delete(pack);
      return false;
    }
    if (token !== this.token) return true;
    const src = ctx.createBufferSource();
    src.buffer = decoded;
    const gain = ctx.createGain();
    gain.gain.value = this.volume;
    src.connect(gain).connect(ctx.destination);
    src.onended = () => {
      if (this.source === src) this.source = null;
      if (token === this.token) this.onSliceEnd();
    };
    this.source = src;
    src.start(0, start, length);
    return true;
  }

  /** Fetches and decodes a pack once; keeps only a few in memory (headsets have little to spare). */
  private loadPack(ctx: AudioContext, pack: number): Promise<AudioBuffer | null> {
    const cached = this.packs.get(pack);
    if (cached) return cached;
    const file = this.manifest.packs?.[pack];
    const loading: Promise<AudioBuffer | null> = file
      ? fetch(`${this.baseUrl}audio/narration/${file}`)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(r.statusText))))
          .then((data) => ctx.decodeAudioData(data))
          .catch(() => null)
      : Promise.resolve(null);
    this.packs.set(pack, loading);
    if (this.packs.size > 8) this.packs.delete(this.packs.keys().next().value as number);
    return loading;
  }

  /** Starts decoding the packs that hold these lines, so they play without a delay. */
  preload(lines: { text: string; speaker?: Speaker }[]): void {
    const ctx = this.context();
    if (!ctx) return;
    for (const { text, speaker } of lines) {
      const clip = this.manifest.clips[lineKey(text, speaker)];
      if (Array.isArray(clip)) void this.loadPack(ctx, clip[0]);
    }
  }

  private speak(text: string, done: () => void, speaker?: Speaker): boolean {
    try {
      const synth = window.speechSynthesis;
      if (!synth || this.volume <= 0) return false;
      const u = new SpeechSynthesisUtterance(speakable(text));
      if (this.voice) u.voice = this.voice;
      u.rate = 1.03;
      // Customers sound different from Valkyrie even with the browser's voice.
      u.pitch = speaker ? 0.75 + (lineKey(speaker).charCodeAt(0) % 5) * 0.1 : 1.1;
      u.volume = this.volume;
      u.onend = () => window.setTimeout(done, 200);
      u.onerror = () => done();
      synth.speak(u);
      return true;
    } catch {
      return false;
    }
  }

  private timed(text: string, done: () => void): void {
    this.clearTimer();
    this.timer = window.setTimeout(done, readingSeconds(text) * 1000);
  }

  private clearTimer(): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  stop(): void {
    this.token++;
    this.clearTimer();
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        // already stopped
      }
      this.source = null;
    }
    if (this.audio) {
      this.audio.onended = null;
      this.audio.pause();
      this.audio = null;
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // ignore
    }
    const r = this.resolveCurrent;
    this.resolveCurrent = null;
    r?.();
  }
}
