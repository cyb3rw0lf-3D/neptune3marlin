import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/random';
import { emptySave, SaveStore } from '../../src/core/save';
import { lessonById } from '../../src/lessons/content';
import { LessonRunner } from '../../src/lessons/engine/runner';
import type { MistakeRecord, RunResult, StepDef } from '../../src/lessons/engine/types';
import { applyOutcome, efficientSeconds, type JobInput, settleJob } from '../../src/shop/economy';
import { applyUpgrades, matchingSeed, planJob } from '../../src/shop/job-plan';
import { COMEBACK_NOTES, JOBS, jobById, tierNeeded } from '../../src/shop/jobs';
import { CUSTOMERS, newShop, REP, START_MONEY, sanitizeShop, TIER_AT, tierFor } from '../../src/shop/model';
import { HINT_COST, LABOR_RATE, quote, SERVICES, serviceLines } from '../../src/shop/price-book';
import { availableJobs, daySheet, draftShift, type ShiftJob } from '../../src/shop/shift';
import { VEHICLES } from '../../src/vehicles/specs';

const run = (over: Partial<RunResult> = {}): RunResult => ({
  completed: true,
  score: 100,
  passed: true,
  criticalCount: 0,
  mistakes: [],
  hints: 0,
  durationSec: 60,
  stepsDone: 10,
  stepsTotal: 10,
  ...over,
});

const mistake = (code: string, critical = false): MistakeRecord => ({
  code,
  kind: critical ? 'safety' : 'value',
  label: code,
  explain: 'x',
  critical,
  penalty: 10,
  stepId: 's',
  count: 1,
});

function input(over: Partial<JobInput> = {}): JobInput {
  const job = jobById('oil-due');
  if (!job) throw new Error('missing job');
  return {
    job,
    vehicle: 'sedan',
    approved: serviceLines('oil-change', 'sedan'),
    found: [],
    run: run(),
    wrongPicks: 0,
    safetyStop: false,
    comeback: null,
    extra: null,
    upgrades: [],
    customerId: 'maya',
    ...over,
  };
}

describe('price book', () => {
  it('prices labor at the shop rate and marks parts up from cost', () => {
    const q = quote(serviceLines('oil-change', 'sedan'));
    expect(q.labor).toBe(0.5 * LABOR_RATE);
    expect(q.partsCost).toBe(32);
    expect(q.parts).toBeCloseTo(32 * 1.4, 2);
    expect(q.supplies).toBe(3);
    expect(q.tax).toBeCloseTo(q.parts * 0.07, 2);
    expect(q.total).toBeCloseTo(q.labor + q.parts + q.supplies + q.tax, 2);
  });

  it('caps shop supplies and is empty for no lines', () => {
    expect(quote([]).total).toBe(0);
    expect(quote(serviceLines('spark-plugs', 'pickup')).supplies).toBeLessThanOrEqual(25);
  });

  it('every main job service is offered on every vehicle the job uses', () => {
    for (const job of JOBS) {
      expect(SERVICES[job.service].extraOnly).toBeFalsy();
      for (const v of job.vehicles) expect(SERVICES[job.service].hours[v], `${job.id} ${v}`).toBeGreaterThan(0);
    }
  });
});

describe('reputation and tiers', () => {
  it('maps points to tiers', () => {
    expect(tierFor(0)).toBe(0);
    expect(tierFor(TIER_AT[1] - 1)).toBe(0);
    expect(tierFor(TIER_AT[1])).toBe(1);
    expect(tierFor(100)).toBe(4);
  });

  it('opens sedan basics first and EV jobs last', () => {
    const t0 = availableJobs(0);
    expect(t0.length).toBeGreaterThan(0);
    expect(t0.every((j) => j.vehicle === 'sedan')).toBe(true);
    expect(t0.map((j) => j.job.lesson).sort()).toEqual(['inspection', 'oil-change', 'tire-service']);
    expect(availableJobs(3).some((j) => j.vehicle === 'ev')).toBe(false);
    expect(availableJobs(4).some((j) => j.vehicle === 'ev')).toBe(true);
    for (const job of JOBS) for (const v of job.vehicles) expect(tierNeeded(job, v)).toBeLessThanOrEqual(4);
  });

  it('every job customer exists', () => {
    for (const job of JOBS)
      expect(
        CUSTOMERS.some((c) => c.id === job.customer),
        job.id,
      ).toBe(true);
  });
});

