import { expect, type Page, test } from '@playwright/test';
import { call, enterGame, openGame, pageErrors, state } from './helpers';

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await enterGame(page);
});

test.afterEach(async ({ page }) => {
  expect(pageErrors(page)).toEqual([]);
});

interface ShopState {
  active: boolean;
  phase: string;
  index: number;
  jobs: { job: string; lesson: string; service: string; vehicle: string; extra: unknown; comeback: string | null }[];
  asked: number[];
  wrongPicks: number;
  money: number;
  rep: number;
  upgrades: string[];
  pending: string[];
  days: number;
  customer: number[] | null;
  carPos: number[];
  carVisible: boolean;
}

interface Full {
  dialogButtons: string[];
  dialog: { title: string; body: string; list: string[] } | null;
  shop: ShopState;
  gesture: string | null;
  menu: string | null;
}

const full = (page: Page) => state(page) as unknown as Promise<Full>;

async function waitButton(page: Page, id: string): Promise<void> {
  await expect.poll(async () => (await full(page)).dialogButtons, { timeout: 30_000 }).toContain(id);
}

/** Clicks a dialog button with the real mouse, like a student would. */
async function clickDialog(page: Page, id: string): Promise<void> {
  await waitButton(page, id);
  const pos = await call<{ x: number; y: number; inView: boolean }>(page, 'buttonScreenPos', 'dialog', id);
  expect(pos.inView).toBe(true);
  await page.mouse.click(pos.x, pos.y);
}

/** Talks to the customer, writes up the job (optionally a wrong service first) and presents the estimate. */
async function counter(page: Page, wrongFirst = false): Promise<void> {
  const s = await full(page);
  const job = s.shop.jobs[s.shop.index];
  if (!job) throw new Error('no job');
  if (job.comeback) {
    await clickDialog(page, 'shop-comeback-ok');
    return;
  }
  await clickDialog(page, 'shop-ask-0');
  await expect.poll(async () => (await full(page)).shop.asked).toEqual([0]);
  await clickDialog(page, 'shop-write-up');
  if (wrongFirst) {
    const wrong = job.service === 'oil-change' ? 'inspection' : 'oil-change';
    await clickDialog(page, `shop-svc-${wrong}`);
    await expect.poll(async () => (await full(page)).shop.wrongPicks).toBe(1);
  }
  await clickDialog(page, `shop-svc-${job.service}`);
  await clickDialog(page, 'shop-present');
}

interface AutoplayResult {
  unreachable: string[];
  result: { completed: boolean; score: number } | null;
}

/** Runs the job in the bay and waits for the summary (recommending any real find). */
async function work(page: Page, opts: { sloppy?: boolean; wrongTag?: string } = {}): Promise<AutoplayResult> {
  await waitButton(page, 'begin');
  const res = await call<AutoplayResult>(page, 'autoplay', true, undefined, !!opts.sloppy, opts.wrongTag);
  await expect
    .poll(async () => (await full(page)).dialogButtons.find((b) => b === 'shop-next' || b === 'shop-recommend'), {
      timeout: 30_000,
    })
    .toBeTruthy();
  if ((await full(page)).dialogButtons.includes('shop-recommend')) await clickDialog(page, 'shop-recommend');
  await waitButton(page, 'shop-next');
  return res;
}

async function startShift(page: Page, seed: number, setup: Record<string, unknown> = {}): Promise<void> {
  await call(page, 'setShop', setup);
  await call(page, 'startShift', seed);
  await waitButton(page, 'shop-write-up');
}

