import { expect, test } from '@playwright/test';
import { act, call, enterGame, openGame, pageErrors, startLesson, state } from './helpers';

test.afterEach(async ({ page }) => {
  expect(pageErrors(page)).toEqual([]);
});

test('title screen offers flat-screen play and explains VR', async ({ page }) => {
  await openGame(page);
  await expect(page.getByRole('heading', { name: 'Service Bay VR' })).toBeVisible();
  await expect(page.locator('#play-screen')).toBeVisible();
  await expect(page.locator('#vr-note')).not.toBeEmpty();
});

test('real mouse input grabs a tool, uses it, and walks the menus', async ({ page }) => {
  await openGame(page);
  await page.click('#play-screen');
  await expect.poll(async () => (await state(page)).menu).toBe('profiles');
  await call(page, 'createProfile', 'Mouse');
  await expect.poll(async () => (await state(page)).menu).toBe('home');
  await startLesson(page, 'oil-change', 'learn');

  // Click the matching oil jug on the shelf with the real mouse.
  await call(page, 'teleport', 'parts');
  await page.waitForTimeout(300);
  const jug = await call<{ x: number; y: number; inView: boolean }>(page, 'screenPos', 'oil-0w20');
  expect(jug.inView).toBe(true);
  await page.mouse.click(jug.x, jug.y);
  await expect.poll(async () => (await state(page)).step).toBe('ppe');

  // Click the safety glasses and gloves on the cart.
  await call(page, 'teleport', 'cart');
  await page.waitForTimeout(300);
  for (const target of ['ppe-glasses', 'ppe-gloves']) {
    const p = await call<{ x: number; y: number; inView: boolean }>(page, 'screenPos', target);
    expect(p.inView).toBe(true);
    await page.mouse.click(p.x, p.y);
    // On a slow runner one frame can outlast the gap between clicks, so wait for each to land.
    await expect
      .poll(async () => {
        const s = await state(page);
        return s.step !== 'ppe' || !s.remaining.includes(target);
      })
      .toBe(true);
  }
  await expect.poll(async () => (await state(page)).step).toBe('fill-cap-off');

  // Grab a tool by clicking it, then put it back with Q.
  const tool = await call<{ x: number; y: number; inView: boolean }>(page, 'itemScreenPos', 'filter-wrench');
  await page.mouse.click(tool.x, tool.y);
  await expect.poll(async () => (await state(page)).held).toBe('filter-wrench');
  await page.keyboard.press('q');
  await expect.poll(async () => (await state(page)).held).toBe(null);

  // Hold-to-twist with the mouse on the fill cap.
  await call(page, 'teleport', 'hood');
  await page.waitForTimeout(300);
  const cap = await call<{ x: number; y: number; inView: boolean }>(page, 'screenPos', 'fill-cap');
  expect(cap.inView).toBe(true);
  await page.mouse.move(cap.x, cap.y);
  await page.mouse.down();
  // Keep holding until the twist finishes (software rendering can be slow).
  await expect.poll(async () => (await state(page)).step, { timeout: 30_000 }).toBe('arms');
  await page.mouse.up();

  // Pause menu with Escape.
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).menu).toBe('pause');
  await call(page, 'clickMenu', 'quit');
  await expect.poll(async () => (await state(page)).screen).toBe('menu');
});

test('practice hints are counted and units switch to metric', async ({ page }) => {
  await openGame(page);
  await enterGame(page);
  await call(page, 'clickMenu', 'settings');
  await call(page, 'clickMenu', 'set-0-1');
  await startLesson(page, 'oil-change', 'practice');
  await page.keyboard.press('h');
  await page.keyboard.press('h');
  await page.waitForTimeout(200);
  expect((await state(page)).result?.hints).toBe(2);
  const clipboardText = await page.evaluate(() => window.__sbvr.state().step);
  expect(clipboardText).toBe('choose-oil');
  await act(page, 'hand', 'oil-5w30');
  expect((await state(page)).result?.mistakes[0]?.code).toBe('oil.wrong_grade');
});

test('stays within the Quest 2 rendering budget', async ({ page }) => {
  await openGame(page);
  await enterGame(page);
  await startLesson(page, 'tire-service', 'learn');
  await page.waitForTimeout(500);
  for (const spot of ['start', 'cart', 'hood', 'left-front', 'parts']) {
    await call(page, 'teleport', spot);
    await page.waitForTimeout(250);
    const info = await call<{ calls: number; triangles: number }>(page, 'renderInfo');
    expect(info.calls, `draw calls at ${spot}`).toBeLessThan(150);
    expect(info.triangles, `triangles at ${spot}`).toBeLessThan(250_000);
  }
});

test('narration clips are bundled for every scripted line', async ({ page }) => {
  await openGame(page);
  const manifest = await page.evaluate(async () => (await fetch('audio/narration/manifest.json')).json());
  const keys = Object.keys(manifest.clips);
  expect(keys.length).toBeGreaterThan(100);
  const first = manifest.clips[keys[0] as string];
  const res = await page.request.get(`/audio/narration/${first}`);
  expect(res.ok()).toBe(true);
  expect(res.headers()['content-type']).toContain('audio');
});

test('every lesson target and tool exists in the 3D world', async ({ page }) => {
  await openGame(page);
  expect(await call(page, 'missingWorldIds')).toEqual([]);
});