describe('settling a job', () => {
  it('pays a clean, quick job with a tip and builds reputation', () => {
    const out = settleJob(input());
    expect(out.income).toBeCloseTo(out.invoice.labor + out.invoice.parts + out.invoice.supplies, 2);
    expect(out.tip).toBeGreaterThan(0);
    expect(out.net).toBeCloseTo(out.income - out.partsCost + out.tip, 2);
    expect(out.rep).toBe(REP.cleanJob + REP.rightServiceFirstTry + REP.efficient);
    expect(out.comeback).toBeNull();
  });

  it('charges hints and skips the tip when the job was slow', () => {
    const out = settleJob(input({ run: run({ hints: 2, durationSec: efficientSeconds(10) + 1 }) }));
    expect(out.hintCost).toBe(2 * HINT_COST);
    expect(out.tip).toBe(0);
    expect(out.rep).toBe(REP.jobWithMistakes + REP.rightServiceFirstTry);
  });

  it('books a comeback for a sloppy job, and redoes it for free next time', () => {
    const out = settleJob(input({ run: run({ mistakes: [mistake('oil.plug.undertorque')] }) }));
    expect(out.comeback).toMatchObject({ templateId: 'oil-due', cause: 'oil.plug.undertorque', kind: 'comeback' });
    expect(out.comeback?.note).toBe(COMEBACK_NOTES['oil.plug.undertorque']);

    const redo = settleJob(input({ comeback: out.comeback }));
    expect(redo.income).toBe(0);
    expect(redo.partsCost).toBeGreaterThan(0);
    expect(redo.net).toBeLessThan(0);
    expect(redo.rep).toBe(REP.comeback + REP.cleanJob + 2);
    expect(redo.comeback).toBeNull();
  });

  it('a safety stop pays nothing and costs reputation', () => {
    const out = settleJob(
      input({ safetyStop: true, run: run({ mistakes: [mistake('safety.lift.not_locked', true)] }) }),
    );
    expect(out.income).toBe(0);
    expect(out.rep).toBe(REP.safetyStop + REP.rightServiceFirstTry);
    expect(out.comeback).toBeNull();
  });

  it('wrong services at the counter cost reputation', () => {
    expect(settleJob(input({ wrongPicks: 2 })).rep).toBe(REP.cleanJob + REP.efficient + 2 * REP.wrongService);
  });

  it('rewards an honest find and sells the approved extra', () => {
    const out = settleJob(input({ extra: { id: 'wipers', severity: 2, codes: [], approved: true } }));
    expect(out.repNotes.some((n) => n.amount === REP.honestFind)).toBe(true);
    expect(out.invoice.lines.some((l) => l.name.startsWith('Wiper blades'))).toBe(true);
  });

  it('a declined extra still counts as honest but adds nothing to the bill', () => {
    const base = settleJob(input()).invoice.total;
    const out = settleJob(input({ extra: { id: 'wipers', severity: 1, codes: [], approved: false } }));
    expect(out.invoice.total).toBe(base);
    expect(out.outcome).toContain('declined');
  });

  it('flags a false upsell and does not treat it as sloppy work', () => {
    const out = settleJob(
      input({
        run: run({ mistakes: [mistake('inspection.wipers.false_flag')] }),
        extra: { id: 'wipers', severity: 0, codes: ['inspection.wipers.false_flag'], approved: false },
      }),
    );
    expect(out.repNotes.some((n) => n.amount === REP.falseUpsell)).toBe(true);
    expect(out.repNotes.some((n) => n.label === 'Clean work')).toBe(true);
    expect(out.comeback).toBeNull();
  });

  it('can only sell tires with the balancer', () => {
    const extra = { id: 'tires' as const, severity: 2 as const, codes: [], approved: true };
    expect(settleJob(input({ extra })).outcome).toContain('referred out');
    expect(
      settleJob(input({ extra, upgrades: ['balancer'] })).invoice.lines.some((l) => l.name.includes('Tires')),
    ).toBe(true);
  });

  it('applies money and clamps reputation', () => {
    const shop = newShop();
    const out = settleJob(input({ safetyStop: true }));
    applyOutcome(shop, out);
    expect(shop.rep).toBe(0);
    expect(shop.money).toBe(START_MONEY);
  });
});

