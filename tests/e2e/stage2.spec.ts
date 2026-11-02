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
  result: { completed: boolean; score: number; passed: boolean; mistakes: { code: string }[] } | null;
}

async function begin(page: Page, lesson: string, mode: string, vehicle: string, seed: number): Promise<void> {
  await call(page, 'startLesson', lesson, mode, vehicle, seed);
  await expect.poll(async () => (await state(page)).dialogButtons).toContain('begin');
  await call(page, 'clickDialog', 'begin');
  await expect.poll(async () => (await state(page)).busy).toBe(false);
}

function autoplay(page: Page, untilStep?: string): Promise<AutoplayResult> {
  return call<AutoplayResult>(page, 'autoplay', true, untilStep);
}

// Seeds chosen so the battery lesson covers every scenario (see the `variant` hook).
const RUNS: [lesson: string, seed: number][] = [
  ['oil-change', 1],
  ['tire-service', 1],
  ['brakes', 1],
  ['brakes', 2],
  ['battery', 1], // weak battery: load test fails, replace it
  ['battery', 2], // dead battery: jump-start with cables from the donor car
  ['battery', 5], // dead battery: jump-start with the jump pack
  ['battery', 7], // good battery: clean the terminals
  ['inspection', 1],
  ['inspection', 2],
];

test('every lesson plays perfectly on both vehicles, with every part reachable from a work spot', async ({ page }) => {
  test.setTimeout(600_000);
  const unreachable: string[] = [];
  for (const vehicle of ['sedan', 'pickup']) {
    for (const [lesson, seed] of RUNS) {
      await begin(page, lesson, 'test', vehicle, seed);
      expect((await state(page)).vehicle).toBe(vehicle);
      const res = await autoplay(page);
      unreachable.push(...res.unreachable);
      expect(res.result, `${lesson} ${vehicle} ${seed}`).toMatchObject({ completed: true, score: 100, passed: true });
      await expect.poll(async () => (await state(page)).dialogButtons).toContain('report-menu');
    }
  }
  expect(unreachable).toEqual([]);
});

test('solid objects block the pointer: the oil filter cannot be clicked through the car', async ({ page }) => {
  await begin(page, 'oil-change', 'learn', 'sedan', 1);
  // Crouched at the front wheel, the filter is hidden behind the tire and body.
  await call(page, 'teleport', 'left-front');
  await page.waitForTimeout(300);
  const hidden = await call<{ x: number; y: number; inView: boolean }>(page, 'screenPos', 'filter');
  expect(hidden.inView).toBe(true);
  await page.mouse.move(hidden.x, hidden.y);
  await page.waitForTimeout(400);
  const blocked = await call<{ id: string | null } | null>(page, 'hovered');
  expect(['filter', 'filter-mount']).not.toContain(blocked?.id);

  // With the car up on the lift, from underneath it is in plain sight.
  await autoplay(page, 'pan');
  await call(page, 'teleport', 'under');
  await page.waitForTimeout(300);
  const seen = await call<{ x: number; y: number; inView: boolean }>(page, 'screenPos', 'filter');
  await page.mouse.move(seen.x, seen.y);
  await expect
    .poll(async () => (await call<{ id: string | null } | null>(page, 'hovered'))?.id)
    .toMatch(/^filter(-mount)?$/);
});

test('the floor jack is pumped with real mouse clicks', async ({ page }) => {
  await begin(page, 'brakes', 'practice', 'pickup', 1);
  await autoplay(page, 'jack-raise');
  await call(page, 'teleport', 'jack');
  await page.waitForTimeout(300);
  const handle = await call<{ x: number; y: number; inView: boolean }>(page, 'screenPos', 'jack-handle');
  expect(handle.inView).toBe(true);
  for (let i = 0; i < 6; i++) {
    await page.mouse.click(handle.x, handle.y);
    await page.waitForTimeout(250);
  }
  await expect.poll(async () => (await state(page)).step).toBe('stands');
});

