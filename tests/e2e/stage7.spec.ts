import { expect, type Page, test } from '@playwright/test';
import { act, call, dismissMistakes, enterGame, openGame, pageErrors, state } from './helpers';

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await enterGame(page);
});

test.afterEach(async ({ page }) => {
  expect(pageErrors(page)).toEqual([]);
});

interface AutoplayResult {
  unreachable: string[];
  result: { completed: boolean; score: number; passed: boolean } | null;
}

interface Pos {
  x: number;
  y: number;
  inView: boolean;
}

async function begin(page: Page, lesson: string, mode: string, vehicle: string, seed = 3): Promise<void> {
  await call(page, 'startLesson', lesson, mode, vehicle, seed);
  await expect.poll(async () => (await state(page)).dialogButtons).toContain('begin');
  await call(page, 'clickDialog', 'begin');
  await expect.poll(async () => (await state(page)).busy).toBe(false);
}

async function codes(page: Page): Promise<string[]> {
  return (await state(page)).result?.mistakes.map((m) => m.code) ?? [];
}

const RUNS: [lesson: string, vehicle: string, seed: number][] = [
  ['serpentine-belt', 'sedan', 1],
  ['serpentine-belt', 'pickup', 2],
  ['trans-fluid', 'pickup', 1],
  ['trans-fluid', 'sedan', 2],
  ['brake-flush', 'sedan', 1],
  ['brake-flush', 'pickup', 2],
  ['brake-flush', 'ev', 3],
  ['shocks', 'sedan', 1],
  ['shocks', 'pickup', 2],
  ['shocks', 'ev', 3],
  ['ev-coolant', 'ev', 1],
  ['ev-coolant', 'ev', 2],
];

test('every Stage 7 lesson plays perfectly on every vehicle, with every part reachable', async ({ page }) => {
  test.setTimeout(600_000);
  for (const [lesson, vehicle, seed] of RUNS) {
    await begin(page, lesson, 'test', vehicle, seed);
    const res = await call<AutoplayResult>(page, 'autoplay', true);
    expect(res.unreachable, `${lesson} on ${vehicle}`).toEqual([]);
    expect(res.result, `${lesson} on ${vehicle}`).toMatchObject({ completed: true, score: 100, passed: true });
    await expect.poll(async () => (await state(page)).dialogButtons).toContain('report-menu');
  }
});

test('brake bleeding: wrong wheel order and a reservoir run dry are caught', async ({ page }) => {
  await begin(page, 'brake-flush', 'practice', 'sedan', 1);
  await call(page, 'autoplay', false, 'hose-RR');
  await act(page, 'bleed-bottle', 'bleeder-FL');
  expect(await codes(page)).toContain('brakeflush.order.wrong');

  await call(page, 'autoplay', false, 'topoff');
  expect((await state(page)).step).toBe('topoff');
  await act(page, 'bleed-bottle', 'bleeder-FR');
  expect(await codes(page)).toContain('brakeflush.reservoir.dry');
});

test('the pedal calls to Valkyrie are made with real clicks', async ({ page }) => {
  await begin(page, 'brake-flush', 'practice', 'sedan', 1);
  await call(page, 'autoplay', false, 'call-RR');
  await expect.poll(async () => (await state(page)).dialogButtons).toContain('opt-0');
  // "Let it up!" first: the bleeder would suck air.
  const wrong = await call<Pos>(page, 'buttonScreenPos', 'dialog', 'opt-2');
  expect(wrong.inView).toBe(true);
  await page.mouse.click(wrong.x, wrong.y);
  await expect.poll(() => codes(page)).toContain('brakeflush.pedal.released');
  await dismissMistakes(page);
  await expect.poll(async () => (await state(page)).dialogButtons).toContain('opt-0');
  await page.waitForTimeout(300);
  const right = await call<Pos>(page, 'buttonScreenPos', 'dialog', 'opt-0');
  await page.mouse.click(right.x, right.y);
  await expect.poll(async () => (await state(page)).step).toBe('bleed-RR');
});

test('a misrouted belt, a sealed transmission and a forgotten towel are each caught', async ({ page }) => {
  await begin(page, 'serpentine-belt', 'practice', 'sedan', 1);
  await call(page, 'autoplay', false, 'route');
  await act(page, 'belt-new', 'pulley-alternator');
  expect(await codes(page)).toContain('belt.route.wrong');

  await begin(page, 'trans-fluid', 'practice', 'sedan', 2);
  await call(page, 'autoplay', false, 'sealed');
  await call(page, 'answer', 2);
  await expect.poll(() => codes(page)).toContain('trans.sealed.dipstick_hunt');

  await begin(page, 'wipers-bulbs', 'practice', 'sedan', 1);
  await call(page, 'autoplay', false, 'towel-off');
  expect((await state(page)).held).toBeNull();
  await act(page, 'hand', 'hood-latch');
  expect(await codes(page)).toContain('wipers.towel.left_on');
});

test('opening the EV battery loop before isolating high voltage fails a Test', async ({ page }) => {
  await begin(page, 'ev-coolant', 'test', 'ev', 1);
  await call(page, 'autoplay', false, '12v-off');
  await act(page, 'hand', 'ev-coolant-drain');
  const s = await state(page);
  expect(s.result?.mistakes.map((m) => m.code)).toContain('evcool.hv.not_isolated');
  expect(s.result?.criticalCount).toBe(1);
});

test('the shocks show on the lift within the render budget', async ({ page }) => {
  await begin(page, 'shocks', 'practice', 'sedan', 1);
  await call(page, 'autoplay', false, 'front');
  await call(page, 'teleport', 'under');
  await page.waitForTimeout(400);
  const pos = await call<Pos>(page, 'screenPos', 'shock-FL');
  expect(pos.inView).toBe(true);
  const info = await call<{ calls: number; triangles: number }>(page, 'renderInfo');
  expect(info.calls).toBeLessThan(150);
  expect(info.triangles).toBeLessThan(250_000);
});
