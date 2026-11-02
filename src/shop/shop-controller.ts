import type { SoundFx } from '../audio/sfx';
import { createRng, randomSeed } from '../core/random';
import type { SaveStore } from '../core/save';
import type { Tweens } from '../core/tween';
import { LINES } from '../guide/lines';
import { type Narrator, readingSeconds } from '../guide/narration';
import type { Valkyrie } from '../guide/valkyrie';
import { lessonById } from '../lessons/content';
import type { FinishInfo, LessonSession } from '../lessons/session';
import type { DialogButton, DialogSpec, Hud } from '../ui/hud';
import { UI } from '../ui/panel';
import { VEHICLES } from '../vehicles/specs';
import type { World } from '../world/world';
import { applyOutcome, type ExtraResult, settleJob } from './economy';
import { planJob } from './job-plan';
import { EXTRAS } from './jobs';
import { CUSTOMERS, type CustomerDef, TIER_NAMES, TIER_UNLOCKS, tierFor } from './model';
import { money, type QuoteLine, quote, SERVICES, type ServiceId, serviceLines } from './price-book';
import { daySheet, draftShift, type FinishedJob, type ShiftJob } from './shift';
import { CUSTOMER_LINES } from './talk';

export interface ShopDeps {
  world: World;
  hud: Hud;
  narrator: Narrator;
  valkyrie: Valkyrie;
  tweens: Tweens;
  sfx: SoundFx;
  save: SaveStore;
  session: LessonSession;
  teleport: (spot: string, instant?: boolean) => void;
  /** Called when the shift ends or is abandoned. */
  done: () => void;
}

type Phase = 'idle' | 'counter' | 'job' | 'wrap-up';

/**
 * Runs a Shop mode shift: each customer walks up to the counter, the student
 * asks questions and writes up a service, the car drives in, the job runs as a
 * Practice lesson, and the money and reputation land on the day sheet.
 */
export class ShopController {
  phase: Phase = 'idle';
  jobs: ShiftJob[] = [];
  index = 0;
  finished: FinishedJob[] = [];
  /** Counter state for the current customer (also read by tests). */
  asked: number[] = [];
  wrongPicks = 0;
  approved: QuoteLine[] = [];
  private shiftNo = 0;
  private status = '';

  constructor(private readonly d: ShopDeps) {}

  get active(): boolean {
    return this.phase !== 'idle';
  }

  get current(): ShiftJob | null {
    return this.jobs[this.index] ?? null;
  }

  private customer(sj: ShiftJob): CustomerDef {
    return CUSTOMERS.find((c) => c.id === sj.customerId) ?? (CUSTOMERS[0] as CustomerDef);
  }

  /** Starts a new shift. */
  start(seed = randomSeed()): void {
    const shop = this.d.save.shop();
    this.jobs = draftShift(shop, seed);
    this.d.save.persist();
    this.shiftNo = shop.shift + 1;
    this.index = 0;
    this.finished = [];
    void this.d.narrator.say(LINES.shopWelcome);
    void this.serve();
  }

  /** Leaves mid-shift: unfinished comebacks go back on the queue. */
  abandon(): void {
    if (!this.active) return;
    const shop = this.d.save.shop();
    for (const sj of this.jobs.slice(this.index)) if (sj.comeback) shop.pending.unshift(sj.comeback);
    this.d.save.persist();
    this.cleanup();
  }

  private cleanup(): void {
    this.phase = 'idle';
    this.jobs = [];
    this.d.world.hideCustomer();
    this.d.world.setCounterOpen(false);
    this.d.world.parkInBay();
  }

  // --- the counter ---

  private async serve(): Promise<void> {
    const sj = this.current;
    if (!sj) {
      this.endShift();
      return;
    }
    const w = this.d.world;
    this.phase = 'counter';
    this.asked = [];
    this.wrongPicks = 0;
    this.approved = [];
    this.status = '';
    w.reset();
    w.layoutCart([]);
    w.setVehicle(sj.vehicle);
    w.parkOutside();
    w.setCounterOpen(true);
    this.d.teleport('counter', true);
    const c = this.customer(sj);
    w.showCustomer(c.look);
    await w.walkCustomer(this.d.tweens, true);
    if (sj.comeback) {
      void this.d.narrator.say(LINES.shopComeback).then(() => this.say(sj, sj.comeback?.note ?? ''));
      this.counterDialog();
    } else {
      void this.say(sj, sj.job.complaint);
      this.counterDialog();
    }
  }

  /** The customer speaks in their own voice and nods along. */
  private say(sj: ShiftJob, text: string): Promise<void> {
    const c = this.customer(sj);
    this.d.world.customer?.talk(readingSeconds(text));
    return this.d.narrator.say(text, c.voice);
  }