test('brake safety: working on a car held only by the jack fails the Test', async ({ page }) => {
  await begin(page, 'brakes', 'test', 'sedan', 1);
  await autoplay(page, 'stands');
  // Going for the wheel before the stands are under the car.
  expect(await call(page, 'act', 'impact-wrench', 'lugs-FL')).toBe('mistake');
  await dismissMistakes(page);
  // Hanging the caliper by its hose is a safety error too.
  await autoplay(page, 'hang-caliper');
  expect(await act(page, 'caliper-FL', 'brake-hose-FL')).toBe('mistake');
  const s = await state(page);
  expect(s.result?.mistakes.map((m) => m.code)).toEqual(['brakes.jack.no_stands', 'brakes.caliper.hung_by_hose']);
  expect(s.result?.criticalCount).toBe(2);
});

test('battery safety: positive cable off first is a safety error', async ({ page }) => {
  await begin(page, 'battery', 'test', 'sedan', 1);
  await autoplay(page, 'neg-off');
  expect(await act(page, 'ratchet-10', 'batt-pos')).toBe('mistake');
  const s = await state(page);
  expect(s.result?.mistakes.map((m) => m.code)).toEqual(['battery.disconnect.positive_first']);
  expect(s.step).toBe('neg-off');
});

test('inspection tags are clicked on the popup beside the part, and honesty is scored', async ({ page }) => {
  await begin(page, 'inspection', 'practice', 'sedan', 1);
  await autoplay(page, 'check-oil');
  const { found } = await call<{ found: Record<string, number> }>(page, 'variant', 'inspection', 'sedan', 1);
  await act(page, 'hand', 'dipstick');
  await expect.poll(async () => (await state(page)).tagOpen).toBe(true);
  // Pick a wrong call first with the real mouse, then the right one.
  const right = found.oil ?? 0;
  const wrong = right === 0 ? 2 : 0;
  await call(page, 'teleport', 'hood');
  await page.waitForTimeout(400);
  const wrongBtn = await call<{ x: number; y: number; inView: boolean }>(
    page,
    'buttonScreenPos',
    'tag',
    `tag-${wrong}`,
  );
  expect(wrongBtn.inView).toBe(true);
  await page.mouse.click(wrongBtn.x, wrongBtn.y);
  await expect.poll(async () => (await state(page)).dialogButtons).toContain('retry');
  expect(await dismissMistakes(page)).toBe(1);
  await expect.poll(async () => (await state(page)).tagOpen).toBe(true);
  await page.waitForTimeout(300);
  const rightBtn = await call<{ x: number; y: number; inView: boolean }>(
    page,
    'buttonScreenPos',
    'tag',
    `tag-${right}`,
  );
  await page.mouse.click(rightBtn.x, rightBtn.y);
  await expect.poll(async () => (await state(page)).step).toBe('check-coolant');
  const codes = (await state(page)).result?.mistakes.map((m) => m.code);
  expect(codes).toEqual([right === 0 ? 'inspection.oil.false_flag' : 'inspection.oil.missed']);
});

test('the lesson card lets the student pick the pickup', async ({ page }) => {
  await call(page, 'clickMenu', 'lesson-brakes');
  await call(page, 'clickMenu', 'vehicle-pickup');
  await call(page, 'clickMenu', 'mode-learn');
  await expect.poll(async () => (await state(page)).lesson).toBe('brakes');
  expect((await state(page)).vehicle).toBe('pickup');
});

test('the jump-start scene with two cars stays inside the Quest 2 render budget', async ({ page }) => {
  await begin(page, 'battery', 'learn', 'pickup', 2);
  await autoplay(page, 'donor-start');
  await call(page, 'teleport', 'donor');
  await page.waitForTimeout(500);
  const info = await call<{ calls: number; triangles: number }>(page, 'renderInfo');
  expect(info.calls).toBeLessThan(150);
  expect(info.triangles).toBeLessThan(250_000);
});

test('quick clicks on a slow device are not lost', async ({ page }) => {
  await begin(page, 'oil-change', 'practice', 'sedan', 1);
  await autoplay(page, 'ppe');
  await call(page, 'teleport', 'cart');
  await page.waitForTimeout(400);
  const glasses = await call<{ x: number; y: number }>(page, 'screenPos', 'ppe-glasses');
  const gloves = await call<{ x: number; y: number }>(page, 'screenPos', 'ppe-gloves');
  // Slow frames, like a low-end Chromebook: both clicks land before the next frame.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 8 });
  await page.mouse.click(glasses.x, glasses.y);
  await page.mouse.click(gloves.x, gloves.y);
  // Back to full speed: the queued clicks are replayed one per frame from here.
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await expect.poll(async () => (await state(page)).step).toBe('fill-cap-off');
});
