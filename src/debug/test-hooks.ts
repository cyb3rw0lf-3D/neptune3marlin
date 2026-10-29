import { Raycaster, Vector3 } from 'three';
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
        vehicle: app.session.vehicleId,
        tagOpen: app.markers.tagOpen,
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
    /** Places the desktop camera at a position looking at a point (for screenshots). */
    camera(x: number, y: number, z: number, lx: number, ly: number, lz: number) {
      const rig = app.locomotion.rig;
      rig.position.set(x, 0, z);
      rig.rotation.set(0, 0, 0);
      app.locomotion.desktopEye = y;
      app.locomotion.applyHeight(false);
      app.camera.rotation.set(0, 0, 0);
      app.camera.updateMatrixWorld(true);
      app.camera.lookAt(lx, ly, lz);
      app.hud.update(0, app.camera, true);
    },
    /** Points the desktop camera at a world position (for screenshots). */
    lookAt(x: number, y: number, z: number) {
      app.camera.lookAt(x, y, z);
    },
    targetWorld(target: TargetId) {
      const p = app.registry.targetWorldPosition(target);
      return p ? { x: p.x, y: p.y, z: p.z } : null;
    },
    /** Screen pixel position of a target's center (to click it with the real mouse). */
    screenPos(target: TargetId) {
      const p = app.registry.targetWorldPosition(target);
      if (!p) return null;
      return project(p);
    },
    buttonScreenPos(panel: 'menu' | 'dialog' | 'clipboard' | 'tag', id: string) {
      const w = api.buttonWorld(panel, id);
      return w ? project(new Vector3(w.x, w.y, w.z)) : null;
    },
    itemScreenPos(item: ItemId) {
      const entry = app.registry.items.get(item);
      if (!entry) return null;
      return project(entry.collider.getWorldPosition(new Vector3()));
    },
    /** World position of a panel button's center. */
    buttonWorld(panel: 'menu' | 'dialog' | 'clipboard' | 'tag', id: string) {
      const pnl: Panel =
        panel === 'menu'
          ? app.menus.panel
          : panel === 'dialog'
            ? app.hud.dialog
            : panel === 'tag'
              ? app.markers.tag
              : app.hud.clipboard;
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
      for (const vehicleId of ['sedan', 'pickup'] as const) {
        app.world.setVehicle(vehicleId);
        const v = VEHICLES[vehicleId];
        for (const lesson of LESSONS.filter((l) => l.available && l.vehicles.includes(vehicleId))) {
          for (let seed = 0; seed < 30; seed++) {
            for (const step of lesson.steps(v, lesson.variant(createRng(seed), v), 'us')) {
              for (const t of [...step.targets, ...Object.keys(step.wrongTargets ?? {})]) {
                if (!app.registry.targets.has(t)) missing.add(`${vehicleId} target:${t}`);
              }
              for (const i of [step.item, ...Object.values(step.targetItems ?? {})]) {
                if (i !== 'hand' && !app.registry.items.has(i)) missing.add(`${vehicleId} item:${i}`);
              }
            }
          }
          for (const i of lesson.cartItems) if (!app.registry.items.has(i)) missing.add(`item:${i}`);
        }
      }
      app.world.setVehicle('sedan');
      return [...missing];
    },
    /**
     * Plays the running lesson perfectly from its current step. With `check`, it
     * first confirms every target can be pointed at from some enabled work spot
     * at that spot's eye height (nothing solid in the way), and lists the ones that cannot.
     */
    async autoplay(check = true, untilStep?: string) {
      const s = app.session;
      const unreachable: string[] = [];
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
      for (let guard = 0; guard < 600; guard++) {
        await wait(40);
        const r = s.runner;
        if (!r || r.finished) break;
        if (app.hud.isDialogOpen && app.hud.dialog.buttons.some((b) => b.id === 'retry')) {
          app.hud.dialog.click('retry');
          continue;
        }
        if (app.hud.isDialogOpen && app.hud.dialog.buttons.some((b) => b.id === 'begin')) {
          app.hud.dialog.click('begin');
          continue;
        }
        const step = r.current;
        if (!step) break;
        if (step.id === untilStep) break;
        if (step.choice) {
          if (app.hud.isDialogOpen) s.answer(step.choice.correct);
          continue;
        }
        if (r.awaitingTag && step.tag) {
          if (app.markers.tagOpen) s.answer(step.tag.correct);
          continue;
        }
        if (s.busy) continue;
        const target = r.remainingTargets()[0];
        if (!target) continue;
        // Let animations (hood opening, car lowering) finish before judging what can be seen.
        for (let i = 0; i < 25 && app.tweens.busy; i++) await wait(40);
        if (check && !visibleFromSpot(target)) unreachable.push(`${s.lesson?.id}:${s.vehicleId}:${step.id}:${target}`);
        const item = r.itemFor(target) ?? 'hand';
        if (step.measure?.source === 'setting') app.session.torqueSetting = step.measure.spec;
        api.act(item, target, step.measure?.spec);
      }
      return { unreachable, result: s.runner?.result() ?? null };
    },
    /** What the mouse pointer is over right now. */
    hovered() {
      const hit = app.interaction.hitFor(pointer());
      return hit ? { kind: hit.pick.kind, id: 'id' in hit.pick ? hit.pick.id : null } : null;
    },
    /** A lesson's random variant for a seed (to pick seeds that cover each scenario). */
    variant(id: LessonId, vehicle: VehicleId, seed: number) {
      const lesson = lessonById(id);
      return lesson.variant(createRng(seed), VEHICLES[vehicle]);
    },
    /** Spots from which a target can be pointed at. */
    spotsSeeing(target: TargetId) {
      return [...app.world.spots.values()]
        .filter((sp) => sp.enabled && app.interaction.canSee(sp.position.clone().setY(sp.eye), target))
        .map((sp) => sp.id);
    },
    /** For each target: what the first solid thing is on the ray from each spot. */
    debugRay(targets: TargetId[]) {
      app.world.vehicle.setHoodOpen(true);
      app.world.scene.updateMatrixWorld(true);
      const out: Record<string, string[]> = {};
      for (const t of targets) {
        const entry = app.registry.targets.get(t);
        if (!entry) continue;
        const c = entry.collider.getWorldPosition(new Vector3());
        out[t] = [
          `at ${c
            .toArray()
            .map((n) => n.toFixed(2))
            .join(',')}`,
        ];
        for (const sp of app.world.spots.values()) {
          if (!sp.enabled) continue;
          const eye = sp.position.clone().setY(sp.eye);
          const dir = c.clone().sub(eye).normalize();
          const ray = new Raycaster(eye, dir, 0, eye.distanceTo(c) + 0.2);
          const hit = ray.intersectObjects(app.registry.occluders, false)[0];
          const own = ray.intersectObject(entry.collider, false)[0];
          out[t]!.push(
            `${sp.id}: wall ${hit ? `${hit.object.name}@${hit.distance.toFixed(2)}` : '-'} target ${own ? own.distance.toFixed(2) : 'miss'}`,
          );
        }
      }
      return out;
    },
    renderInfo() {
      const info = app.renderer.info;
      return { calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries };
    },
  };
  function visibleFromSpot(target: TargetId): boolean {
    app.world.scene.updateMatrixWorld(true);
    for (const sp of app.world.spots.values()) {
      if (!sp.enabled) continue;
      if (app.interaction.canSee(sp.position.clone().setY(sp.eye), target)) return true;
    }
    return false;
  }
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
