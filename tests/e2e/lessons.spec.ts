import { expect, test } from '@playwright/test';
import {
  act,
  call,
  dismissMistakes,
  enterGame,
  openGame,
  pageErrors,
  perfectOilChange,
  solveChoice,
  startLesson,
  state,
} from './helpers';

test.beforeEach(async ({ page }) => {
  await openGame(page);
  await enterGame(page);
});

test.afterEach(async ({ page }) => {
  expect(pageErrors(page)).toEqual([]);
});

test('a perfect oil change passes the Test and earns a certificate', async ({ page }) => {
  await startLesson(page, 'oil-change', 'test');
  await perfectOilChange(page);
  await expect.poll(async () => (await state(page)).result?.completed).toBe(true);
  const s = await state(page);
  expect(s.result).toMatchObject({ score: 100, passed: true, criticalCount: 0 });
  await expect.poll(async () => (await state(page)).dialogButtons).toContain('report-menu');

  // The certificate shows up in Records once back on the title screen.
  await page.click('#exit-screen');
  await page.click('#open-records');
  await expect(page.locator('#records-list .run').first()).toContainText('Oil & Filter Change');
  const cert = page.getByRole('button', { name: 'Certificate', exact: true });
  await expect(cert).toBeVisible();
  const download = page.waitForEvent('download');
  await cert.click();
  expect((await download).suggestedFilename()).toBe('certificate-ana-oil-filter-change.png');
});

test('safety errors fail a Test even when everything else is right', async ({ page }) => {
  await startLesson(page, 'oil-change', 'test');
  await act(page, 'hand', 'oil-0w20');
  // Draining before safety glasses: the skip triggers the PPE safety mistake.
  expect(await call(page, 'act', 'ratchet-14', 'drain-plug')).toBe('mistake');
  expect(await dismissMistakes(page)).toBe(1);
  // Going under the car before the lift is locked.
  await act(page, 'hand', 'ppe-glasses');
  await act(page, 'hand', 'ppe-gloves');
  await act(page, 'hand', 'fill-cap');
  for (const p of ['FL', 'FR', 'RL', 'RR']) await act(page, 'hand', `lift-arm-${p}`);
  await act(page, 'hand', 'lift-up');
  expect(await act(page, 'drain-pan', 'pan-spot')).toBe('mistake');
  const s = await state(page);
  expect(s.result?.mistakes.map((m) => m.code)).toEqual(['safety.no_eye_protection', 'safety.lift.not_locked']);
  expect(s.result?.criticalCount).toBe(2);
  expect(s.step).toBe('lock');
});

test('specs are checked: wrong socket, over-torque and overfill', async ({ page }) => {
  await startLesson(page, 'oil-change', 'practice');
  await act(page, 'hand', 'oil-0w20');
  await act(page, 'hand', 'ppe-glasses');
  await act(page, 'hand', 'ppe-gloves');
  await act(page, 'hand', 'fill-cap');
  for (const p of ['FL', 'FR', 'RL', 'RR']) await act(page, 'hand', `lift-arm-${p}`);
  await act(page, 'hand', 'lift-up');
  await act(page, 'hand', 'lift-lock');
  await act(page, 'drain-pan', 'pan-spot');
  expect(await act(page, 'ratchet-10', 'drain-plug')).toBe('mistake');
  await act(page, 'ratchet-14', 'drain-plug');
  await act(page, 'new-washer', 'plug-on-tray');
  await act(page, 'filter-wrench', 'filter');
  await act(page, 'rag', 'filter-mount');
  await act(page, 'new-filter', 'oil-jug');
  await act(page, 'new-filter', 'filter-mount');
  await act(page, 'drain-plug', 'drain-plug');
  await call(page, 'setTorque', 60);
  expect(await act(page, 'torque-wrench', 'drain-plug')).toBe('mistake');
  expect((await state(page)).step).toBe('torque');
  await call(page, 'setTorque', 30);
  await act(page, 'torque-wrench', 'drain-plug');
  await act(page, 'hand', 'lift-down');
  // Overfilling completes the step but records the mistake.
  await act(page, 'oil-bottle', 'fill-neck', 5.5);
  const s = await state(page);
  expect(s.step).toBe('cap-on');
  expect(s.result?.mistakes.map((m) => m.code)).toEqual([
    'oil.drain.wrong_socket',
    'oil.plug.overtorque',
    'oil.fill.overfill',
  ]);
  expect(s.result?.score).toBe(78);
});