  private header(sj: ShiftJob): string {
    const c = this.customer(sj);
    return `Customer ${this.index + 1} of ${this.jobs.length}: ${c.name} · ${VEHICLES[sj.vehicle].name}`;
  }

  private open(spec: DialogSpec): void {
    this.d.hud.openDialog(spec);
  }

  counterDialog(): void {
    const sj = this.current;
    if (!sj) return;
    const c = this.customer(sj);
    if (sj.comeback) {
      this.open({
        tone: 'warn',
        title: `${c.name} is back: ${sj.job.title}`,
        body: `"${sj.comeback.note}"\n\nComebacks are redone at no charge. The parts still cost the shop.`,
        buttons: [
          {
            id: 'shop-comeback-ok',
            label: 'Bring the car in',
            variant: 'primary',
            onClick: () => this.comebackQuote(),
          },
        ],
      });
      return;
    }
    const last = sj.job.questions[this.asked[this.asked.length - 1] ?? -1];
    const buttons: DialogButton[] = sj.job.questions
      .map((q, i) => ({ q, i }))
      .filter(({ i }) => !this.asked.includes(i))
      .map(({ q, i }) => ({ id: `shop-ask-${i}`, label: `Ask: "${q.q}"`, onClick: () => this.ask(i) }));
    buttons.push({
      id: 'shop-write-up',
      label: 'Write up the service',
      variant: 'primary',
      onClick: () => this.servicePicker(),
    });
    // The newest answer is shown; the dialog has room for one exchange at a time.
    const said = last ? `You: "${last.q}"\n${c.name}: "${last.a}"` : '';
    this.open({
      tone: 'question',
      title: this.header(sj),
      body: `${c.name}: "${sj.job.complaint}"${said ? `\n${said}` : ''}`,
      buttons,
      layout: 'stack',
    });
  }

  ask(i: number): void {
    const sj = this.current;
    const q = sj?.job.questions[i];
    if (!sj || !q || this.asked.includes(i)) return;
    this.asked.push(i);
    this.d.sfx.play('click');
    void this.say(sj, q.a);
    this.counterDialog();
  }

  /** Services the shop offers for this vehicle, as counter choices. */
  services(): ServiceId[] {
    const sj = this.current;
    if (!sj) return [];
    return (Object.keys(SERVICES) as ServiceId[]).filter(
      (id) => !SERVICES[id].extraOnly && SERVICES[id].hours[sj.vehicle] !== undefined,
    );
  }

  servicePicker(): void {
    const sj = this.current;
    if (!sj) return;
    const buttons: DialogButton[] = this.services().map((id) => ({
      id: `shop-svc-${id}`,
      label: `${SERVICES[id].name} · ${SERVICES[id].hours[sj.vehicle]} h`,
      onClick: () => this.pick(id),
    }));
    buttons.push({ id: 'shop-svc-back', label: 'Back to the customer', onClick: () => this.counterDialog() });
    this.open({
      tone: 'question',
      title: 'Which service fits the complaint?',
      body: this.status || `"${sj.job.complaint}"`,
      buttons,
      layout: 'stack',
    });
  }

  pick(id: ServiceId): void {
    const sj = this.current;
    if (!sj) return;
    if (id !== sj.job.service) {
      this.wrongPicks++;
      this.d.sfx.play('error');
      this.status = `Not quite. ${LINES.shopWrongService}`;
      void this.d.narrator.say(LINES.shopWrongService);
      this.servicePicker();
      return;
    }
    this.status = '';
    this.d.sfx.play('click');
    this.approved = serviceLines(id, sj.vehicle);
    this.quoteDialog();
  }

  private quoteList(lines: QuoteLine[]): { text: string; color?: string }[] {
    const q = quote(lines);
    return [
      ...lines.map((l) => ({
        text:
          l.kind === 'labor'
            ? `Labor: ${l.name}, ${l.hours} h: ${money(l.price)}`
            : `Part: ${l.name}: ${money(l.price)}`,
      })),
      { text: `Shop supplies ${money(q.supplies)} · Tax ${money(q.tax)}` },
      { text: `Estimate total: ${money(q.total)}`, color: UI.text },
    ];
  }

  quoteDialog(): void {
    const sj = this.current;
    if (!sj) return;
    const c = this.customer(sj);
    const after = SERVICES[sj.job.service].id === 'battery-test' || sj.job.service === 'engine-diag';
    this.open({
      tone: 'info',
      title: `Estimate for ${c.name}: ${SERVICES[sj.job.service].name}`,
      body: `${SERVICES[sj.job.service].blurb}${after ? ' Any parts are added once you find the cause.' : ''}`,
      list: this.quoteList(this.approved),
      buttons: [
        { id: 'shop-present', label: 'Present the estimate', variant: 'primary', onClick: () => this.present() },
      ],
    });
  }

