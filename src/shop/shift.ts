import { createRng, pick } from '../core/random';
import type { VehicleId } from '../lessons/engine/types';
import type { JobOutcome } from './economy';
import { type ExtraId, JOBS, type JobTemplate, jobById, tierNeeded } from './jobs';
import { type DaySheet, type PendingJob, type ShopSave, tierFor } from './model';
import { round2 } from './price-book';

export interface ShiftJob {
  job: JobTemplate;
  vehicle: VehicleId;
  customerId: string;
  comeback: PendingJob | null;
  /** A found-it check for this car, and what is really there. */
  extra: { id: ExtraId; severity: 0 | 1 | 2 } | null;
  /** Seed for the lesson variant. */
  seed: number;
}

export const MAX_COMEBACKS_PER_SHIFT = 2;

/** Every job and vehicle the shop's tier allows. */
export function availableJobs(
  tier: number,
  upgrades: readonly string[] = [],
): { job: JobTemplate; vehicle: VehicleId }[] {
  const out: { job: JobTemplate; vehicle: VehicleId }[] = [];
  for (const job of JOBS.filter((j) => !j.needs || upgrades.includes(j.needs)))
    for (const vehicle of job.vehicles) if (tierNeeded(job, vehicle) <= tier) out.push({ job, vehicle });
  return out;
}

/**
 * Drafts the next shift: 3–5 customers, comebacks first. Jobs from the newest
 * unlocked tier are favored so new work shows up soon after a promotion.
 * Takes the comebacks it uses off the save's queue.
 */
export function draftShift(shop: ShopSave, seed: number): ShiftJob[] {
  const rng = createRng(seed);
  const tier = tierFor(shop.rep);
  const count = 3 + Math.floor(rng() * 3);
  const jobs: ShiftJob[] = [];

  const comebacks = shop.pending.splice(0, MAX_COMEBACKS_PER_SHIFT);
  for (const p of comebacks) {
    const job = jobById(p.templateId);
    if (!job) continue;
    jobs.push({ job, vehicle: p.vehicle, customerId: p.customerId, comeback: p, extra: null, seed: nextSeed(rng) });
  }

  const pool = availableJobs(tier, shop.upgrades);
  const used = new Set(jobs.map((j) => j.job.id));
  // A new shop only has a few kinds of work, so its shifts are shorter.
  const kinds = new Set(pool.map((p) => p.job.id)).size;
  const target = Math.max(jobs.length, Math.min(count, kinds));
  while (jobs.length < target) {
    const fresh = pool.filter((p) => !used.has(p.job.id));
    if (fresh.length === 0) break;
    const choices = fresh;
    const newest = choices.filter((p) => tierNeeded(p.job, p.vehicle) === tier);
    const from = newest.length > 0 && rng() < 0.5 ? newest : choices;
    const { job, vehicle } = pick(rng, from);
    used.add(job.id);
    let extra: ShiftJob['extra'] = null;
    const extras = job.extras;
    if (extras.length > 0 && rng() < 0.5) {
      const real = rng() < 0.6;
      extra = { id: pick(rng, extras), severity: real ? (rng() < 0.5 ? 1 : 2) : 0 };
    }
    jobs.push({ job, vehicle, customerId: job.customer, comeback: null, extra, seed: nextSeed(rng) });
  }
  return jobs;
}

function nextSeed(rng: () => number): number {
  return Math.floor(rng() * 2 ** 31);
}

export interface FinishedJob {
  shiftJob: ShiftJob;
  outcome: JobOutcome;
}

/** The end-of-day sheet for a finished shift. */
export function daySheet(shift: number, done: FinishedJob[], date = new Date().toISOString()): DaySheet {
  const sum = (f: (o: JobOutcome) => number) => round2(done.reduce((a, d) => a + f(d.outcome), 0));
  return {
    shift,
    date,
    jobs: done.map(({ shiftJob, outcome }) => ({
      title: shiftJob.job.title,
      customer: shiftJob.customerId,
      vehicle: shiftJob.vehicle,
      net: outcome.net,
      rep: outcome.rep,
      outcome: outcome.outcome,
    })),
    income: sum((o) => o.income),
    partsCost: sum((o) => o.partsCost),
    hints: sum((o) => o.hintCost),
    tips: sum((o) => o.tip),
    net: sum((o) => o.net),
    repChange: done.reduce((a, d) => a + d.outcome.rep, 0),
    comebacksBooked: done.filter((d) => d.outcome.comeback).length,
  };
}
