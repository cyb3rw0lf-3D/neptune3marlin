import { type Object3D, PerspectiveCamera, Timer, Vector3, WebGLRenderer } from 'three';
import { SoundFx } from './audio/sfx';
import { SaveStore } from './core/save';
import type { Settings } from './core/settings';
import { Tweens } from './core/tween';
import { LINES } from './guide/lines';
import { Narrator } from './guide/narration';
import { Valkyrie } from './guide/valkyrie';
import { DesktopInput } from './input/desktop-input';
import type { Pointer } from './input/pointer';
import { XRInput } from './input/xr-input';
import { Interaction } from './interaction/interaction';
import { itemName } from './interaction/item-catalog';
import { type PickInfo, Registry } from './interaction/registry';
import { ConsequencePlayer } from './lessons/consequences';
import type { LessonDef, Mode, VehicleId } from './lessons/engine/types';
import { type FinishInfo, LessonSession } from './lessons/session';
import { Locomotion } from './locomotion/locomotion';
import { type DialogButton, Hud } from './ui/hud';
import { Markers } from './ui/markers';
import { Menus } from './ui/menus';
import { UI } from './ui/panel';
import { formatDuration } from './ui/records';
import { World } from './world/world';

export type AppScreen = 'title' | 'menu' | 'lesson';

const NEXT_MODE: Record<Mode, Mode | null> = { learn: 'practice', practice: 'test', test: null };

/** Owns the renderer, the frame loop and the flow between menus and lessons. */
export class App {
  readonly renderer: WebGLRenderer;
  readonly camera = new PerspectiveCamera(70, 1, 0.03, 60);
  readonly registry = new Registry();
  readonly world: World;
  readonly save = new SaveStore();
  readonly sfx = new SoundFx();
  readonly tweens = new Tweens();
  readonly narrator: Narrator;
  readonly valkyrie = new Valkyrie();
  readonly hud = new Hud();
  readonly markers = new Markers();
  readonly menus: Menus;
  readonly locomotion: Locomotion;
  readonly consequences: ConsequencePlayer;
  readonly interaction: Interaction;
  readonly session: LessonSession;
  readonly xrInput: XRInput;
  readonly desktop: DesktopInput;
  screen: AppScreen = 'title';
  private timer = new Timer();
  private xrSession: XRSession | null = null;
  private paused = false;
  onScreenChange: (s: AppScreen) => void = () => {};
  onRecordsChanged: () => void = () => {};

