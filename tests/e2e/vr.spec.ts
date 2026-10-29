import { expect, type Page, test } from '@playwright/test';
import { call, openGame, pageErrors, state } from './helpers';

/**
 * VR tests run against IWER, Meta's WebXR emulator, posing as a Quest 3 with
 * Touch controllers or tracked hands. They drive the same WebXR APIs a headset does.
 */

interface XrInfo {
  presenting: boolean;
  pointers: { id: string; kind: string; connected: boolean; hand: string }[];
  rigYaw: number;
}

async function enterVR(page: Page, mode: 'controller' | 'hand' = 'controller'): Promise<void> {
  await page.addInitScript({ path: 'node_modules/iwer/build/iwer.min.js' });
  await page.addInitScript((inputMode) => {
    const w = window as unknown as { IWER: Record<string, never>; __xrDevice: unknown };
    const IWER = w.IWER as unknown as {
      XRDevice: new (c: unknown) => { installRuntime(o?: { forceInstall?: boolean }): void; primaryInputMode: string };
      metaQuest3: unknown;
    };
    const device = new IWER.XRDevice(IWER.metaQuest3);
    device.primaryInputMode = inputMode;
    // Headless Chromium has a native navigator.xr with no device, so override it.
    device.installRuntime({ forceInstall: true });
    w.__xrDevice = device;
  }, mode);
  await openGame(page);
  await expect(page.locator('#enter-vr')).toBeVisible();
  await page.click('#enter-vr');
  await expect.poll(async () => (await call<XrInfo>(page, 'xr')).presenting).toBe(true);
  await expect.poll(async () => (await call<XrInfo>(page, 'xr')).pointers.filter((p) => p.connected).length).toBe(2);
}

/** Points the right controller (or hand) from a spot near the headset at a world position. */
async function aimAt(
  page: Page,
  world: { x: number; y: number; z: number },
  device: 'controllers' | 'hands' = 'controllers',
) {
  const t = await call<{ x: number; y: number; z: number }>(page, 'toXR', world.x, world.y, world.z);
  await page.evaluate(
    ({ t, device }) => {
      const d = (
        window as unknown as {
          __xrDevice: Record<
            string,
            {
              right: {
                position: { set(x: number, y: number, z: number): void };
                quaternion: { set(x: number, y: number, z: number, w: number): void };
              };
            }
          >;
        }
      ).__xrDevice;
      const input = d[device].right;
      const o = { x: 0.15, y: 1.4, z: -0.2 };
      input.position.set(o.x, o.y, o.z);
      let dx = t.x - o.x;
      let dy = t.y - o.y;
      let dz = t.z - o.z;
      const len = Math.hypot(dx, dy, dz);
      dx /= len;
      dy /= len;
      dz /= len;
      // Rotation taking -Z (the pointing direction) onto (dx, dy, dz).
      const ax = 0;
      const ay = 0;
      const az = -1;
      let qx = ay * dz - az * dy;
      let qy = az * dx - ax * dz;
      let qz = ax * dy - ay * dx;
      let qw = 1 + (ax * dx + ay * dy + az * dz);
      const n = Math.hypot(qx, qy, qz, qw);
      qx /= n;
      qy /= n;
      qz /= n;
      qw /= n;
      input.quaternion.set(qx, qy, qz, qw);
    },
    { t, device },
  );
  await page.waitForTimeout(250);
}

async function pullTrigger(page: Page): Promise<void> {
  await page.evaluate(() => {
    const d = (
      window as unknown as {
        __xrDevice: { controllers: { right: { updateButtonValue(id: string, v: number): void } } };
      }
    ).__xrDevice;
    d.controllers.right.updateButtonValue('trigger', 1);
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const d = (
      window as unknown as {
        __xrDevice: { controllers: { right: { updateButtonValue(id: string, v: number): void } } };
      }
    ).__xrDevice;
    d.controllers.right.updateButtonValue('trigger', 0);
  });
  await page.waitForTimeout(300);
}

test.afterEach(async ({ page }) => {
  expect(pageErrors(page)).toEqual([]);
});

