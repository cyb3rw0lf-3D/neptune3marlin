import { readFileSync } from 'node:fs';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { call, enterGame, openGame, pageErrors, state } from './helpers';

const API = 'http://127.0.0.1:8787';

interface Created {
  code: string;
  key: string;
}

/** Creates a class through the dashboard UI, like a teacher would. */
async function createClass(page: Page, name = 'Period 3 Auto Tech'): Promise<Created> {
  await page.goto('/dashboard/');
  await page.getByLabel('Class name').fill(name);
  await page.getByRole('button', { name: 'Create class' }).click();
  await expect(page.locator('.big-code')).toBeVisible();
  const code = (await page.locator('.big-code').textContent()) ?? '';
  const link = await page.getByLabel('Your private teacher link').inputValue();
  return { code, key: link.split('#k=')[1] ?? '' };
}

async function teacherPage(browser: Browser): Promise<Page> {
  return browser.newPage();
}

interface Link {
  className: string;
  settings: { open: Record<string, boolean>; signIn: string };
  outbox: { pending: unknown[]; failures: number };
}

async function playLesson(page: Page, lesson: string, mode: string, sloppy = false): Promise<void> {
  await call(page, 'startLesson', lesson, mode, 'sedan', 3);
  await expect.poll(async () => (await state(page)).dialogButtons).toContain('begin');
  await call(page, 'clickDialog', 'begin');
  await call(page, 'autoplay', false, undefined, sloppy);
  await expect.poll(async () => (await state(page)).dialogButtons.length).toBeGreaterThan(0);
}

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await enterGame(page, 'Sam');
});

test.afterEach(async ({ page }) => {
  expect(pageErrors(page)).toEqual([]);
});

test('a teacher creates a class, a student joins and plays, and the dashboard shows it', async ({ page, browser }) => {
  test.setTimeout(240_000);
  const teacher = await teacherPage(browser);
  const cls = await createClass(teacher);
  expect(cls.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);

  // The student types the class code on the in-world keyboard with a real keyboard.
  await call(page, 'clickMenu', 'class');
  await expect.poll(async () => (await state(page)).menu).toBe('join');
  for (const ch of cls.code.toLowerCase()) await page.keyboard.press(ch);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await call<Link | null>(page, 'classLink'))?.className).toBe('Period 3 Auto Tech');
  await expect.poll(async () => (await state(page)).menu).toBe('home');

  // A Test run with one sloppy torque setting: a mistake for the dashboard.
  await playLesson(page, 'oil-change', 'test', true);
  await expect.poll(async () => (await call<Link['outbox']>(page, 'syncNow'))?.pending.length).toBe(0);

  await teacher.goto(`/dashboard/#k=${cls.key}`);
  await teacher.getByRole('tab', { name: 'Class grid' }).click();
  const cell = teacher.getByRole('button', { name: /^Sam, Oil & Filter Change: .*test: best \d+%/ });
  await expect(cell).toBeVisible();
  await cell.click();
  await expect(teacher.getByRole('dialog')).toContainText('Sam · Oil & Filter Change');
  await expect(teacher.getByRole('dialog')).toContainText(/drain plug/i);
  await teacher.keyboard.press('Escape');

  await teacher.getByRole('tab', { name: 'Common mistakes' }).click();
  await expect(teacher.locator('table.chart tbody tr').first()).toContainText(/drain plug/i);
  await expect(teacher.locator('.bar').first()).toBeVisible();

  // Exports: the grade CSV, every run, and the certificates zip.
  const grades = await teacher.request.get(`${API}/export/grades.csv`, {
    headers: { Authorization: `Bearer ${cls.key}` },
  });
  expect(await grades.text()).toMatch(/^student,oil-change test best/);
  const runs = await teacher.request.get(`${API}/export/attempts.csv`, {
    headers: { Authorization: `Bearer ${cls.key}` },
  });
  expect(await runs.text()).toContain('Sam,oil-change,test,Aster S4');
  await teacher.getByRole('tab', { name: 'Export' }).click();
  const download = teacher.waitForEvent('download');
  await teacher.getByRole('button', { name: 'Grade summary (CSV)' }).click();
  expect((await download).suggestedFilename()).toBe('period-3-auto-tech-grades.csv');
  const passed = (await state(page)).result?.passed;
  if (passed) {
    const zipDownload = teacher.waitForEvent('download');
    await teacher.getByRole('button', { name: 'Certificates (zip of PNGs)' }).click();
    const file = await (await zipDownload).path();
    const bytes = readFileSync(file);
    expect(bytes.subarray(0, 4).toString('hex')).toBe('504b0304');
  }
  await teacher.close();
});