test('a full shift: counter, estimate, roll-in, jobs and the day sheet', async ({ page }) => {
  test.setTimeout(400_000);
  await startShift(page, 3);
  const first = await full(page);
  expect(first.shop.jobs.length).toBeGreaterThanOrEqual(3);
  // The customer walked up to the counter; the car waits outside.
  expect(first.shop.customer?.[2]).toBeLessThan(4.5);
  expect(first.shop.carVisible).toBe(false);
  const startMoney = first.shop.money;

  for (let i = 0; i < first.shop.jobs.length; i++) {
    await counter(page, i === 0);
    // The car drives in onto the lift before the job starts.
    await waitButton(page, 'begin');
    const s = await full(page);
    expect(s.shop.carVisible).toBe(true);
    expect(Math.abs(s.shop.carPos[2] ?? 9)).toBeLessThan(0.01);
    const res = await work(page);
    expect(res.unreachable).toEqual([]);
    expect(res.result?.completed).toBe(true);
    const summary = (await full(page)).dialog;
    expect(summary?.title).toMatch(/^Job done/);
    if (i === 0) expect(summary?.list.join('\n')).toContain('Picked the wrong service');
    await clickDialog(page, 'shop-next');
    if (i < first.shop.jobs.length - 1) await waitButton(page, 'shop-write-up');
  }
  await waitButton(page, 'shop-day-done');
  const end = await full(page);
  expect(end.dialog?.title).toBe('Day sheet: shift 1');
  expect(end.shop.days).toBe(1);
  expect(end.shop.money).toBeGreaterThan(startMoney);
  expect(end.shop.rep).toBeGreaterThan(0);
  await clickDialog(page, 'shop-day-done');
  await expect.poll(async () => (await full(page)).menu).toBe('shop');
});

test('sloppy work comes back next shift, and is redone for free', async ({ page }) => {
  test.setTimeout(400_000);
  await startShift(page, 5);
  expect(await call(page, 'setShiftJob', 0, 'oil-due', 'sedan', null)).toBe(true);
  await counter(page);
  await work(page, { sloppy: true });
  const after = await full(page);
  expect(after.shop.pending).toEqual(['oil.plug.undertorque']);
  expect(after.dialog?.list.join('\n')).toContain('This car will come back');

  // Leave the shift; the comeback stays queued and comes first next time.
  await call(page, 'clickDialog', 'shop-next');
  await waitButton(page, 'shop-write-up');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await full(page)).menu).toBe('pause');
  await call(page, 'clickMenu', 'quit');
  await expect.poll(async () => (await full(page)).menu).toBe('shop');

  await call(page, 'startShift', 8);
  await waitButton(page, 'shop-comeback-ok');
  const back = await full(page);
  expect(back.shop.jobs[0]?.comeback).toBe('oil.plug.undertorque');
  expect(back.dialog?.body).toContain('oil spots');
  const money = back.shop.money;
  await clickDialog(page, 'shop-comeback-ok');
  await work(page);
  const done = await full(page);
  expect(done.dialog?.list.join('\n')).toContain('Comeback');
  expect(done.shop.money).toBeLessThan(money);
  expect(done.shop.pending).toEqual([]);
});

test('a safety error stops the job with no charge', async ({ page }) => {
  await startShift(page, 2);
  await call(page, 'setShiftJob', 0, 'oil-due', 'sedan', null);
  const rep = (await full(page)).shop.rep;
  await counter(page);
  await waitButton(page, 'begin');
  await call(page, 'clickDialog', 'begin');
  await expect.poll(async () => (await state(page)).busy).toBe(false);
  await call(page, 'act', 'hand', 'oil-0w20');
  // Skip the glasses and gloves and reach into the engine bay.
  expect((await state(page)).step).toBe('ppe');
  await call(page, 'act', 'hand', 'fill-cap');
  await waitButton(page, 'retry');
  await call(page, 'clickDialog', 'retry');
  await waitButton(page, 'shop-next');
  const stopped = await full(page);
  expect(stopped.dialog?.title).toMatch(/^Job stopped/);
  expect(stopped.dialog?.list.join('\n')).toContain('safety error');
  expect(stopped.shop.rep).toBeLessThanOrEqual(rep);
});