test('tire service: readings, a quiz, rotation pattern and star torque', async ({ page }) => {
  await startLesson(page, 'tire-service', 'learn', 7);
  await act(page, 'hand', 'ppe-glasses');
  await act(page, 'hand', 'ppe-gloves');
  await act(page, 'hand', 'placard');
  for (const p of ['FL', 'FR', 'RL', 'RR']) await act(page, 'tire-gauge', `valve-${p}`);
  const low = (await state(page)).remaining[0] as string;
  expect(low).toMatch(/^valve-/);
  await act(page, 'air-chuck', low);
  for (const p of ['FL', 'FR', 'RL', 'RR']) await act(page, 'tread-gauge', `tread-${p}`);
  // Two multiple-choice steps; find the right answers by trying.
  await solveChoice(page, 'wear-call');
  await solveChoice(page, 'tread-call');
  for (const p of ['FL', 'FR', 'RL', 'RR']) await act(page, 'hand', `lift-arm-${p}`);
  await act(page, 'hand', 'lift-up');
  await act(page, 'hand', 'lift-lock');
  for (const p of ['FL', 'FR', 'RL', 'RR']) await act(page, 'impact-wrench', `lugs-${p}`);
  expect(await act(page, 'wheel-FL', 'hub-FL')).toBe('mistake');
  for (const [from, to] of [
    ['FL', 'RL'],
    ['FR', 'RR'],
    ['RL', 'FR'],
    ['RR', 'FL'],
  ]) {
    expect(await act(page, `wheel-${from}`, `hub-${to}`)).toBe('done');
  }
  for (const p of ['FL', 'FR', 'RL', 'RR']) await act(page, 'hand', `hub-${p}`);
  await act(page, 'hand', 'lift-down');
  expect((await state(page)).liftHeight).toBe(0);
  await call(page, 'setTorque', 80);
  expect(await act(page, 'torque-wrench', 'lug-FL-1')).toBe('mistake');
  for (const i of [0, 2, 4, 1, 3]) expect(await act(page, 'torque-wrench', `lug-FL-${i}`)).toBe('done');
  for (const p of ['FR', 'RL', 'RR']) await act(page, 'torque-wrench', `lugs-${p}`);
  await expect.poll(async () => (await state(page)).result?.completed).toBe(true);
  const codes = (await state(page)).result?.mistakes.map((m) => m.code) ?? [];
  expect(codes).toContain('tires.rotation.wrong_position');
  expect(codes).toContain('tires.lugs.not_star');
});

test('under-torqued lug nuts are a safety error', async ({ page }) => {
  await startLesson(page, 'tire-service', 'test', 3);
  const s0 = await state(page);
  expect(s0.mode).toBe('test');
  // Jump the run forward to the torque steps by completing earlier steps quickly.
  await act(page, 'hand', 'ppe-glasses');
  await act(page, 'hand', 'ppe-gloves');
  await act(page, 'hand', 'placard');
  for (const p of ['FL', 'FR', 'RL', 'RR']) await act(page, 'tire-gauge', `valve-${p}`);
  await act(page, 'air-chuck', (await state(page)).remaining[0] as string);
  for (const p of ['FL', 'FR', 'RL', 'RR']) await act(page, 'tread-gauge', `tread-${p}`);
  await solveChoice(page, 'wear-call');
  await solveChoice(page, 'tread-call');
  for (const p of ['FL', 'FR', 'RL', 'RR']) await act(page, 'hand', `lift-arm-${p}`);
  await act(page, 'hand', 'lift-up');
  await act(page, 'hand', 'lift-lock');
  for (const p of ['FL', 'FR', 'RL', 'RR']) await act(page, 'impact-wrench', `lugs-${p}`);
  for (const [from, to] of [
    ['FL', 'RL'],
    ['FR', 'RR'],
    ['RL', 'FR'],
    ['RR', 'FL'],
  ]) {
    await act(page, `wheel-${from}`, `hub-${to}`);
  }
  for (const p of ['FL', 'FR', 'RL', 'RR']) await act(page, 'hand', `hub-${p}`);
  await act(page, 'hand', 'lift-down');
  await call(page, 'setTorque', 40);
  expect(await act(page, 'torque-wrench', 'lug-FL-0')).toBe('mistake');
  const s = await state(page);
  expect(s.result?.mistakes.find((m) => m.code === 'tires.lugs.undertorque')?.critical).toBe(true);
});
