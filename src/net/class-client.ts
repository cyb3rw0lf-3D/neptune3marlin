import type { Profile, SaveStore } from '../core/save';
import type {
  AttemptUpload,
  ClassSettings,
  Heartbeat,
  JoinRequest,
  JoinResponse,
  ShopUpload,
  SyncResponse,
} from './protocol';
import { isDue, markFailed, markSent, nextBatch } from './sync-queue';

/** The API's address, set at build time. Without it, class features stay hidden. */
export const API_URL: string | null = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') || null;

const SYNC_EVERY_MS = 60_000;
const TIMEOUT_MS = 10_000;

export type JoinResult = { ok: true; className: string } | { ok: false; error: string };

/**
 * Joins classes and uploads results in the background. Everything is queued in
 * the save first, so the game works the same with no network and catches up later.
 */
export class ClassClient {
  /** Called when the class settings change (locks, Shop mode) or the sync state changes. */
  onChange: () => void = () => {};
  /** What the student is doing right now, for the teacher's live view. */
  heartbeat: () => Heartbeat | null = () => null;
  private timer: number | null = null;
  private syncing: Promise<void> | null = null;

  constructor(
    private readonly save: SaveStore,
    readonly baseUrl: string | null = API_URL,
  ) {}

  get enabled(): boolean {
    return this.baseUrl !== null;
  }

  start(): void {
    if (!this.enabled || this.timer !== null) return;
    this.timer = window.setInterval(() => void this.sync(), SYNC_EVERY_MS);
    window.addEventListener('focus', () => void this.sync());
    window.addEventListener('online', () => void this.sync(true));
  }

  private async request<T>(method: string, path: string, body: unknown, token?: string): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new ApiError(res.status, data.error ?? `error ${res.status}`);
    return data;
  }

  /** Joins a class with a class code and nickname, or a roster code. */
  async join(req: JoinRequest): Promise<JoinResult> {
    if (!this.enabled) return { ok: false, error: 'Classes are not set up for this copy of the game.' };
    try {
      const res = await this.request<JoinResponse>('POST', '/join', req);
      this.save.linkClass({
        className: res.className,
        nickname: res.nickname,
        studentId: res.studentId,
        token: res.token,
        settings: res.settings,
      });
      this.onChange();
      void this.sync(true);
      return { ok: true, className: res.className };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof ApiError ? capitalize(err.message) : 'Could not reach the class server.',
      };
    }
  }

  leave(): void {
    this.save.unlinkClass();
    this.onChange();
  }

  /**
   * Shared headsets in a "sign in every session" class: uploads what is left,
   * then forgets every such student on this device. Students with results that
   * could not be uploaded yet stay until they can.
   */
  async endSessions(): Promise<number> {
    const shared = this.save.data.profiles.filter((p) => p.class?.settings.signIn === 'session');
    if (shared.length === 0) return 0;
    await this.sync(true);
    let removed = 0;
    for (const p of shared) {
      if ((p.class?.outbox.pending.length ?? 0) === 0) {
        this.save.deleteProfile(p.id);
        removed++;
      }
    }
    return removed;
  }

  /** Uploads queued results, Shop stats and a heartbeat. Safe to call often. */
  sync(force = false): Promise<void> {
    if (this.syncing) return this.syncing;
    this.syncing = this.run(force).finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  private async run(force: boolean): Promise<void> {
    const active = this.save.activeProfile;
    if (active) await this.syncProfile(active, force, true);
    // Other students on this headset may still have results waiting (shared devices).
    for (const p of this.save.data.profiles)
      if (p !== active && p.class && p.class.outbox.pending.length > 0) await this.syncProfile(p, force, false);
  }

  private async syncProfile(profile: Profile, force: boolean, live: boolean): Promise<void> {
    const link = profile.class;
    if (!this.enabled || !link) return;
    const now = Date.now();
    if (!force && !isDue(link.outbox, now)) return;
    try {
      // Send the queue in batches; the last request also carries the heartbeat and Shop stats.
      for (let guard = 0; guard < 20; guard++) {
        const batch = nextBatch(link.outbox);
        const last = batch.length === link.outbox.pending.length;
        const body = {
          attempts: batch,
          ...(last ? { shop: shopStats(profile), heartbeat: (live ? this.heartbeat() : null) ?? undefined } : {}),
        };
        let res: SyncResponse;
        try {
          res = await this.request<SyncResponse>('POST', '/sync', body, link.token);
          markSent(link.outbox, batch, Date.now());
        } catch (err) {
          // An older server can refuse a run from a lesson it does not know yet. Send the
          // batch one at a time so one refused run never blocks the rest; refused runs stay
          // in the student's own records.
          if (!(err instanceof ApiError && err.status === 400 && batch.length > 0)) throw err;
          res = await this.sendOneByOne(link.token, batch, body);
          link.outbox.lastError = null;
        }
        const changed =
          JSON.stringify(res.settings) !== JSON.stringify(link.settings) || res.className !== link.className;
        link.settings = res.settings;
        link.className = res.className;
        this.save.persist();
        if (changed) this.onChange();
        if (last) break;
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // The teacher removed this student or deleted the class.
        link.outbox.lastError = 'This class no longer exists. Join again with a new code.';
        this.save.persist();
        this.onChange();
        return;
      }
      markFailed(link.outbox, Date.now(), err instanceof Error ? err.message : String(err));
      this.save.persist();
    }
  }

  private async sendOneByOne(
    token: string,
    batch: AttemptUpload[],
    body: { shop?: ShopUpload; heartbeat?: Heartbeat },
  ): Promise<SyncResponse> {
    const profile = this.save.data.profiles.find((p) => p.class?.token === token);
    const outbox = profile?.class?.outbox;
    let last: SyncResponse | null = null;
    for (const a of batch) {
      try {
        last = await this.request<SyncResponse>('POST', '/sync', { attempts: [a] }, token);
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 400)) throw err;
      }
      if (outbox) markSent(outbox, [a], Date.now());
    }
    // One last call carries the Shop stats and heartbeat (and returns the class settings).
    return last ?? (await this.request<SyncResponse>('POST', '/sync', { attempts: [], ...body }, token));
  }

  /** Short status line for the menu: class name and how syncing is going. */
  status(profile: Profile | null): string | null {
    const link = profile?.class;
    if (!link) return null;
    const o = link.outbox;
    if (o.lastError && o.failures === 0) return `${link.className} · ${o.lastError}`;
    if (o.pending.length > 0) return `${link.className} · ${o.pending.length} result(s) waiting to upload`;
    return `${link.className} · ${o.lastSync ? 'all results uploaded' : 'joined'}`;
  }

  settings(): ClassSettings | null {
    return this.save.activeProfile?.class?.settings ?? null;
  }
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const capitalize = (s: string) => (s ? `${s[0]?.toUpperCase()}${s.slice(1)}.` : s);

/** The Shop career summary the teacher sees. */
export function shopStats(profile: Profile): ShopUpload | undefined {
  const shop = profile.shop;
  if (!shop || shop.shift === 0) return undefined;
  const jobs = shop.days.reduce((a, d) => a + d.jobs.length, 0);
  const safetyStops = shop.days.reduce((a, d) => a + d.jobs.filter((j) => j.outcome.startsWith('Stopped')).length, 0);
  return {
    money: Math.round(shop.money * 100) / 100,
    rep: shop.rep,
    shifts: shop.shift,
    jobs,
    comebacks: shop.days.reduce((a, d) => a + d.comebacksBooked, 0),
    safetyStops,
    upgrades: shop.upgrades.length,
  };
}
