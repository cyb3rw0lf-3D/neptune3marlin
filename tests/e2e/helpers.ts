import { expect, type Page } from '@playwright/test';

export interface GameState {
  screen: string;
  menu: string | null;
  lesson: string | null;
  mode: string;
  step: string | null;
  stepIndex: number;
  stepCount: number;
  remaining: string[];
  busy: boolean;
  dialogOpen: boolean;
  dialogButtons: string[];
  result: {
    completed: boolean;
    score: number;
    passed: boolean;
    criticalCount: number;
    mistakes: { code: string; critical: boolean }[];
    hints: number;
  } | null;
  liftHeight: number;
  torque: number;
  held: string | null;
  profiles: string[];
}

type Api = {
  ready: boolean;
  state(): GameState;
  [k: string]: unknown;
};

declare global {
  interface Window {
    __sbvr: Api & Record<string, (...args: never[]) => unknown>;
  }
}

export async function openGame(page: Page, query = '?test'): Promise<void> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__sbvr?.ready, null, { timeout: 30_000 });
  (page as unknown as { __errors: string[] }).__errors = errors;
}

export function pageErrors(page: Page): string[] {
  return (page as unknown as { __errors?: string[] }).__errors ?? [];
}

export function state(page: Page): Promise<GameState> {
  return page.evaluate(() => window.__sbvr.state());
}

export async function call<T = unknown>(page: Page, fn: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ([f, a]) => (window.__sbvr[f as string] as (...x: unknown[]) => unknown)(...(a as unknown[])),
    [fn, args],
  ) as Promise<T>;
}

/**
 * Waits until the session is settled (free to act, waiting on a quiz answer, or
 * finished), clicking "Got it, try again" on any mistake dialog along the way.
 */
export async function dismissMistakes(page: Page): Promise<number> {
  let n = 0;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const s = await state(page);
    if (s.dialogButtons.includes('retry')) {
      await call(page, 'clickDialog', 'retry');
      n++;
    } else if (!s.busy || s.dialogButtons.some((b) => b.startsWith('opt-')) || s.result?.completed) {
      return n;
    }
    await page.waitForTimeout(100);
  }
  throw new Error('Session did not settle');
}

/** Answers the current multiple-choice step by trying options until it moves on. */
export async function solveChoice(page: Page, stepId: string): Promise<number> {
  await expect.poll(async () => (await state(page)).step).toBe(stepId);
  let wrong = 0;
  for (let i = 0; i < 4; i++) {
    await dismissMistakes(page);
    if ((await state(page)).step !== stepId) return wrong;
    await call(page, 'answer', i);
    await page.waitForTimeout(100);
    wrong += await dismissMistakes(page);
  }
  return wrong;
}

/** Performs one action and waits for the session to settle. */
export async function act(page: Page, item: string, target: string, value?: number): Promise<string> {
  const kind = await call<string>(page, 'act', item, target, value);
  await page.waitForTimeout(120);
  await dismissMistakes(page);
  return kind;
}

export async function startLesson(page: Page, lesson: string, mode: string, seed = 1): Promise<void> {
  await call(page, 'startLesson', lesson, mode, 'sedan', seed);
  await expect.poll(async () => (await state(page)).dialogButtons).toContain('begin');
  await call(page, 'clickDialog', 'begin');
  await expect.poll(async () => (await state(page)).busy).toBe(false);
}

export async function enterGame(page: Page, name = 'Ana'): Promise<void> {
  await page.click('#play-screen');
  await call(page, 'createProfile', name);
}

/** The oil change done perfectly, step by step. */
export async function perfectOilChange(page: Page): Promise<void> {
  await act(page, 'hand', 'oil-0w20');
  await act(page, 'hand', 'ppe-glasses');
  await act(page, 'hand', 'ppe-gloves');
  await act(page, 'hand', 'fill-cap');
  for (const p of ['FL', 'FR', 'RL', 'RR']) await act(page, 'hand', `lift-arm-${p}`);
  await act(page, 'hand', 'lift-up');
  await act(page, 'hand', 'lift-lock');
  await act(page, 'drain-pan', 'pan-spot');
  await act(page, 'ratchet-14', 'drain-plug');
  await act(page, 'new-washer', 'plug-on-tray');
  await act(page, 'filter-wrench', 'filter');
  await act(page, 'rag', 'filter-mount');
  await act(page, 'new-filter', 'oil-jug');
  await act(page, 'new-filter', 'filter-mount');
  await act(page, 'drain-plug', 'drain-plug');
  await call(page, 'setTorque', 30);
  await act(page, 'torque-wrench', 'drain-plug');
  await act(page, 'hand', 'lift-down');
  await act(page, 'oil-bottle', 'fill-neck', 4.4);
  await act(page, 'hand', 'fill-cap');
  await act(page, 'hand', 'start-button');
  await act(page, 'hand', 'dipstick');
  await act(page, 'drain-pan', 'recycle-drum');
}
