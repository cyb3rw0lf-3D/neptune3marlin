/**
 * The contract between the game, the teacher dashboard and the API Worker.
 * Pure TypeScript with no browser or Worker APIs, so all three import it.
 */

export const LESSON_KEYS = [
  'oil-change',
  'tire-service',
  'brakes',
  'battery',
  'inspection',
  'obd2',
  'spark-plugs',
  'ev-safety',
] as const;
export type LessonKey = (typeof LESSON_KEYS)[number];

/** Lesson titles for the dashboard (kept in step with the lesson files by a unit test). */
export const LESSON_TITLES: Record<LessonKey, string> = {
  'oil-change': 'Oil & Filter Change',
  'tire-service': 'Tire Service',
  brakes: 'Brake Inspection & Pads',
  battery: 'Battery & Jump-Start',
  inspection: 'Multi-Point Inspection',
  obd2: 'OBD-II Diagnostics',
  'spark-plugs': 'Spark Plugs & Ignition',
  'ev-safety': 'EV High-Voltage Safety',
};
export const MODES = ['learn', 'practice', 'test'] as const;
export type ModeKey = (typeof MODES)[number];
export const VEHICLE_KEYS = ['sedan', 'pickup', 'ev'] as const;

export interface ClassSettings {
  /** Lessons the teacher has opened. Locked lessons cannot be started. */
  open: Record<LessonKey, boolean>;
  /** Test unlocks only after Learn is done. */
  learnFirst: boolean;
  /** Shop mode: on for everyone, off, or only for students who passed at least one Test. */
  shop: 'on' | 'off' | 'passed';
  /** Shared headsets: keep profiles on the device, or sign in every session and keep nothing. */
  signIn: 'device' | 'session';
  /** Only roster students (with personal codes) can join; the class code alone is not enough. */
  roster: boolean;
}

export function defaultClassSettings(): ClassSettings {
  return {
    open: Object.fromEntries(LESSON_KEYS.map((k) => [k, true])) as Record<LessonKey, boolean>,
    learnFirst: false,
    shop: 'on',
    signIn: 'device',
    roster: false,
  };
}

export interface MistakeUpload {
  code: string;
  label: string;
  count: number;
  critical: boolean;
}

export interface AttemptUpload {
  /** Made on the device; uploading the same attempt twice is harmless. */
  id: string;
  lesson: LessonKey;
  mode: ModeKey;
  vehicle: string;
  score: number;
  passed: boolean;
  completed: boolean;
  critical: number;
  hints: number;
  seconds: number;
  mistakes: MistakeUpload[];
  /** Epoch milliseconds. */
  at: number;
}

export interface ShopUpload {
  money: number;
  rep: number;
  shifts: number;
  jobs: number;
  comebacks: number;
  safetyStops: number;
  upgrades: number;
}

export interface Heartbeat {
  lesson: string | null;
  mode: string | null;
  step: string | null;
}

export interface SyncRequest {
  attempts: AttemptUpload[];
  shop?: ShopUpload;
  heartbeat?: Heartbeat;
}

export interface SyncResponse {
  className: string;
  nickname: string;
  settings: ClassSettings;
  accepted: number;
}

export interface JoinRequest {
  code?: string;
  nickname?: string;
  rosterCode?: string;
}

export interface JoinResponse {
  token: string;
  studentId: string;
  nickname: string;
  className: string;
  settings: ClassSettings;
}

export interface CreateClassResponse {
  classId: string;
  name: string;
  code: string;
  /** Shown once: the private teacher link carries it. */
  teacherKey: string;
}

export interface StudentView {
  id: string;
  nickname: string;
  rosterCode: string | null;
  activeAt: number;
}

export interface CellView {
  studentId: string;
  lesson: LessonKey;
  mode: ModeKey;
  attempts: number;
  best: number;
  passed: boolean;
}

export interface ClassView {
  id: string;
  name: string;
  code: string;
  settings: ClassSettings;
  students: StudentView[];
  cells: CellView[];
}

export interface AttemptView extends AttemptUpload {
  studentId: string;
  nickname: string;
}

export interface MistakeCount {
  code: string;
  label: string;
  critical: boolean;
  count: number;
  students: number;
}

export interface LiveView {
  studentId: string;
  nickname: string;
  lesson: string | null;
  mode: string | null;
  step: string | null;
  at: number;
}

export interface ShopView extends ShopUpload {
  studentId: string;
  nickname: string;
  updatedAt: number;
}

export const LIMITS = {
  className: 60,
  nickname: 24,
  attemptsPerSync: 50,
  mistakesPerAttempt: 40,
  codeLength: 60,
  labelLength: 160,
  rosterSize: 60,
  bodyBytes: 64 * 1024,
} as const;

// --- validation (shared by the Worker and the game's tests) ---

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isNum = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const isStr = (v: unknown, max: number, min = 1): v is string =>
  typeof v === 'string' && v.length >= min && v.length <= max;

