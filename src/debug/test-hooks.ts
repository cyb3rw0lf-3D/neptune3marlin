import { Vector3 } from 'three';
import type { App } from '../app';
import { createRng } from '../core/random';
import { LESSONS, lessonById } from '../lessons/content';
import type { ItemId, LessonId, Mode, TargetId, VehicleId } from '../lessons/engine/types';
import type { Panel } from '../ui/panel';
import { VEHICLES } from '../vehicles/specs';

/**
 * Automation hooks for end-to-end tests, installed only with ?test in the URL.
 * `act` drives the same session code a real pointer would, skipping only the
 * physical gesture (the wrist twist or held trigger).
 */
export function installTestHooks(app: App): void {
  app.narrator.instant = true;
  app.tweens.timeScale = 20;
  const pointer = () => app.desktop.pointer;

  const api = {
    ready: true,
    state() {
      const r = app.session.runner;
      return {
        screen: app.screen,
        menu: app.menus.isOpen ? app.menus.current : null,
        lesson: app.session.lesson?.id ?? null,
        mode: app.session.mode,
        step: r?.current?.id ?? null,
        stepIndex: r?.currentIndex ?? -1,
        stepCount: r?.steps.length ?? 0,
        remaining: r?.remainingTargets() ?? [],
        busy: app.session.busy,
        dialogOpen: app.hud.isDialogOpen,
        dialogButtons: app.hud.isDialogOpen ? app.hud.dialog.buttons.map((b) => b.id) : [],
        result: r ? r.result() : null,
        liftHeight: app.world.lift.height,
        torque: app.session.torqueSetting,
        held: app.interaction.heldBy(pointer()),
        profiles: app.save.data.profiles.map((p) => p.name),
      };
    },
    begin() {
      app.begin();
    },
    createProfile(name: string) {
      app.menus.finishName(name);
    },
    clickMenu(id: string) {
      return app.menus.panel.click(id);
    },
    clickDialog(id: string) {
      return app.hud.dialog.click(id);
    },
    startLesson(id: LessonId, mode: Mode, vehicle: VehicleId = 'sedan', seed = 1) {
      app.startLesson(lessonById(id), mode, vehicle, seed);
    },
    setTorque(value: number) {
      app.session.torqueSetting = value;
    },
    /** Uses an item (or 'hand') on a target, as if the gesture finished. Returns the verdict kind. */
    act(item: ItemId, target: TargetId, value?: number) {
      const p = pointer();
      if (item !== 'hand') app.interaction.grab(p, item);
      else app.interaction.release(p);
      const v = app.session.attempt(item, target);
      if (v.kind === 'start') {
        let val = value;
        if (v.measure?.source === 'setting' && val === undefined) val = app.session.torqueSetting;
        if (v.measure?.source === 'fill' && val === undefined) val = v.measure.spec;
        const done = app.session.complete(target, val);
        app.session.onVerdict(done, p, item);
        return done.kind;
      }
      if (v.kind === 'mistake') app.session.onVerdict(v, p, item);
      return v.kind;
    },
    answer(i: number) {
      app.session.answer(i);
    },
    teleport(spot: string) {
      app.teleportTo(spot, true);
    },
    /** Points the desktop camera at a world position (for screenshots). */
    lookAt(x: number, y: number, z: number) {
      app.camera.lookAt(x, y, z);
    },
    /** Screen pixel position of a target's center (to click it with the real mouse). */
    screenPos(target: TargetId) {
      const p = app.registry.targetWorldPosition(target);
      if (!p) return null;
      return project(p);
    },
    itemScreenPos(item: ItemId) {
      const entry = app.registry.items.get(item);
      if (!entry) return null;
      return project(entry.collider.getWorldPosition(new Vector3()));
    },
    /** World position of a panel button's center. */
    buttonWorld(panel: 'menu' | 'dialog' | 'clipboard', id: string) {
      const pnl: Panel = panel === 'menu' ? app.menus.panel : panel === 'dialog' ? app.hud.dialog : app.hud.clipboard;
      const b = pnl.buttons.find((x) => x.id === id);
      if (!b) return null;
      pnl.mesh.updateMatrixWorld(true);
      const local = new Vector3(
        ((b.x + b.w / 2) / pnl.widthPx - 0.5) * pnl.widthM,
        (0.5 - (b.y + b.h / 2) / pnl.heightPx) * pnl.heightM,
        0,
      );
      const w = pnl.mesh.localToWorld(local);
      return { x: w.x, y: w.y, z: w.z };
    },
    /** Converts a world position into the XR reference space (the rig's local space). */
    toXR(x: number, y: number, z: number) {
      app.locomotion.rig.updateMatrixWorld(true);
      const v = app.locomotion.rig.worldToLocal(new Vector3(x, y, z));
      return { x: v.x, y: v.y, z: v.z };
    },
    xr() {
      return {
        presenting: app.renderer.xr.isPresenting,
        pointers: app.xrInput.pointers.map((p) => ({
          id: p.id,
          kind: p.kind,
          connected: p.connected,
          hand: p.handedness,
        })),
        rigYaw: app.locomotion.rig.rotation.y,
        rig: app.locomotion.rig.position.toArray(),
      };
    },
    /** Lesson targets and items that the world does not provide (should be empty). */
    missingWorldIds() {
      const missing = new Set<string>();
      for (const lesson of LESSONS.filter((l) => l.available)) {
        for (let seed = 0; seed < 30; seed++) {
          const v = VEHICLES.sedan;
          for (const step of lesson.steps(v, lesson.variant(createRng(seed), v), 'us')) {
            for (const t of [...step.targets, ...Object.keys(step.wrongTargets ?? {})]) {
              if (!app.registry.targets.has(t)) missing.add(`target:${t}`);
            }
            for (const i of [step.item, ...Object.values(step.targetItems ?? {})]) {
              if (i !== 'hand' && !app.registry.items.has(i)) missing.add(`item:${i}`);
            }
          }
        }
        for (const i of lesson.cartItems) if (!app.registry.items.has(i)) missing.add(`item:${i}`);
      }
      return [...missing];
    },
    renderInfo() {
      const info = app.renderer.info;
      return { calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries };
    },
  };
  function project(p: Vector3) {
    const v = p.clone().project(app.camera);
    const rect = app.renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + ((v.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - v.y) / 2) * rect.height,
      inView: v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1,
    };
  }
  (window as unknown as { __sbvr: typeof api }).__sbvr = api;
}