  constructor(readonly container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType('local-floor');
    this.renderer.xr.setFoveation(1);
    container.appendChild(this.renderer.domElement);

    this.world = new World(this.registry);
    const scene = this.world.scene;
    this.narrator = new Narrator(import.meta.env.BASE_URL);
    this.locomotion = new Locomotion(this.camera, this.tweens, this.sfx);
    scene.add(this.locomotion.rig, this.locomotion.arcLine);
    this.locomotion.isFloorAllowed = (p) => this.floorAllowed(p);

    scene.add(this.hud.root, this.markers.root);
    this.valkyrie.attach(scene);
    this.consequences = new ConsequencePlayer(this.world, this.tweens, this.sfx, this.camera);

    this.menus = new Menus(this.save, {
      startLesson: (lesson, mode, vehicle) => this.startLesson(lesson, mode, vehicle),
      settingsChanged: (patch) => this.applySettings(patch),
      calibrateHeight: () => this.calibrateHeight(),
      resume: () => this.resume(),
      restart: () => {
        this.resume();
        this.session.restart();
      },
      quitLesson: () => {
        this.resume();
        this.session.quit();
      },
    });
    this.menus.panel.mesh.position.set(0, 0.0, -1.3);
    this.hud.addCenterPanel(this.menus.panel.mesh);
    this.menus.close();

    this.session = new LessonSession({
      world: this.world,
      registry: this.registry,
      interaction: () => this.interaction,
      hud: this.hud,
      markers: this.markers,
      narrator: this.narrator,
      valkyrie: this.valkyrie,
      sfx: this.sfx,
      tweens: this.tweens,
      consequences: this.consequences,
      save: this.save,
      settings: () => this.save.data.settings,
      camera: this.camera,
      pointers: () => this.pointers(),
      teleport: (id) => this.teleportTo(id),
    });
    this.interaction = new Interaction(this.registry, this.session, this.sfx);
    this.interaction.panels = [this.menus.panel, ...this.hud.panels];
    this.session.onFinish = (info) => this.showReport(info);
    this.session.onQuit = () => this.toMenu();
    this.hud.onHint = () => this.session.hint();
    this.hud.onMenu = () => this.pause();
    this.hud.onDial = (d) => this.session.onAdjust(null, d);
    this.narrator.onCaption = (t) => this.hud.setCaption(t);

    this.xrInput = new XRInput(this.renderer, this.locomotion.rig, scene);
    this.desktop = new DesktopInput(this.renderer.domElement, this.camera, {
      isInteractive: () => this.interaction.isInteractive(this.desktop.pointer),
      look: (y, p) => this.locomotion.look(y, p),
      move: (f, r, dt) => this.locomotion.move(f, r, dt),
      adjust: (d) => {
        if (this.interaction.holderOf('torque-wrench')) this.session.onAdjust(null, d);
      },
      key: (k) => this.onKey(k),
    });

    this.applySettings({});
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    void this.narrator.loadManifest();
    this.locomotion.applyHeight(false);
    this.teleportTo('start', true);
    this.hud.update(0, this.camera, true);
    this.renderer.setAnimationLoop((t) => this.tick(t));
  }

  pointers(): Pointer[] {
    return this.renderer.xr.isPresenting ? this.xrInput.pointers : [this.desktop.pointer];
  }

  private floorAllowed(p: Vector3): boolean {
    const raised = this.world.lift.height > 1.2;
    const inCar = p.x > -2.45 && p.x < 2.45 && p.z > -1.05 && p.z < 1.05;
    if (inCar && !raised) return false;
    const nearPost = Math.abs(p.x + 0.05) < 0.35 && Math.abs(Math.abs(p.z) - 1.45) < 0.35;
    return !nearPost;
  }

