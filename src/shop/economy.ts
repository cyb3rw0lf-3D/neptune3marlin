import type { RunResult, VehicleId } from '../lessons/engine/types';
import { COMEBACK_NOTES, EXTRAS, type ExtraId, type JobTemplate } from './jobs';
import { type DayLine, MAX_REP, type PendingJob, REP, type ShopSave, type UpgradeId } from './model';
import { HINT_COST, type Quote, type QuoteLine, quote, round2, serviceLines } from './price-book';

/** How the found-it check at the end of a job went. */
export interface ExtraResult {
  id: ExtraId;
  /** 0 fine, 1 soon, 2 now: what was really there. */
  severity: 0 | 1 | 2;
  /** Mistake codes the student made on the extra check. */
  codes: string[];
  /** Whether the customer said yes when a real problem was recommended. */
  approved: boolean;
}

export interface JobInput {
  job: JobTemplate;
  vehicle: VehicleId;
  /** Lines the customer approved at the counter. */
  approved: QuoteLine[];
  /** Lines added once the work showed what the car needed. */
  found: QuoteLine[];
  run: RunResult;
  /** Wrong services picked at the counter before the right one. */
  wrongPicks: number;
  /** The job stopped on a safety-critical error. */
  safetyStop: boolean;
  comeback: PendingJob | null;
  extra: ExtraResult | null;
  upgrades: UpgradeId[];
  customerId: string;
}

export interface JobOutcome {
  invoice: Quote;
  /** Money the shop keeps from the invoice (labor, parts and supplies; tax goes to the state). */
  income: number;
  partsCost: number;
  hintCost: number;
  tip: number;
  net: number;
  rep: number;
  /** Each reputation change with its reason, for the day sheet. */
  repNotes: DayLine[];
  comeback: PendingJob | null;
  /** One line for the day sheet. */
  outcome: string;
}

const isExtraCode = (code: string, extra: ExtraResult | null) =>
  !!extra && code.startsWith(`inspection.${EXTRAS[extra.id].check.replace(/-/g, '_')}.`);

/** Seconds a clean job may take and still earn the efficiency tip. */
export function efficientSeconds(stepsTotal: number): number {
  return stepsTotal * 14;
}

/** Works out pay, parts, tips and reputation for one finished (or stopped) job. */
export function settleJob(input: JobInput): JobOutcome {
  const { run, extra } = input;
  const repNotes: DayLine[] = [];
  const addRep = (label: string, amount: number) => repNotes.push({ label, amount });

  if (input.comeback) addRep('Comeback: the car came back with a problem', REP.comeback);
  if (input.wrongPicks > 0) addRep('Picked the wrong service at the counter', REP.wrongService * input.wrongPicks);
  else if (!input.comeback) addRep('Picked the right service first try', REP.rightServiceFirstTry);

  if (input.safetyStop) {
    addRep('Job stopped for a safety error', REP.safetyStop);
    const rep = repNotes.reduce((a, n) => a + n.amount, 0);
    const hintCost = run.hints * HINT_COST;
    return {
      invoice: quote([]),
      income: 0,
      partsCost: 0,
      hintCost,
      tip: 0,
      net: -hintCost,
      rep,
      repNotes,
      comeback: null,
      outcome: 'Stopped: safety error, no charge',
    };
  }

  const workMistakes = run.mistakes.filter((m) => !isExtraCode(m.code, extra));
  const clean = workMistakes.length === 0 && run.hints === 0;
  addRep(clean ? 'Clean work' : 'Work done, with mistakes', clean ? REP.cleanJob : REP.jobWithMistakes);
  if (input.comeback && clean) addRep('Fixed the comeback properly', 2);

  const lines = [...input.approved, ...input.found];
  let extraNote = '';
  if (extra) {
    const falseFlag = extra.codes.some((c) => c.endsWith('.false_flag'));
    const missed = extra.codes.some((c) => c.endsWith('.missed'));
    if (falseFlag) {
      addRep('Recommended a part that was fine', REP.falseUpsell);
      extraNote = ', false upsell caught';
    } else if (missed) {
      addRep('Missed a real problem', REP.missedFind);
    }
    if (extra.severity > 0 && !missed) {
      addRep('Honest recommendation', REP.honestFind);
      const def = EXTRAS[extra.id];
      const canDo = !def.needs || input.upgrades.includes(def.needs);
      if (extra.approved && canDo) {
        lines.push(...serviceLines(def.service, input.vehicle));
        extraNote = ', extra work approved';
      } else if (extra.approved) {
        extraNote = ', referred out (no balancer)';
      } else {
        extraNote = ', customer declined the extra';
      }
    }
  }

  const invoice = quote(lines);
  // A comeback is redone for free; the shop still pays for any parts.
  const income = input.comeback ? 0 : round2(invoice.labor + invoice.parts + invoice.supplies);
  const hintCost = run.hints * HINT_COST;
  let tip = 0;
  if (clean && !input.comeback && run.durationSec <= efficientSeconds(run.stepsTotal)) {
    tip = Math.max(5, Math.round(invoice.labor * 0.1));
    addRep('Finished close to book time', REP.efficient);
  }

  let comeback: PendingJob | null = null;
  if (!input.comeback) {
    const cause = workMistakes.find((m) => !m.critical && COMEBACK_NOTES[m.code]);
    if (cause) {
      comeback = {
        templateId: input.job.id,
        vehicle: input.vehicle,
        customerId: input.customerId,
        kind: 'comeback',
        cause: cause.code,
        note: COMEBACK_NOTES[cause.code],
      };
    }
  }

  const rep = repNotes.reduce((a, n) => a + n.amount, 0);
  const partsCost = invoice.partsCost;
  const net = round2(income - partsCost - hintCost + tip);
  const outcome = input.comeback
    ? 'Comeback redone at no charge'
    : `${clean ? 'Clean job' : 'Done with mistakes'}${extraNote}`;
  return { invoice, income, partsCost, hintCost, tip, net, rep, repNotes, comeback, outcome };
}

/** Applies a job's money and reputation to the save. */
export function applyOutcome(shop: ShopSave, out: JobOutcome): void {
  shop.money = round2(shop.money + out.net);
  shop.rep = Math.max(0, Math.min(MAX_REP, shop.rep + out.rep));
  if (out.comeback) shop.pending.push(out.comeback);
}