test('enters VR on an emulated Quest 3 and works the menus with a controller ray', async ({ page }) => {
  await enterVR(page);
  const info = await call<XrInfo>(page, 'xr');
  expect(info.pointers.map((p) => p.kind)).toEqual(['controller', 'controller']);
  await expect.poll(async () => (await state(page)).menu).toBe('profiles');

  const newStudent = await call<{ x: number; y: number; z: number }>(page, 'buttonWorld', 'menu', 'new-profile');
  await aimAt(page, newStudent);
  await pullTrigger(page);
  await expect.poll(async () => (await state(page)).menu).toBe('keyboard');

  // Type "AB" on the in-world keyboard, then Done.
  for (const key of ['key-A', 'key-B', 'key-done']) {
    await aimAt(page, await call(page, 'buttonWorld', 'menu', key));
    await pullTrigger(page);
  }
  await expect.poll(async () => (await state(page)).profiles).toEqual(['Ab']);
  await expect.poll(async () => (await state(page)).menu).toBe('home');
});

test('right thumbstick snap turns and the lesson flow runs in VR', async ({ page }) => {
  await enterVR(page);
  await call(page, 'createProfile', 'Vee');
  const before = (await call<XrInfo>(page, 'xr')).rigYaw;
  await page.evaluate(() => {
    const d = (
      window as unknown as {
        __xrDevice: { controllers: { right: { updateAxes(id: string, x: number, y: number): void } } };
      }
    ).__xrDevice;
    d.controllers.right.updateAxes('thumbstick', 1, 0);
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const d = (
      window as unknown as {
        __xrDevice: { controllers: { right: { updateAxes(id: string, x: number, y: number): void } } };
      }
    ).__xrDevice;
    d.controllers.right.updateAxes('thumbstick', 0, 0);
  });
  await page.waitForTimeout(300);
  const after = (await call<XrInfo>(page, 'xr')).rigYaw;
  expect(Math.abs(after - before)).toBeCloseTo(Math.PI / 4, 2);

  // Start a lesson and press Start on the intro dialog with the controller.
  await call(page, 'startLesson', 'oil-change', 'learn', 'sedan', 1);
  await expect.poll(async () => (await state(page)).dialogButtons).toContain('begin');
  await aimAt(page, await call(page, 'buttonWorld', 'dialog', 'begin'));
  await pullTrigger(page);
  await expect.poll(async () => (await state(page)).busy).toBe(false);
  expect((await state(page)).step).toBe('choose-oil');
});

test('tracked hands connect as pointers', async ({ page }) => {
  await enterVR(page, 'hand');
  const info = await call<XrInfo>(page, 'xr');
  expect(info.pointers.map((p) => p.kind)).toEqual(['hand', 'hand']);
});

async function setTrigger(page: Page, value: number): Promise<void> {
  await page.evaluate((v) => {
    const d = (
      window as unknown as {
        __xrDevice: { controllers: { right: { updateButtonValue(id: string, v: number): void } } };
      }
    ).__xrDevice;
    d.controllers.right.updateButtonValue('trigger', v);
  }, value);
  await page.waitForTimeout(250);
}

async function moveRightController(page: Page, y: number): Promise<void> {
  await page.evaluate((y) => {
    const d = (
      window as unknown as {
        __xrDevice: {
          controllers: { right: { position: { x: number; z: number; set(x: number, y: number, z: number): void } } };
        };
      }
    ).__xrDevice;
    const p = d.controllers.right.position;
    p.set(p.x, y, p.z);
  }, y);
  await page.waitForTimeout(150);
}

test('the floor jack pumps with real up-and-down controller strokes', async ({ page }) => {
  await enterVR(page);
  await call(page, 'createProfile', 'Vee');
  await call(page, 'startLesson', 'brakes', 'practice', 'sedan', 1);
  await expect.poll(async () => (await state(page)).dialogButtons).toContain('begin');
  await call(page, 'clickDialog', 'begin');
  await call(page, 'autoplay', false, 'jack-raise');
  await call(page, 'teleport', 'jack');
  await page.waitForTimeout(400);
  const handle = await call<{ x: number; y: number; z: number }>(page, 'targetWorld', 'jack-handle');
  await aimAt(page, handle);
  // Squeeze the trigger on the handle (one stroke), then pump the hand down and up.
  await setTrigger(page, 1);
  for (let i = 0; i < 6; i++) {
    await moveRightController(page, 1.22);
    await moveRightController(page, 1.4);
  }
  await setTrigger(page, 0);
  await expect.poll(async () => (await state(page)).step).toBe('stands');
});
