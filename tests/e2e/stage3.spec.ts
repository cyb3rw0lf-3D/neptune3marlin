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

async function begin(page: Page, lesson: string, mode: string, vehicle: string, seed: number): Promise<void> {
  await call(page, 'startLesson', lesson, mode, vehicle, seed);
  await expect.poll(async () => (await state(page)).dialogButtons).toContain('begin');
  await call(page, 'clickDialog', 'begin');
  await expect.poll(async () => (await state(page)).busy).toBe(false);
}

function autoplay(page: Page, untilStep?: string): Promise<AutoplayResult> {
  return call<AutoplayResult>(page, 'autoplay', true, untilStep);
}

type Pos = { x: number; y: number; inView: boolean };

// Seeds chosen to cover every scenario (see the `variant` hook).
const RUNS: [lesson: string, vehicle: string, seed: number][] = [
  ['obd2', 'sedan', 1], // P0171 vacuum leak
  ['obd2', 'pickup', 4], // P0128 thermostat
  ['obd2', 'sedan', 7], // P0455 gas cap
  ['obd2', 'pickup', 12], // P0301 misfire, coil swap
  ['spark-plugs', 'sedan', 1],
  ['spark-plugs', 'pickup', 5], // new plug gap out of spec
  ['ev-safety', 'ev', 1],
  ['ev-safety', 'ev', 6], // glove pair A has a pinhole
  ['tire-service', 'ev', 1],
  ['brakes', 'ev', 1],
  ['battery', 'ev', 1],
  ['battery', 'ev', 2], // dead 12 V battery: jump pack
  ['inspection', 'ev', 1],
];

test('the Stage 3 lessons and the EV play perfectly, with every part reachable from a work spot', async ({ page }) => {
  test.setTimeout(600_000);
  const unreachable: string[] = [];
  for (const [lesson, vehicle, seed] of RUNS) {
    await begin(page, lesson, 'test', vehicle, seed);
    const res = await autoplay(page);
    unreachable.push(...res.unreachable);
    expect(res.result, `${lesson} ${vehicle} ${seed}`).toMatchObject({ completed: true, score: 100, passed: true });
    await expect.poll(async () => (await state(page)).dialogButtons).toContain('report-menu');
  }
  expect(unreachable).toEqual([]);
});

test('scan tool buttons work on its own screen with the real mouse', async ({ page }) => {
  await begin(page, 'obd2', 'practice', 'pickup', 12);
  await autoplay(page, 'read-codes');
  await call(page, 'teleport', 'driver');
  await page.waitForTimeout(400);
  const read = await call<Pos>(page, 'buttonScreenPos', 'scan', 'scan-read');
  expect(read.inView).toBe(true);
  await page.mouse.click(read.x, read.y);
  await expect.poll(async () => (await state(page)).step).toBe('freeze-frame');
  expect((await state(page)).scanPage).toBe('codes');
  // Clearing codes before any repair is a mistake, and the codes stay.
  const clear = await call<Pos>(page, 'buttonScreenPos', 'scan', 'scan-clear');
  await page.mouse.click(clear.x, clear.y);
  await expect.poll(async () => (await state(page)).dialogButtons).toContain('retry');
  expect((await state(page)).result?.mistakes.map((m) => m.code)).toEqual(['obd.clear_before_repair']);
  await dismissMistakes(page);
  expect((await state(page)).scanPage).not.toBe('cleared');
});

test('running the engine indoors without the exhaust hose fails the Test', async ({ page }) => {
  await begin(page, 'obd2', 'test', 'sedan', 1);
  await autoplay(page, 'exhaust');
  expect(await act(page, 'hand', 'start-button')).toBe('mistake');
  const s = await state(page);
  expect(s.result?.mistakes.map((m) => m.code)).toEqual(['safety.exhaust.no_hose']);
  expect(s.result?.criticalCount).toBe(1);
});

test('EV safety: keeping gloves that leak is a safety error', async ({ page }) => {
  await begin(page, 'ev-safety', 'test', 'ev', 6);
  await autoplay(page, 'air-test');
  await act(page, 'hand', 'gloves-a');
  await expect.poll(async () => (await state(page)).tagOpen).toBe(true);
  await call(page, 'answer', 0);
  await expect.poll(async () => (await state(page)).dialogButtons).toContain('retry');
  const s = await state(page);
  expect(s.result?.mistakes.map((m) => m.code)).toEqual(['ev.gloves.pinhole_used']);
  expect(s.result?.criticalCount).toBe(1);
});

test('EV safety: testing for zero before proving the meter is a safety error', async ({ page }) => {
  await begin(page, 'ev-safety', 'test', 'ev', 1);
  await autoplay(page, 'live-1');
  expect(await act(page, 'cat3-meter', 'hv-test')).toBe('mistake');
  expect((await state(page)).result?.criticalCount).toBe(1);
});

test('the EV scene stays inside the Quest 2 render budget', async ({ page }) => {
  await begin(page, 'ev-safety', 'learn', 'ev', 6);
  await autoplay(page, 'disconnect');
  await call(page, 'teleport', 'ev-kit');
  await page.waitForTimeout(500);
  const info = await call<{ calls: number; triangles: number }>(page, 'renderInfo');
  expect(info.calls).toBeLessThan(150);
  expect(info.triangles).toBeLessThan(250_000);
});