describe('shifts', () => {
  it('drafts 3 to 5 jobs the shop is allowed to do, without repeats', () => {
    for (let seed = 0; seed < 60; seed++) {
      const shop = newShop();
      shop.rep = seed % 100;
      const jobs = draftShift(shop, seed);
      expect(jobs.length).toBeGreaterThanOrEqual(3);
      expect(jobs.length).toBeLessThanOrEqual(5);
      expect(new Set(jobs.map((j) => j.job.id)).size).toBe(jobs.length);
      for (const j of jobs) expect(tierNeeded(j.job, j.vehicle)).toBeLessThanOrEqual(tierFor(shop.rep));
    }
  });

  it('puts comebacks first and takes them off the queue', () => {
    const shop = newShop();
    shop.pending.push({ templateId: 'oil-due', vehicle: 'sedan', customerId: 'maya', kind: 'comeback', note: 'n' });
    const jobs = draftShift(shop, 3);
    expect(jobs[0]?.comeback?.templateId).toBe('oil-due');
    expect(shop.pending).toHaveLength(0);
  });

  it('builds a day sheet that adds up', () => {
    const shop = newShop();
    const jobs = draftShift(shop, 9);
    const done = jobs.map((shiftJob) => ({ shiftJob, outcome: settleJob(input()) }));
    const sheet = daySheet(1, done);
    expect(sheet.jobs).toHaveLength(jobs.length);
    expect(sheet.net).toBeCloseTo(
      done.reduce((a, d) => a + d.outcome.net, 0),
      2,
    );
  });
});

/** Parts that sit on the battery bench or the parts tray, not the cart. */
const OFF_CART = [
  'battery-new',
  'battery-wrong',
  'new-pads',
  'new-plug',
  'new-coil',
  'new-gas-cap',
  'new-vacuum-hose',
  'new-thermostat',
];