/** Trims and collapses spaces; letters, digits, spaces and a few marks only. */
export function cleanName(raw: unknown, max: number): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (s.length < 1 || s.length > max) return null;
  if (!/^[\p{L}\p{N} .'_-]+$/u.test(s)) return null;
  return s;
}

export function parseAttempt(v: unknown): AttemptUpload | null {
  if (!isObj(v)) return null;
  if (!isStr(v.id, 64, 8) || !/^[A-Za-z0-9-]+$/.test(v.id)) return null;
  if (!LESSON_KEYS.includes(v.lesson as LessonKey) || !MODES.includes(v.mode as ModeKey)) return null;
  if (!isStr(v.vehicle, 40)) return null;
  if (!isInt(v.score, 0, 100) || typeof v.passed !== 'boolean' || typeof v.completed !== 'boolean') return null;
  if (!isInt(v.critical, 0, 999) || !isInt(v.hints, 0, 9999) || !isInt(v.seconds, 0, 86400)) return null;
  if (!isInt(v.at, 1_600_000_000_000, 4_000_000_000_000)) return null;
  if (!Array.isArray(v.mistakes) || v.mistakes.length > LIMITS.mistakesPerAttempt) return null;
  const mistakes: MistakeUpload[] = [];
  for (const m of v.mistakes) {
    if (!isObj(m) || !isStr(m.code, LIMITS.codeLength) || !/^[a-z0-9_.]+$/.test(m.code)) return null;
    if (!isStr(m.label, LIMITS.labelLength) || !isInt(m.count, 1, 999) || typeof m.critical !== 'boolean') return null;
    mistakes.push({ code: m.code, label: m.label, count: m.count, critical: m.critical });
  }
  return {
    id: v.id,
    lesson: v.lesson as LessonKey,
    mode: v.mode as ModeKey,
    vehicle: v.vehicle,
    score: v.score,
    passed: v.passed,
    completed: v.completed,
    critical: v.critical,
    hints: v.hints,
    seconds: v.seconds,
    mistakes,
    at: v.at,
  };
}

export function parseShop(v: unknown): ShopUpload | null {
  if (!isObj(v)) return null;
  if (!isNum(v.money, -1e7, 1e7) || !isInt(v.rep, 0, 100)) return null;
  for (const k of ['shifts', 'jobs', 'comebacks', 'safetyStops', 'upgrades'] as const)
    if (!isInt(v[k], 0, 1_000_000)) return null;
  return {
    money: Math.round(v.money * 100) / 100,
    rep: v.rep,
    shifts: v.shifts as number,
    jobs: v.jobs as number,
    comebacks: v.comebacks as number,
    safetyStops: v.safetyStops as number,
    upgrades: v.upgrades as number,
  };
}

export function parseSync(v: unknown): SyncRequest | string {
  if (!isObj(v)) return 'body must be an object';
  if (!Array.isArray(v.attempts) || v.attempts.length > LIMITS.attemptsPerSync) return 'attempts must be a short list';
  const attempts: AttemptUpload[] = [];
  for (const a of v.attempts) {
    const p = parseAttempt(a);
    if (!p) return 'invalid attempt';
    attempts.push(p);
  }
  const out: SyncRequest = { attempts };
  if (v.shop !== undefined) {
    const shop = parseShop(v.shop);
    if (!shop) return 'invalid shop stats';
    out.shop = shop;
  }
  if (v.heartbeat !== undefined) {
    const h = v.heartbeat;
    const opt = (x: unknown) => x === null || isStr(x, 60);
    if (!isObj(h) || !opt(h.lesson) || !opt(h.mode) || !opt(h.step)) return 'invalid heartbeat';
    out.heartbeat = {
      lesson: (h.lesson as string | null) ?? null,
      mode: (h.mode as string | null) ?? null,
      step: (h.step as string | null) ?? null,
    };
  }
  return out;
}

export function parseSettings(v: unknown): ClassSettings | null {
  if (!isObj(v) || !isObj(v.open)) return null;
  const s = defaultClassSettings();
  for (const k of LESSON_KEYS) {
    const o = v.open[k];
    if (o !== undefined && typeof o !== 'boolean') return null;
    s.open[k] = o ?? true;
  }
  if (typeof v.learnFirst !== 'boolean' || typeof v.roster !== 'boolean') return null;
  if (v.shop !== 'on' && v.shop !== 'off' && v.shop !== 'passed') return null;
  if (v.signIn !== 'device' && v.signIn !== 'session') return null;
  s.learnFirst = v.learnFirst;
  s.shop = v.shop;
  s.signIn = v.signIn;
  s.roster = v.roster;
  return s;
}

/** Class codes avoid look-alike characters (0/O, 1/I/L) so they read well off a whiteboard. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.toUpperCase().replace(/[\s-]/g, '');
  if (s.length < 4 || s.length > 12) return null;
  for (const c of s) if (!CODE_ALPHABET.includes(c)) return null;
  return s;
}