  private onResize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (!this.renderer.xr.isPresenting) this.hud.layout(this.camera, false);
  }

  applySettings(patch: Partial<Settings>): void {
    const s = this.save.updateSettings(patch);
    this.sfx.setVolume(s.effectsVolume);
    this.narrator.volume = s.narrationVolume;
    this.hud.captionSize = s.captionSize;
    this.locomotion.snapDegrees = s.snapTurnDegrees;
    this.locomotion.seated = s.seated;
    this.locomotion.heightOffset = s.heightOffset;
    this.locomotion.applyHeight(this.renderer.xr.isPresenting);
    this.consequences.reducedMotion = s.reducedMotion;
    if (patch.units && this.session.active) this.session.refreshClipboard();
  }

  /** Sets the height offset so the player's eyes sit at a standard 1.65 m. */
  calibrateHeight(): void {
    if (!this.renderer.xr.isPresenting) return;
    const eye = this.camera.getWorldPosition(new Vector3()).y - this.locomotion.rig.position.y;
    const offset = Math.max(-0.6, Math.min(0.9, 1.65 - eye - (this.save.data.settings.seated ? 0.45 : 0)));
    this.applySettings({ heightOffset: Math.round(offset * 100) / 100 });
    this.sfx.play('success');
  }

  teleportTo(spotId: string, instant = false): void {
    const spot = this.world.spots.get(spotId);
    if (!spot?.enabled) return;
    if (!this.renderer.xr.isPresenting) this.locomotion.setPitch(spot.pitch * 0.8);
    void this.locomotion.teleport(spot.position, spot.yaw, instant).then(() => {
      this.hud.update(0, this.camera, true);
      this.valkyrie.snapHome(this.camera);
    });
    if (instant) {
      this.hud.update(0, this.camera, true);
      this.valkyrie.snapHome(this.camera);
    }
  }

  // --- flow ---

  /** Called from the title overlay. */
  begin(): void {
    this.sfx.unlock();
    this.screen = 'menu';
    this.onScreenChange(this.screen);
    this.toMenu();
  }

  async enterVR(): Promise<boolean> {
    const xr = navigator.xr;
    if (!xr) return false;
    try {
      const session = await xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'],
      });
      this.xrSession = session;
      session.addEventListener('end', () => this.onXREnd());
      await this.renderer.xr.setSession(session);
      this.locomotion.resetPitch();
      this.locomotion.applyHeight(true);
      this.hud.layout(this.camera, true);
      this.desktop.enabled = false;
      this.begin();
      return true;
    } catch (err) {
      console.warn('Could not start VR', err);
      return false;
    }
  }

  private onXREnd(): void {
    this.xrSession = null;
    this.desktop.enabled = true;
    this.locomotion.applyHeight(false);
    this.hud.layout(this.camera, false);
    for (const v of this.xrInput.visuals) v.setVisible(false);
    this.interaction.releaseAll(this.xrInput.pointers);
    this.onScreenChange('title');
    this.screen = 'title';
    if (this.session.active) this.session.quit();
    this.menus.close();
  }

  exitVR(): void {
    void this.xrSession?.end();
  }

  toMenu(): void {
    this.screen = 'menu';
    this.onScreenChange(this.screen);
    this.hud.closeDialog();
    this.hud.showClipboard(null);
    this.world.reset();
    this.world.layoutCart([]);
    this.teleportTo('start', true);
    this.menus.open();
    this.onRecordsChanged();
  }

  startLesson(lesson: LessonDef, mode: Mode, vehicle: VehicleId, seed?: number): void {
    this.menus.close();
    this.paused = false;
    this.screen = 'lesson';
    this.onScreenChange(this.screen);
    this.session.start(lesson, mode, vehicle, seed);
  }

  pause(): void {
    if (this.screen !== 'lesson' || this.paused) return;
    this.paused = true;
    this.session.busy = true;
    this.narrator.stop();
    this.menus.openPause();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.menus.close();
    this.session.busy = this.hud.isDialogOpen;
  }

  private onKey(key: string): void {
    if (key === 'Escape') {
      if (this.paused) this.resume();
      else this.pause();
    } else if (key.toLowerCase() === 'h') {
      this.session.hint();
    } else if (key.toLowerCase() === 'q' || key.toLowerCase() === 'e') {
      // Drop the held item back where it belongs.
      this.interaction.release(this.desktop.pointer);
    }
  }

  private showReport(info: FinishInfo): void {
    const { lesson, mode, result } = info;
    const next = NEXT_MODE[mode];
    const scored = mode !== 'learn';
    const title =
      mode === 'test'
        ? result.passed
          ? `Test passed: ${lesson.title}`
          : `Test not passed: ${lesson.title}`
        : `${mode === 'learn' ? 'Learn' : 'Practice'} complete: ${lesson.title}`;
    const body = [
      `Time ${formatDuration(result.durationSec)} · Safety errors ${result.criticalCount}${mode === 'practice' ? ` · Hints ${result.hints}` : ''}`,
      mode === 'test' && result.passed ? 'Certificate earned! Download it from the Records screen.' : '',
      mode === 'test' && !result.passed
        ? result.criticalCount > 0
          ? 'A safety error fails the test. Review the mistakes below and try again.'
          : 'You need 80% to pass. Review the mistakes below, practice, and try again.'
        : '',
      result.mistakes.length === 0 ? 'No mistakes. That is a professional job.' : 'Mistakes:',
    ]
      .filter(Boolean)
      .join('\n');
    const list = result.mistakes.map((m) => ({
      text: `${m.critical ? '⚠ ' : '• '}${m.label}${m.count > 1 ? ` (×${m.count})` : ''}${scored ? `  −${m.penalty}` : ''}`,
      color: m.critical ? UI.bad : UI.muted,
    }));
    const buttons: DialogButton[] = [];
    if (next && (mode !== 'practice' || result.score >= 60)) {
      buttons.push({
        id: 'report-next',
        label: next === 'practice' ? 'Practice next' : 'Take the Test',
        variant: 'primary',
        onClick: () => this.startLesson(lesson, next, this.session.vehicleId),
      });
    }
    if (mode === 'test' && !result.passed) {
      buttons.push({
        id: 'report-practice',
        label: 'Practice',
        variant: 'primary',
        onClick: () => this.startLesson(lesson, 'practice', this.session.vehicleId),
      });
    }
    buttons.push({
      id: 'report-again',
      label: mode === 'test' && !result.passed ? 'Retry test' : 'Do it again',
      onClick: () => this.startLesson(lesson, mode, this.session.vehicleId),
    });
    buttons.push({ id: 'report-menu', label: 'Menu', onClick: () => this.session.quit() });
    this.hud.openDialog({
      tone: mode === 'test' ? (result.passed ? 'good' : 'safety') : 'good',
      title,
      body,
      list,
      badge: scored ? { text: `${result.score}%`, color: LessonSession.scoreColor(result, mode) } : undefined,
      buttons,
    });
    const line = mode === 'test' ? (result.passed ? LINES.testPassed : LINES.testFailed) : lesson.outro;
    void this.session.narrate([line]);
    this.onRecordsChanged();
  }

  private hoverLabel(pick: PickInfo | null): string {
    if (!pick) return '';
    if (pick.kind === 'item') return itemName(pick.id).replace(/^./, (c) => c.toUpperCase());
    if (pick.kind === 'target') return this.registry.targets.get(pick.id)?.label ?? '';
    if (pick.kind === 'spot') return `Go to: ${this.world.spots.get(pick.id)?.label ?? ''}`;
    return '';
  }

  private tick(time: number): void {
    this.timer.update(time);
    const dt = Math.min(0.05, this.timer.getDelta());
    const xr = this.renderer.xr.isPresenting;
    const pointers = this.pointers();
    if (xr) {
      this.xrInput.update();
      if (!this.paused) this.locomotion.updateSticks(pointers);
    } else {
      this.desktop.update(dt);
    }
    if (this.screen !== 'title') this.interaction.update(dt, pointers);

    // Hover label and laser feedback.
    let labelShown = false;
    for (const [i, p] of pointers.entries()) {
      const hit = this.interaction.hitFor(p);
      if (!labelShown && hit && hit.pick.kind !== 'ui' && hit.pick.kind !== 'floor') {
        this.markers.hover(hoverAnchor(hit.object), this.hoverLabel(hit.pick));
        labelShown = true;
      }
      if (xr) {
        const visual = this.xrInput.visuals[i];
        if (visual) {
          visual.setVisible(p.connected);
          const color = hit?.pick.kind === 'target' ? 0x2f9bff : hit?.pick.kind === 'item' ? 0xffa630 : 0x9fd0ff;
          visual.update(hit ? Math.min(hit.distance, 8) : 3, hit ? hit.point : null, this.camera, color);
        }
      }
    }
    if (!labelShown) this.markers.hover(null, '');

    this.tweens.update(dt);
    this.world.update(dt);
    this.consequences.update(dt);
    this.valkyrie.update(dt, this.camera);
    this.markers.update(dt, this.camera);
    this.hud.update(dt, this.camera);
    for (const p of pointers) p.endFrame();
    this.renderer.render(this.world.scene, this.camera);
  }
}

/** Labels float above the thing hit, not its invisible collider's parent anchor. */
function hoverAnchor(o: Object3D): Object3D {
  return o;
}