  private comebackQuote(): void {
    const sj = this.current;
    if (!sj) return;
    this.approved = serviceLines(sj.job.service, sj.vehicle);
    void this.say(sj, CUSTOMER_LINES.comebackOk);
    void this.beginJob();
  }

  present(): void {
    const sj = this.current;
    if (!sj) return;
    this.d.hud.closeDialog();
    void this.say(sj, CUSTOMER_LINES.approve);
    void this.beginJob();
  }

  // --- the job ---

  private async beginJob(): Promise<void> {
    const sj = this.current;
    if (!sj) return;
    this.d.hud.closeDialog();
    this.phase = 'job';
    const w = this.d.world;
    const c = this.customer(sj);
    // The customer heads to the waiting room while the car comes in.
    void w.walkCustomer(this.d.tweens, false).then(() => {
      if (this.phase === 'job') w.hideCustomer();
    });
    w.setCounterOpen(false);
    const shop = this.d.save.shop();
    const plan = planJob(sj, shop.upgrades);
    w.scanTool.pro = shop.upgrades.includes('pro-scan');
    const lesson = lessonById(sj.job.lesson);
    this.d.session.start(lesson, 'practice', sj.vehicle, sj.seed, {
      match: plan.match,
      adjustSteps: plan.adjustSteps,
      cartExtra: plan.cartExtra,
      workOrderExtra: [`Customer: ${c.name}. ${sj.job.complaint}`, ...plan.workOrderExtra],
      stopOnCritical: true,
      record: false,
      title: `Job ${this.index + 1} of ${this.jobs.length}: ${sj.job.title}`,
      intro: sj.comeback ? LINES.shopComeback : LINES.shopJobIntro,
      digitalTorque: shop.upgrades.includes('digital-torque'),
      banner: `${sj.job.title} · ${c.name}`,
      beforeBegin: () => w.rollIn(this.d.tweens),
    });
  }

  /** The lesson finished (or stopped on a safety error). */
  onJobFinished(info: FinishInfo): void {
    const sj = this.current;
    if (!sj || this.phase !== 'job') return;
    this.phase = 'wrap-up';
    if (info.safetyStop) void this.d.narrator.say(LINES.shopSafetyStop);
    const extra = sj.extra;
    if (extra && !info.safetyStop) {
      const check = EXTRAS[extra.id].check.replace(/-/g, '_');
      const codes = info.result.mistakes.filter((m) => m.code.startsWith(`inspection.${check}.`)).map((m) => m.code);
      const missed = codes.some((c) => c.endsWith('.missed'));
      if (extra.severity > 0 && !missed) {
        this.recommendDialog(sj, info, codes);
        return;
      }
      if (extra.severity === 0 && codes.length === 0) void this.d.narrator.say(LINES.shopHonest);
      this.settle(sj, info, { id: extra.id, severity: extra.severity, codes, approved: false });
      return;
    }
    this.settle(sj, info, null);
  }

  private recommendDialog(sj: ShiftJob, info: FinishInfo, codes: string[]): void {
    const extra = sj.extra;
    if (!extra) return;
    const c = this.customer(sj);
    const def = EXTRAS[extra.id];
    const canDo = !def.needs || this.d.save.shop().upgrades.includes(def.needs);
    const lines = serviceLines(def.service, sj.vehicle);
    this.open({
      tone: 'question',
      title: `Call ${c.name}: ${SERVICES[def.service].name}`,
      body: canDo
        ? `You found a real problem on the courtesy check. Recommend it to ${c.name} with an estimate.`
        : LINES.shopRefer,
      list: canDo ? this.quoteList(lines) : undefined,
      buttons: [
        {
          id: 'shop-recommend',
          label: canDo ? 'Recommend it' : 'Recommend and refer',
          variant: 'primary',
          onClick: () => {
            this.d.hud.closeDialog();
            const rng = createRng(sj.seed ^ 0x5bd1e995);
            const yes = rng() < 0.75;
            const line = !canDo ? CUSTOMER_LINES.extraRefer : yes ? CUSTOMER_LINES.extraYes : CUSTOMER_LINES.extraNo;
            void this.d.narrator.say(line, c.voice);
            this.settle(sj, info, { id: extra.id, severity: extra.severity, codes, approved: yes });
          },
        },
      ],
    });
    if (!canDo) void this.d.narrator.say(LINES.shopRefer);
  }

