import type { AttemptUpload } from './protocol';
import { LIMITS } from './protocol';

/**
 * Results waiting to be uploaded. Kept in the student's save so nothing is lost
 * when a headset is offline, the tab closes or the server is down. Pure data and
 * functions, so it is unit-tested without a network.
 */
export interface Outbox {
  pending: AttemptUpload[];
  /** Failed tries in a row (drives the backoff). */
  failures: number;
  /** Epoch ms before which no retry is made. */
  nextTry: number;
  lastSync: number | null;
  lastError: string | null;
}

/** Oldest results are dropped past this, so a device offline for months cannot fill its storage. */
export const MAX_PENDING = 300;
const BASE_DELAY = 5_000;
const MAX_DELAY = 5 * 60_000;

export function emptyOutbox(): Outbox {
  return { pending: [], failures: 0, nextTry: 0, lastSync: null, lastError: null };
}

export function enqueue(o: Outbox, a: AttemptUpload, max = MAX_PENDING): void {
  if (o.pending.some((p) => p.id === a.id)) return;
  o.pending.push(a);
  if (o.pending.length > max) o.pending.splice(0, o.pending.length - max);
  // New work is worth trying soon, even after earlier failures.
  o.nextTry = Math.min(o.nextTry, Date.now() + BASE_DELAY);
}

export function isDue(o: Outbox, now: number): boolean {
  return now >= o.nextTry;
}

export function nextBatch(o: Outbox, size: number = LIMITS.attemptsPerSync): AttemptUpload[] {
  return o.pending.slice(0, size);
}

export function markSent(o: Outbox, sent: AttemptUpload[], now: number): void {
  const ids = new Set(sent.map((a) => a.id));
  o.pending = o.pending.filter((a) => !ids.has(a.id));
  o.failures = 0;
  o.nextTry = 0;
  o.lastSync = now;
  o.lastError = null;
}

export function markFailed(o: Outbox, now: number, error: string): void {
  o.failures++;
  o.nextTry = now + backoff(o.failures);
  o.lastError = error;
}

/** 5 s, 10 s, 20 s … capped at 5 minutes. */
export function backoff(failures: number): number {
  return Math.min(MAX_DELAY, BASE_DELAY * 2 ** Math.max(0, failures - 1));
}

/** Repairs an outbox read from storage. */
export function sanitizeOutbox(raw: unknown): Outbox {
  const o = emptyOutbox();
  if (!raw || typeof raw !== 'object') return o;
  const r = raw as Partial<Outbox>;
  if (Array.isArray(r.pending)) o.pending = r.pending.filter((a) => a && typeof a.id === 'string').slice(-MAX_PENDING);
  if (typeof r.failures === 'number') o.failures = Math.max(0, Math.floor(r.failures));
  if (typeof r.nextTry === 'number') o.nextTry = r.nextTry;
  if (typeof r.lastSync === 'number') o.lastSync = r.lastSync;
  if (typeof r.lastError === 'string') o.lastError = r.lastError;
  return o;
}
