/**
 * Valkyrie's voice. Lines play from pre-recorded clips when the build has them
 * (so every headset gets the same voice), fall back to the browser's speech
 * synthesis, and otherwise just wait long enough to read the caption.
 * Captions are always shown.
 */

export interface NarrationManifest {
  /** line key (hash of the spoken text) -> clip file name */
  clips: Record<string, string>;
}

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
export function lineKey(text: string): string {
  let h = 0x811c9dc5;
  const s = speakable(text);
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
  say(text: string): Promise<void> {
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
      const clip = this.manifest.clips[lineKey(text)];
      if (clip && this.volume > 0) {
        const audio = new Audio(`${this.baseUrl}audio/narration/${clip}`);
        audio.volume = this.volume;
        this.audio = audio;
        audio.onended = () => window.setTimeout(finish, 250);
        audio.onerror = () => this.timed(text, finish);
        audio.play().catch(() => this.timed(text, finish));
        this.timer = window.setTimeout(finish, fallbackMs + 20000);
        return;
      }
      if (this.speak(text, finish)) {
        this.timer = window.setTimeout(finish, fallbackMs);
        return;
      }
      this.timed(text, finish);
    });
  }

  private speak(text: string, done: () => void): boolean {
    try {
      const synth = window.speechSynthesis;
      if (!synth || this.volume <= 0) return false;
      const u = new SpeechSynthesisUtterance(speakable(text));
      if (this.voice) u.voice = this.voice;
      u.rate = 1.03;
      u.pitch = 1.1;
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
