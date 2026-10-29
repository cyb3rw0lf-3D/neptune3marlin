import type { LessonId, Mode, RunResult } from '../lessons/engine/types';
import { DEFAULT_SETTINGS, type Settings, sanitizeSettings } from './settings';

/**
 * Per-device saves: several named student profiles plus device settings.
 * Everything lives in localStorage, and every access is guarded because storage
 * can be missing or throw (private windows, blocked site data, previews).
 */
export interface LessonProgress {
  learned: boolean;
  practiceBest: number | null;
  testBest: number | null;
  passed: boolean;
  certificateDate: string | null;
}

export interface RunRecord extends RunResult {
  id: string;
  lessonId: LessonId;
  lessonTitle: string;
  mode: Mode;
  vehicleName: string;
  date: string;
}

export interface Profile {
  id: string;
  name: string;
  createdAt: string;
  lessons: Partial<Record<LessonId, LessonProgress>>;
  runs: RunRecord[];
}

export interface SaveData {
  version: 1;
  profiles: Profile[];
  activeProfileId: string | null;
  settings: Settings;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = 'service-bay-vr/save';
const MAX_RUNS = 60;
export const MAX_PROFILES = 40;

export function emptySave(): SaveData {
  return { version: 1, profiles: [], activeProfileId: null, settings: { ...DEFAULT_SETTINGS } };
}

function defaultStore(): KeyValueStore | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export class SaveStore {
  data: SaveData;
  private store: KeyValueStore | null;

  constructor(store: KeyValueStore | null = defaultStore()) {
    this.store = store;
    this.data = this.load();
  }

  private load(): SaveData {
    try {
      const raw = this.store?.getItem(KEY);
      if (!raw) return emptySave();
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      if (parsed.version !== 1 || !Array.isArray(parsed.profiles)) return emptySave();
      const profiles = parsed.profiles.filter(isProfile);
      const active = profiles.some((p) => p.id === parsed.activeProfileId) ? (parsed.activeProfileId ?? null) : null;
      return { version: 1, profiles, activeProfileId: active, settings: sanitizeSettings(parsed.settings) };
    } catch {
      return emptySave();
    }
  }

  persist(): boolean {
    try {
      this.store?.setItem(KEY, JSON.stringify(this.data));
      return this.store !== null;
    } catch {
      return false;
    }
  }

  get activeProfile(): Profile | null {
    return this.data.profiles.find((p) => p.id === this.data.activeProfileId) ?? null;
  }

  createProfile(name: string): Profile {
    const clean = name.trim().replace(/\s+/g, ' ').slice(0, 24) || 'Student';
    const profile: Profile = { id: newId(), name: clean, createdAt: new Date().toISOString(), lessons: {}, runs: [] };
    this.data.profiles.push(profile);
    if (this.data.profiles.length > MAX_PROFILES) this.data.profiles.shift();
    this.data.activeProfileId = profile.id;
    this.persist();
    return profile;
  }

  selectProfile(id: string): void {
    if (this.data.profiles.some((p) => p.id === id)) {
      this.data.activeProfileId = id;
      this.persist();
    }
  }

  deleteProfile(id: string): void {
    this.data.profiles = this.data.profiles.filter((p) => p.id !== id);
    if (this.data.activeProfileId === id) this.data.activeProfileId = null;
    this.persist();
  }

  updateSettings(patch: Partial<Settings>): Settings {
    this.data.settings = sanitizeSettings({ ...this.data.settings, ...patch });
    this.persist();
    return this.data.settings;
  }

  progress(lessonId: LessonId): LessonProgress {
    return (
      this.activeProfile?.lessons[lessonId] ?? {
        learned: false,
        practiceBest: null,
        testBest: null,
        passed: false,
        certificateDate: null,
      }
    );
  }

  /** Records a finished run on the active profile and updates lesson progress. */
  recordRun(run: Omit<RunRecord, 'id' | 'date'>): RunRecord | null {
    const profile = this.activeProfile;
    if (!profile) return null;
    const record: RunRecord = { ...run, id: newId(), date: new Date().toISOString() };
    profile.runs.push(record);
    if (profile.runs.length > MAX_RUNS) profile.runs.splice(0, profile.runs.length - MAX_RUNS);

    const p = { ...this.progress(run.lessonId) };
    if (run.mode === 'learn' && run.completed) p.learned = true;
    if (run.mode === 'practice' && run.completed) p.practiceBest = Math.max(p.practiceBest ?? 0, run.score);
    if (run.mode === 'test' && run.completed) {
      p.testBest = Math.max(p.testBest ?? 0, run.score);
      if (run.passed && !p.passed) {
        p.passed = true;
        p.certificateDate = record.date;
      }
    }
    profile.lessons[run.lessonId] = p;
    this.persist();
    return record;
  }
}

function isProfile(p: unknown): p is Profile {
  if (!p || typeof p !== 'object') return false;
  const r = p as Record<string, unknown>;
  return (
    typeof r.id === 'string' && typeof r.name === 'string' && Array.isArray(r.runs) && typeof r.lessons === 'object'
  );
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