  private settle(sj: ShiftJob, info: FinishInfo, extra: ExtraResult | null): void {
    const shop = this.d.save.shop();
    const tierBefore = tierFor(shop.rep);
    const found = info.safetyStop || sj.comeback ? [] : (sj.job.partsAfter?.(info.variant, VEHICLES[sj.vehicle]) ?? []);
    const outcome = settleJob({
      job: sj.job,
      vehicle: sj.vehicle,
      approved: this.approved,
      found,
      run: info.result,
      wrongPicks: this.wrongPicks,
      safetyStop: info.safetyStop,
      comeback: sj.comeback,
      extra,
      upgrades: shop.upgrades,
      customerId: sj.customerId,
    });
    applyOutcome(shop, outcome);
    this.d.save.persist();
    this.finished.push({ shiftJob: sj, outcome });
    const tierAfter = tierFor(shop.rep);
    const promoted = tierAfter > tierBefore;
    if (promoted) void this.d.narrator.say(LINES.shopPromotion);

    const list: { text: string; color?: string }[] = [
      { text: `Invoice ${money(outcome.invoice.total)} · Parts cost ${money(outcome.partsCost)}` },
      ...(outcome.hintCost ? [{ text: `Hints: −${money(outcome.hintCost)}`, color: UI.warn }] : []),
      ...(outcome.tip ? [{ text: `Tip for quick, clean work: ${money(outcome.tip)}`, color: UI.good }] : []),
      ...outcome.repNotes.map((n) => ({
        text: `${n.amount >= 0 ? '+' : ''}${n.amount} rep · ${n.label}`,
        color: n.amount >= 0 ? UI.good : UI.bad,
      })),
      ...(outcome.comeback ? [{ text: `This car will come back: "${outcome.comeback.note}"`, color: UI.bad }] : []),
      ...(promoted
        ? [{ text: `Promoted to ${TIER_NAMES[tierAfter]}! Unlocked: ${TIER_UNLOCKS[tierAfter]}`, color: UI.good }]
        : []),
    ];
    const last = this.index >= this.jobs.length - 1;
    this.open({
      tone: info.safetyStop ? 'safety' : outcome.rep >= 0 ? 'good' : 'warn',
      title: `${info.safetyStop ? 'Job stopped' : 'Job done'}: ${sj.job.title}`,
      body: `${outcome.outcome}. Shop money ${money(shop.money)}, reputation ${shop.rep}/100.`,
      badge: { text: money(outcome.net), color: outcome.net >= 0 ? UI.good : UI.bad },
      list,
      buttons: [
        {
          id: 'shop-next',
          label: last ? 'Finish the shift' : 'Next customer',
          variant: 'primary',
          onClick: () => void this.next(info.safetyStop),
        },
      ],
    });
  }

  private async next(stopped: boolean): Promise<void> {
    const sj = this.current;
    this.d.hud.closeDialog();
    this.d.session.quietQuit();
    const w = this.d.world;
    if (sj && !stopped) {
      // The customer picks the car up and pays.
      w.showCustomer(this.customer(sj).look);
      void this.say(sj, CUSTOMER_LINES.thanks);
    }
    await w.rollOut(this.d.tweens);
    w.hideCustomer();
    this.index++;
    void this.serve();
  }

  private endShift(): void {
    const shop = this.d.save.shop();
    const sheet = daySheet(this.shiftNo, this.finished);
    shop.days.push(sheet);
    if (shop.days.length > 20) shop.days.splice(0, shop.days.length - 20);
    shop.shift = this.shiftNo;
    this.d.save.persist();
    void this.d.narrator.say(LINES.shopShiftDone);
    this.cleanup();
    this.open({
      tone: sheet.net >= 0 ? 'good' : 'warn',
      title: `Day sheet: shift ${sheet.shift}`,
      body: `Shop money ${money(shop.money)} · Reputation ${shop.rep}/100 (${TIER_NAMES[tierFor(shop.rep)]})`,
      badge: { text: money(sheet.net), color: sheet.net >= 0 ? UI.good : UI.bad },
      list: [
        ...sheet.jobs.map((j) => ({
          text: `${j.title}: ${j.outcome}. ${money(j.net)}, ${j.rep >= 0 ? '+' : ''}${j.rep} rep`,
          color: j.rep >= 0 ? UI.muted : UI.bad,
        })),
        {
          text: `Income ${money(sheet.income)} · Parts ${money(sheet.partsCost)} · Hints ${money(sheet.hints)} · Tips ${money(sheet.tips)}`,
        },
        ...(sheet.comebacksBooked
          ? [{ text: `${sheet.comebacksBooked} comeback(s) booked for next shift`, color: UI.bad }]
          : []),
      ],
      buttons: [
        {
          id: 'shop-day-done',
          label: 'Back to the shop',
          variant: 'primary',
          onClick: () => {
            this.d.hud.closeDialog();
            this.d.done();
          },
        },
      ],
    });
  }
}