test('locked lessons, Learn-first and Shop mode follow the dashboard settings', async ({ page, browser }) => {
  const teacher = await teacherPage(browser);
  const cls = await createClass(teacher);
  await call(page, 'joinClass', { code: cls.code, nickname: 'Sam' });

  await teacher.goto(`/dashboard/#k=${cls.key}`);
  await teacher.getByRole('tab', { name: 'Settings & roster' }).click();
  await teacher.getByLabel('Brake Inspection & Pads').uncheck();
  await teacher.getByLabel(/must finish Learn before/).check();
  await teacher.getByLabel('Off', { exact: true }).check();
  await teacher.getByRole('button', { name: 'Save settings' }).click();
  await expect(teacher.getByText('Saved.')).toBeVisible();

  await call(page, 'syncNow');
  await expect.poll(async () => (await call<Link>(page, 'classLink')).settings.open.brakes).toBe(false);
  expect(await call(page, 'clickMenu', 'lesson-brakes')).toBe(false);
  expect(await call(page, 'clickMenu', 'shop')).toBe(false);
  expect(await call(page, 'clickMenu', 'lesson-oil-change')).toBe(true);
  expect(await call(page, 'clickMenu', 'mode-test')).toBe(false);
  expect(await call(page, 'clickMenu', 'mode-learn')).toBe(true);
  await teacher.close();
});

test('results played offline upload once the network is back', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const teacher = await teacherPage(browser);
  const cls = await createClass(teacher);
  await call(page, 'joinClass', { code: cls.code, nickname: 'Sam' });
  await page.context().setOffline(true);
  await playLesson(page, 'tire-service', 'practice');
  const offline = await call<Link['outbox']>(page, 'syncNow');
  expect(offline.pending).toHaveLength(1);
  expect(offline.failures).toBeGreaterThan(0);
  await page.context().setOffline(false);
  await expect.poll(async () => (await call<Link['outbox']>(page, 'syncNow')).pending.length).toBe(0);
  const res = await teacher.request.get(`${API}/attempts`, { headers: { Authorization: `Bearer ${cls.key}` } });
  expect(await res.json()).toEqual([
    expect.objectContaining({ nickname: 'Sam', lesson: 'tire-service', mode: 'practice' }),
  ]);
  await teacher.close();
});

test('roster classes need personal codes, and sign-in-every-session headsets forget the student', async ({
  page,
  browser,
}) => {
  const teacher = await teacherPage(browser);
  const cls = await createClass(teacher);
  await teacher.goto(`/dashboard/#k=${cls.key}`);
  await teacher.getByRole('tab', { name: 'Settings & roster' }).click();
  await teacher.getByLabel('Add students').fill('Ana\nBen');
  await teacher.getByRole('button', { name: 'Add to roster' }).click();
  const anaRow = teacher.locator('tr', { hasText: 'Ana' });
  await expect(anaRow.locator('td.mono')).toHaveText(/^[A-HJ-NP-Z2-9]{8}$/);
  const anaCode = (await anaRow.locator('td.mono').textContent()) ?? '';
  await teacher.getByLabel(/Roster only/).check();
  await teacher.getByLabel(/Sign in every session/).check();
  await teacher.getByRole('button', { name: 'Save settings' }).click();
  await expect(teacher.getByText('Saved.')).toBeVisible();

  // The class code alone is refused; the personal code works.
  await call(page, 'joinClass', { code: cls.code, nickname: 'Eve' });
  expect(await call(page, 'classLink')).toBeNull();
  await call(page, 'joinClass', { rosterCode: anaCode });
  const link = await call<Link & { nickname: string }>(page, 'classLink');
  expect(link.nickname).toBe('Ana');
  expect(link.settings.signIn).toBe('session');

  // Exiting the game forgets the student on this shared headset (their results are uploaded first).
  await call(page, 'exitToTitle');
  await expect.poll(async () => (await state(page)).profiles).toEqual([]);
  await teacher.close();
});
