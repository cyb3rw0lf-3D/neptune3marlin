import { Group, type MeshBasicMaterial } from 'three';
import { Panel, UI } from '../ui/panel';
import { build } from './lowpoly';
import { C } from './palette';

export type ScanButton = 'scan-read' | 'scan-freeze' | 'scan-live' | 'scan-clear';
export type ScanPage = 'home' | 'codes' | 'freeze' | 'live' | 'cleared';

/** Text for each scan tool screen, set by the lesson's scenario. */
export type ScanScreens = Record<string, string[]>;

const BUTTONS: [ScanButton, string][] = [
  ['scan-read', 'Read codes'],
  ['scan-freeze', 'Freeze frame'],
  ['scan-live', 'Live data'],
  ['scan-clear', 'Clear codes'],
];

/**
 * A handheld OBD-II scan tool with its own screen and buttons. The lesson
 * fills in what each screen says; `pages` maps a page to a screen key so a
 * repair can change what the next reading shows (e.g. live data after a fix).
 */
export class ScanTool {
  readonly root = new Group();
  readonly screen: Panel;
  screens: ScanScreens = {};
  readonly pages: Record<'codes' | 'freeze' | 'live', string> = { codes: 'codes', freeze: 'freeze', live: 'live' };
  page: ScanPage = 'home';
  connected = false;
  onButton: (id: ScanButton) => void = () => {};

  constructor() {
    this.root.name = 'item:scan-tool';
    this.root.add(
      build()
        .box(0.24, 0.3, 0.035, C.safetyYellow, { p: [0, 0, -0.02] })
        .box(0.08, 0.08, 0.03, C.black, { p: [0, -0.17, -0.02] })
        .cyl(0.006, 0.006, 0.25, 4, C.black, { p: [0, -0.3, -0.02] })
        .mesh('scan-tool-body'),
    );
    this.screen = new Panel('scan-tool', 0.21, 0.26, 1500);
    const mat = this.screen.mesh.material as MeshBasicMaterial;
    // It is a real screen in the world: walls and car bodies hide it and block it.
    mat.depthTest = true;
    this.screen.mesh.userData.worldUi = true;
    this.screen.mesh.renderOrder = 3;
    this.screen.mesh.position.z = 0.0;
    this.root.add(this.screen.mesh);
    this.draw();
  }

  /** Where each button sits on the screen (panel-local meters), for halos and tests. */
  buttonOffset(id: ScanButton): { x: number; y: number } {
    const i = BUTTONS.findIndex(([b]) => b === id);
    const p = this.screen;
    const x = (20 + (i % 2) * 145 + 67.5) / p.widthPx - 0.5;
    const y = 0.5 - (250 + Math.floor(i / 2) * 64 + 26) / p.heightPx;
    return { x: x * p.widthM, y: y * p.heightM };
  }

  reset(): void {
    this.screens = {};
    this.pages.codes = 'codes';
    this.pages.freeze = 'freeze';
    this.pages.live = 'live';
    this.page = 'home';
    this.connected = false;
    this.draw();
  }

  connect(on: boolean): void {
    this.connected = on;
    this.page = 'home';
    this.draw();
  }

  show(page: ScanPage): void {
    this.page = page;
    this.draw();
  }

  draw(): void {
    this.screen.setDraw((p) => {
      p.background(16, '#0d1a14');
      p.text('OBD-II SCAN', 20, 14, { size: 22, bold: true, color: '#9fe3b8' });
      if (!this.connected) {
        p.paragraph('Plug into the OBD-II port under the dash, ignition on.', 20, 60, p.widthPx - 40, {
          size: 22,
          color: UI.muted,
          maxLines: 5,
        });
        return;
      }
      const key = this.page === 'home' || this.page === 'cleared' ? this.page : this.pages[this.page];
      const lines =
        this.page === 'home'
          ? ['Connected. Choose a function.']
          : this.page === 'cleared'
            ? ['Codes cleared.', 'Readiness monitors reset.']
            : (this.screens[key] ?? ['No data']);
      lines.slice(0, 7).forEach((line, i) => {
        p.text(line, 20, 52 + i * 27, { size: 20, color: i === 0 ? UI.text : '#cfe9da', maxWidth: p.widthPx - 40 });
      });
      BUTTONS.forEach(([id, label], i) => {
        const x = 20 + (i % 2) * 145;
        const y = 250 + Math.floor(i / 2) * 64;
        p.button(id, label, x, y, 135, 52, () => this.onButton(id), {
          size: 18,
          selected: (id === 'scan-read' && this.page === 'codes') || (id === 'scan-live' && this.page === 'live'),
        });
      });
    });
  }
}