test('an honest courtesy check pays; upselling a good part is flagged', async ({ page }) => {
  test.setTimeout(300_000);
  await startShift(page, 6);
  await call(page, 'setShiftJob', 0, 'oil-due', 'sedan', { id: 'wipers', severity: 0 });
  await counter(page);
  await work(page, { wrongTag: 'extra-wipers' });
  const summary = (await full(page)).dialog;
  expect(summary?.list.join('\n')).toContain('Recommended a part that was fine');
  await clickDialog(page, 'shop-next');

  await waitButton(page, 'shop-write-up');
  await call(page, 'setShiftJob', 1, 'oil-due', 'sedan', { id: 'wipers', severity: 2 });
  await counter(page);
  await waitButton(page, 'begin');
  await call(page, 'autoplay', true);
  await waitButton(page, 'shop-recommend');
  await clickDialog(page, 'shop-recommend');
  await waitButton(page, 'shop-next');
  expect((await full(page)).dialog?.list.join('\n')).toContain('Honest recommendation');
});

test('buying the impact wrench turns lug removal into one press', async ({ page }) => {
  test.setTimeout(200_000);
  await call(page, 'setShop', { money: 1000 });
  await call(page, 'clickMenu', 'shop');
  await call(page, 'clickMenu', 'shop-upgrades');
  await expect.poll(async () => (await full(page)).menu).toBe('upgrades');
  const pos = await call<{ x: number; y: number }>(page, 'buttonScreenPos', 'menu', 'upgrade-impact');
  await page.mouse.click(pos.x, pos.y);
  await expect.poll(async () => (await full(page)).shop.upgrades).toEqual(['impact']);
  expect((await full(page)).shop.money).toBe(550);

  await call(page, 'startShift', 2);
  await waitButton(page, 'shop-write-up');
  await call(page, 'setShiftJob', 0, 'tpms-light', 'sedan', null);
  await counter(page);
  await waitButton(page, 'begin');
  await call(page, 'autoplay', false, 'wheels-off');
  expect((await state(page)).step).toBe('wheels-off');
  expect((await full(page)).gesture).toBe('press');
});

test('accessibility: palettes recolor the panels and settings are saved', async ({ page }) => {
  const standard = await call<Record<string, string>>(page, 'uiColors');
  await call(page, 'clickMenu', 'settings');
  await call(page, 'clickMenu', 'accessibility');
  await expect.poll(async () => (await full(page)).menu).toBe('access');
  await call(page, 'clickMenu', 'set-1-1');
  const cb = await call<Record<string, string>>(page, 'uiColors');
  expect(cb.good).not.toBe(standard.good);
  expect(cb.bad).not.toBe(standard.bad);
  await call(page, 'clickMenu', 'set-1-2');
  const hc = await call<Record<string, string>>(page, 'uiColors');
  expect(hc.bg).toBe('#000000');
  await call(page, 'clickMenu', 'set-0-3');
  await call(page, 'clickMenu', 'set-2-1');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('service-bay-vr/save') ?? '{}').settings);
  expect(saved).toMatchObject({ palette: 'contrast', captionSize: 'xlarge', oneHanded: true });
});

test('the counter, a customer and a car stay inside the Quest 2 render budget', async ({ page }) => {
  await startShift(page, 1);
  await page.waitForTimeout(300);
  let info = await call<{ calls: number; triangles: number }>(page, 'renderInfo');
  expect(info.calls).toBeLessThan(150);
  expect(info.triangles).toBeLessThan(250_000);
  await counter(page);
  await waitButton(page, 'begin');
  await call(page, 'camera', -4.5, 1.6, 4.5, 0, 1, 0);
  await page.waitForTimeout(300);
  info = await call<{ calls: number; triangles: number }>(page, 'renderInfo');
  expect(info.calls).toBeLessThan(150);
  expect(info.triangles).toBeLessThan(250_000);
});
