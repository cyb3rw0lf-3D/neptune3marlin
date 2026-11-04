import { expect, type Page, test } from '@playwright/test';
import { act, call, enterGame, openGame, pageErrors, state } from './helpers';

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

async function begin(page: Page, lesson: string, mode: string, vehicle: string, seed = 3): Promise<void> {
  await call(page, 'startLesson', lesson, mode, vehicle, seed);
  await expect.poll(async () => (await state(page)).dialogButtons).toContain('begin');
  await call(page, 'clickDialog', 'begin');
  await expect.poll(async () => (await state(page)).busy).toBe(false);
}

const RUNS: [lesson: string, vehicle: string, seed: number][] = [
  ['wipers-bulbs', 'sedan', 1],
  ['wipers-bulbs', 'pickup', 2],
  ['wipers-bulbs', 'ev', 3],
  ['coolant-flush', 'sedan', 1],
  ['coolant-flush', 'pickup', 4],
  ['alignment', 'sedan', 1],
  ['alignment', 'pickup', 5],
  ['alignment', 'ev', 2],
  ['ac-check', 'sedan', 1],
  ['ac-check', 'pickup', 6],
  ['ac-check', 'ev', 3],
];

test('every new lesson plays perfectly on every vehicle, with every part reachable', async ({ page }) => {
  test.setTimeout(600_000);
  for (const [lesson, vehicle, seed] of RUNS) {
    await begin(page, lesson, 'test', vehicle, seed);
    const res = await call<AutoplayResult>(page, 'autoplay', true);
    expect(res.unreachable, `${lesson} on ${vehicle}`).toEqual([]);
    expect(res.result, `${lesson} on ${vehicle}`).toMatchObject({ completed: true, score: 100, passed: true });
    await expect.poll(async () => (await state(page)).dialogButtons).toContain('report-menu');
  }
});

test('opening the radiator cap before checking the engine is cold is a safety error', async ({ page }) => {
  await begin(page, 'coolant-flush', 'test', 'sedan');
  await call(page, 'autoplay', false, 'cold');
  expect((await state(page)).step).toBe('cold');
  await act(page, 'hand', 'radiator-cap');
  const s = await state(page);
  expect(s.result?.mistakes.map((m) => m.code)).toContain('coolant.cap.hot');
  expect(s.result?.criticalCount).toBe(1);
});

test('A/C couplers only fit their own ports, and a backwards cabin filter is caught', async ({ page }) => {
  await begin(page, 'ac-check', 'practice', 'sedan');
  await call(page, 'autoplay', false, 'couplers');
  await act(page, 'coupler-high', 'ac-low-port');
  expect((await state(page)).result?.mistakes.map((m) => m.code)).toContain('ac.coupler.swapped');

  await begin(page, 'wipers-bulbs', 'practice', 'sedan', 7);
  await call(page, 'autoplay', false, 'filter-arrow');
  const step = (await state(page)).step;
  expect(step).toBe('filter-arrow');
  const variant = await call<{ flowDown: boolean }>(page, 'variant', 'wipers-bulbs', 'sedan', 7);
  await call(page, 'answer', variant.flowDown ? 1 : 0);
  await expect
    .poll(async () => (await state(page)).result?.mistakes.map((m) => m.code))
    .toContain('wipers.filter.backwards');
});

test('the alignment console shows the readings, measured with a real mouse click', async ({ page }) => {
  await begin(page, 'alignment', 'learn', 'sedan', 2);
  await call(page, 'autoplay', false, 'read');
  await call(page, 'teleport', 'align');
  // Put the wheel targets down (Q), as a player would, since MEASURE is pressed by hand.
  await page.keyboard.press('q');
  expect((await state(page)).held).toBeNull();
  await page.waitForTimeout(400);
  const pos = await call<{ x: number; y: number; inView: boolean }>(page, 'screenPos', 'align-console');
  expect(pos.inView).toBe(true);
  await page.mouse.click(pos.x, pos.y);
  await expect.poll(async () => (await state(page)).step).toBe('which');
  const info = await call<{ calls: number; triangles: number }>(page, 'renderInfo');
  expect(info.calls).toBeLessThan(150);
  expect(info.triangles).toBeLessThan(250_000);
});

test('the dashboard Overview and summary row add up for a class', async ({ page, browser }) => {
  const api = 'http://127.0.0.1:8787';
  const created = await page.request.post(`${api}/classes`, { data: { name: 'Overview class' } });
  const cls = (await created.json()) as { code: string; teacherKey: string };
  const now = Date.now();
  // Run ids are unique across the whole database, which outlives a test run.
  const tag = now.toString(36);
  const run = (id: string, lesson: string, mode: string, score: number, passed: boolean) => ({
    id: `${id}-${tag}`,
    lesson,
    mode,
    vehicle: 'Aster S4',
    score,
    passed,
    completed: true,
    critical: 0,
    hints: 0,
    seconds: 120,
    mistakes: [],
    at: now,
  });
  for (const [name, runs] of [
    [
      'Ana',
      [run('ana-run-0001', 'wipers-bulbs', 'test', 96, true), run('ana-run-0002', 'oil-change', 'test', 70, false)],
    ],
    [
      'Ben',
      [run('ben-run-0001', 'wipers-bulbs', 'test', 84, true), run('ben-run-0002', 'oil-change', 'learn', 100, false)],
    ],
    ['Cy', [run('cy-run-00001', 'wipers-bulbs', 'practice', 60, false)]],
  ] as const) {
    const j = await page.request.post(`${api}/join`, { data: { code: cls.code, nickname: name } });
    const { token } = (await j.json()) as { token: string };
    await page.request.post(`${api}/sync`, { data: { attempts: runs }, headers: { Authorization: `Bearer ${token}` } });
  }
  const teacher = await browser.newPage();
  await teacher.goto(`/dashboard/#k=${cls.teacherKey}`);
  await expect(teacher.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  await expect(teacher.locator('.stat').first()).toContainText('3');
  const top = teacher.locator('table.overview tbody tr').first();
  await expect(top).toContainText('Wipers, Bulbs & Cabin Filter');
  await expect(top).toContainText('2 of 3');
  await teacher.getByRole('tab', { name: 'Class grid' }).click();
  const summary = teacher.locator('table.grid tfoot tr');
  await expect(summary).toContainText('2/3 passed');
  await expect(summary).toContainText('avg Test 90');
  await teacher.close();
});