describe('Shop jobs on the real lessons', () => {
  function playPerfect(steps: StepDef[]) {
    const r = new LessonRunner(steps, 'practice');
    for (let guard = 0; guard < 300 && !r.finished; guard++) {
      const step = r.current as StepDef;
      if (step.choice) {
        r.answer(step.choice.correct);
        continue;
      }
      if (r.awaitingTag && step.tag) {
        r.answer(step.tag.correct);
        continue;
      }
      const target = r.remainingTargets()[0] as string;
      r.attempt(r.itemFor(target) as string, target);
      r.complete(target, step.measure?.spec);
    }
    return r.result();
  }

  it('every job, vehicle, courtesy check and upgrade set plays perfectly', () => {
    for (const job of JOBS) {
      const lesson = lessonById(job.lesson);
      for (const vehicleId of job.vehicles) {
        const vehicle = VEHICLES[vehicleId];
        const extras = [null, ...job.extras.flatMap((id) => [0, 1, 2].map((severity) => ({ id, severity })))];
        for (const extra of extras) {
          for (const upgrades of [[], ['impact', 'analyzer', 'digital-torque', 'pro-scan', 'balancer']] as const) {
            const sj = {
              job,
              vehicle: vehicleId,
              customerId: job.customer,
              comeback: null,
              extra,
              seed: 5,
            } as ShiftJob;
            const plan = planJob(sj, [...upgrades]);
            const seed = matchingSeed(5, (s) => !plan.match || plan.match(lesson.variant(createRng(s), vehicle)));
            const variant = lesson.variant(createRng(seed), vehicle);
            if (plan.match) expect(plan.match(variant), `${job.id} variant`).toBe(true);
            const steps = plan.adjustSteps(lesson.steps(vehicle, variant, 'us'), vehicle, variant, 'us');
            const ids = steps.map((s) => s.id);
            expect(new Set(ids).size, `${job.id} duplicate step`).toBe(ids.length);
            const onCart = lesson.cartItems.filter((i) => !OFF_CART.includes(i));
            expect(onCart.length + plan.cartExtra.length, `${job.id} cart`).toBeLessThanOrEqual(9);
            expect(playPerfect(steps), `${job.id} ${vehicleId} ${JSON.stringify(extra)}`).toMatchObject({
              completed: true,
              score: 100,
            });
          }
        }
      }
    }
  });

  it('the impact wrench upgrade turns long lug holds into presses', () => {
    const lesson = lessonById('tire-service');
    const v = lesson.variant(createRng(1), VEHICLES.sedan);
    const steps = lesson.steps(VEHICLES.sedan, v, 'us');
    const before = steps.find((s) => s.item === 'impact-wrench');
    const after = applyUpgrades(steps, ['impact'], v).find((s) => s.item === 'impact-wrench');
    expect(before?.gesture.kind).toBe('hold');
    expect(after?.gesture.kind).toBe('press');
    expect(before?.gesture.kind).toBe('hold');
  });

  it('the battery analyzer adds state of health to the voltage reading', () => {
    const lesson = lessonById('battery');
    const v = lesson.variant(createRng(1), VEHICLES.sedan);
    const step = applyUpgrades(lesson.steps(VEHICLES.sedan, v, 'us'), ['analyzer'], v).find((s) => s.id === 'volts');
    expect(step?.readings?.['battery-posts']?.note).toMatch(/Analyzer: \d+% health/);
  });

  it('comeback notes only name real mistake codes', () => {
    const codes = new Set<string>();
    for (const job of JOBS) {
      const lesson = lessonById(job.lesson);
      for (const vId of job.vehicles) {
        for (let seed = 0; seed < 40; seed++) {
          for (const step of lesson.steps(VEHICLES[vId], lesson.variant(createRng(seed), VEHICLES[vId]), 'us')) {
            for (const m of [
              step.skipMistake,
              step.orderMistake,
              step.wrongItem,
              step.choice?.wrong,
              step.measure?.over,
              step.measure?.under,
              ...Object.values(step.wrongItems ?? {}),
              ...Object.values(step.wrongTargets ?? {}),
              ...Object.values(step.choice?.wrongByOption ?? {}),
            ])
              if (m) codes.add(m.code);
          }
        }
      }
    }
    for (const code of Object.keys(COMEBACK_NOTES)) expect(codes.has(code), code).toBe(true);
  });
});

describe('shop saves', () => {
  it('repairs bad or partial data', () => {
    expect(sanitizeShop(null)).toEqual(newShop());
    const s = sanitizeShop({
      money: 'lots',
      rep: 500,
      upgrades: ['impact', 'impact', 'laser'],
      pending: [{ templateId: 'x', vehicle: 'boat', customerId: 'a', kind: 'comeback' }],
    });
    expect(s.money).toBe(START_MONEY);
    expect(s.rep).toBe(100);
    expect(s.upgrades).toEqual(['impact']);
    expect(s.pending).toEqual([]);
  });

  it('old saves without a shop still load', () => {
    const store = new Map<string, string>();
    const kv = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    const old = emptySave();
    old.profiles.push({ id: 'p1', name: 'Sam', createdAt: '2026-01-01', lessons: {}, runs: [] });
    old.activeProfileId = 'p1';
    store.set('service-bay-vr/save', JSON.stringify(old));
    const save = new SaveStore(kv);
    expect(save.shop()).toEqual(newShop());
  });
});
