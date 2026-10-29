import { type Euler, Group, type Mesh, type Object3D, type PerspectiveCamera, Vector3 } from 'three';
import type { CaptionSize } from '../core/settings';
import { Panel, UI } from './panel';

const _v = new Vector3();

export interface ClipboardState {
  title: string;
  mode: 'learn' | 'practice' | 'test';
  vehicle: string;
  workOrder: string[];
  steps: { label: string; done: boolean; current: boolean; safety: boolean }[];
  stepIndex: number;
  stepCount: number;
  instruction: string;
  hintsUsed: number;
  status: string;
}

export interface DialogButton {
  id: string;
  label: string;
  variant?: 'primary' | 'normal' | 'danger' | 'good';
  onClick: () => void;
}

export interface DialogSpec {
  tone: 'info' | 'warn' | 'safety' | 'good' | 'question';
  title: string;
  body: string;
  /** Extra lines rendered as a list (report cards). */
  list?: { text: string; color?: string }[];
  buttons: DialogButton[];
  /** Big number shown top-right (score). */
  badge?: { text: string; color: string };
  /** 'stack' puts one full-width button per row (multiple-choice answers). */
  layout?: 'row' | 'stack';
}

const MODE_LABEL = { learn: 'LEARN', practice: 'PRACTICE', test: 'TEST' };
const MODE_COLOR = { learn: UI.accent, practice: UI.warn, test: UI.bad };
const TONE_COLOR = { info: UI.accent, warn: UI.warn, safety: UI.bad, good: UI.good, question: UI.accent };
const TONE_ICON = { info: 'i', warn: '!', safety: '!', good: '✓', question: '?' };

/**
 * Head-following panels: the lesson clipboard, captions, modal dialogs and the
 * torque-wrench dial. The group follows the player's position and lazily
 * turns with their gaze so text never sticks to the face (comfort).
 */
export class Hud {
  readonly root = new Group();
  readonly clipboard = new Panel('clipboard', 0.5, 0.66);
  readonly captions = new Panel('captions', 1.0, 0.2);
  readonly dialog = new Panel('dialog', 1.0, 0.7);
  readonly dial = new Panel('dial', 0.46, 0.13);
  readonly panels: Panel[];
  private yaw = 0;
  private dialogOpen = false;
  captionSize: CaptionSize = 'medium';
  onHint: () => void = () => {};
  onMenu: () => void = () => {};
  onDial: (delta: number) => void = () => {};
  private clipState: ClipboardState | null = null;
  private home = new Map<Mesh, { position: Vector3; rotation: Euler }>();
  /** Extra panels (the menu board) laid out like the dialog. */
  readonly centerPanels: Mesh[] = [];

  constructor() {
    this.root.name = 'hud';
    this.clipboard.mesh.position.set(-0.62, -0.18, -0.78);
    this.clipboard.mesh.rotation.set(-0.15, 0.55, 0);
    this.captions.mesh.position.set(0, -0.36, -1.05);
    this.captions.mesh.rotation.x = -0.25;
    this.dialog.mesh.position.set(0, 0.02, -1.0);
    this.root.add(this.clipboard.mesh, this.captions.mesh, this.dialog.mesh);
    this.clipboard.mesh.visible = false;
    this.captions.mesh.visible = false;
    this.dialog.mesh.visible = false;
    this.dial.mesh.visible = false;
    this.panels = [this.clipboard, this.captions, this.dialog, this.dial];
  }

  /** Registers a panel that sits in the middle of the view (the menu board). */
  addCenterPanel(mesh: Mesh): void {
    this.centerPanels.push(mesh);
    this.root.add(mesh);
  }

  private remember(mesh: Mesh): void {
    if (!this.home.has(mesh)) this.home.set(mesh, { position: mesh.position.clone(), rotation: mesh.rotation.clone() });
  }

  /**
   * VR: panels float in the world and follow the head lazily. Flat screens:
   * panels are pinned to the camera and scaled to fit the window.
   */
  layout(camera: PerspectiveCamera, xr: boolean): void {
    const meshes = [this.clipboard.mesh, this.captions.mesh, this.dialog.mesh, ...this.centerPanels];
    for (const m of meshes) this.remember(m);
    if (xr) {
      for (const m of meshes) {
        const h = this.home.get(m);
        this.root.add(m);
        if (h) {
          m.position.copy(h.position);
          m.rotation.copy(h.rotation);
        }
        m.scale.setScalar(1);
      }
      return;
    }
    const d = 1;
    const halfH = Math.tan(((camera.fov / 2) * Math.PI) / 180) * d;
    const halfW = halfH * camera.aspect;
    const fitScale = (w: number, h: number, maxW: number, maxH: number) =>
      Math.min(1, (2 * halfW * maxW) / w, (2 * halfH * maxH) / h);
    for (const m of [this.dialog.mesh, ...this.centerPanels]) {
      const p = (m.userData.panel as { widthM: number; heightM: number } | undefined) ?? { widthM: 1, heightM: 0.7 };
      camera.add(m);
      m.rotation.set(0, 0, 0);
      m.scale.setScalar(fitScale(p.widthM, p.heightM, 0.94, 0.84));
      m.position.set(0, 0.02, -d);
    }
    const narrow = camera.aspect < 1;
    const cs = narrow ? fitScale(0.5, 0.66, 0.42, 0.42) : fitScale(0.5, 0.66, 0.27, 0.78);
    camera.add(this.clipboard.mesh);
    this.clipboard.mesh.rotation.set(0, 0, 0);
    this.clipboard.mesh.scale.setScalar(cs);
    this.clipboard.mesh.position.set(-halfW + (0.5 * cs) / 2 + 0.02, halfH - (0.66 * cs) / 2 - 0.02, -d);
    const caps = fitScale(1.0, 0.2, narrow ? 0.96 : 0.6, 0.3);
    camera.add(this.captions.mesh);
    this.captions.mesh.rotation.set(0, 0, 0);
    this.captions.mesh.scale.setScalar(caps);
    this.captions.mesh.position.set(0, -halfH + (0.2 * caps) / 2 + 0.11, -d);
  }

  get isDialogOpen(): boolean {
    return this.dialogOpen;
  }

  /** Keeps the HUD at the player's position, turning toward their gaze when they look away. */
  update(dt: number, camera: Object3D, snap = false): void {
    camera.getWorldPosition(this.root.position);
    const dir = camera.getWorldDirection(_v);
    const targetYaw = Math.atan2(-dir.x, -dir.z);
    let diff = targetYaw - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (snap) this.yaw = targetYaw;
    else if (Math.abs(diff) > (this.dialogOpen ? 0.35 : 0.6)) this.yaw += diff * (1 - Math.exp(-dt * 3));
    this.root.rotation.set(0, this.yaw, 0);
  }

  setCaption(text: string | null): void {
    this.captions.mesh.visible = !!text;
    if (!text) return;
    const size = this.captionSize === 'small' ? 30 : this.captionSize === 'large' ? 44 : 36;
    this.captions.setDraw((p) => {
      p.background(24, 'rgba(8, 14, 20, 0.88)');
      p.text('VALKYRIE', 28, 16, { size: 22, bold: true, color: '#37e0d0' });
      p.paragraph(text, 28, 46, p.widthPx - 56, {
        size,
        maxLines: size > 40 ? 3 : 4,
        lineHeight: Math.round(size * 1.18),
      });
    });
  }

  showClipboard(state: ClipboardState | null): void {
    this.clipState = state;
    this.clipboard.mesh.visible = !!state;
    if (!state) return;
    this.clipboard.setDraw((p) => this.drawClipboard(p, state));
  }

  refreshClipboard(): void {
    if (this.clipState) this.clipboard.redraw();
  }

  private drawClipboard(p: Panel, s: ClipboardState): void {
    p.background(26);
    const W = p.widthPx;
    p.ctx.fillStyle = MODE_COLOR[s.mode];
    p.ctx.fillRect(0, 0, W, 10);
    p.text(MODE_LABEL[s.mode], 30, 26, { size: 26, bold: true, color: MODE_COLOR[s.mode] });
    p.text(`Step ${Math.min(s.stepIndex + 1, s.stepCount)} of ${s.stepCount}`, W - 30, 26, {
      size: 26,
      color: UI.muted,
      align: 'right',
    });
    p.text(s.title, 30, 62, { size: 38, bold: true, maxWidth: W - 60 });
    p.text(s.vehicle, 30, 108, { size: 24, color: UI.muted, maxWidth: W - 60 });

    // Work order: the specs a technician would look up.
    let y = 148;
    p.ctx.fillStyle = '#16242e';
    p.ctx.fillRect(20, y, W - 40, 30 + s.workOrder.length * 30);
    p.text('WORK ORDER', 34, y + 8, { size: 20, bold: true, color: UI.muted });
    s.workOrder.forEach((line, i) => {
      p.text(line, 34, y + 34 + i * 30, { size: 24, maxWidth: W - 70 });
    });
    y += 46 + s.workOrder.length * 30;

    if (s.mode === 'learn') {
      // Nearby checklist items.
      const start = Math.max(0, s.stepIndex - 2);
      const shown = s.steps.slice(start, start + 6);
      shown.forEach((st, i) => {
        const yy = y + i * 40;
        const mark = st.done ? '✓' : st.current ? '▶' : '○';
        const color = st.done ? UI.good : st.current ? UI.text : UI.muted;
        p.text(mark, 30, yy, { size: 28, color, bold: true });
        p.text(`${st.safety ? '⚠ ' : ''}${st.label}`, 66, yy + 2, {
          size: 26,
          color,
          bold: st.current,
          maxWidth: W - 96,
        });
      });
      y += shown.length * 40 + 10;
    } else if (s.mode === 'practice') {
      p.text('Current task', 30, y, { size: 22, color: UI.muted });
      y = p.paragraph(s.instruction, 30, y + 30, W - 60, { size: 30, bold: true, maxLines: 3 }) + 10;
    } else {
      p.paragraph(
        'No hints in a Test. Work from memory and the work order. Safety errors fail the test.',
        30,
        y,
        W - 60,
        {
          size: 26,
          color: UI.muted,
          maxLines: 3,
        },
      );
      y += 110;
    }
    if (s.status)
      p.paragraph(s.status, 30, Math.max(y, p.heightPx - 190), W - 60, { size: 24, color: UI.warn, maxLines: 2 });

    const by = p.heightPx - 110;
    if (s.mode === 'practice') {
      p.button('hint', `Hint (${s.hintsUsed} used)`, 24, by, W / 2 - 34, 84, () => this.onHint(), {
        variant: 'primary',
      });
      p.button('menu', 'Menu', W / 2 + 10, by, W / 2 - 34, 84, () => this.onMenu());
    } else {
      p.button('menu', 'Menu', 24, by, W - 48, 84, () => this.onMenu());
    }
  }

  openDialog(spec: DialogSpec): void {
    this.dialogOpen = true;
    this.dialog.mesh.visible = true;
    this.dialog.hoverId = null;
    this.dialog.setDraw((p) => {
      p.background(30);
      const W = p.widthPx;
      const color = TONE_COLOR[spec.tone];
      p.ctx.fillStyle = color;
      p.ctx.fillRect(0, 0, W, 12);
      p.ctx.beginPath();
      p.ctx.arc(70, 80, 34, 0, Math.PI * 2);
      p.ctx.fill();
      p.text(TONE_ICON[spec.tone], 70, 58, { size: 44, bold: true, color: '#0b141a', align: 'center' });
      const titleW = spec.badge ? W - 360 : W - 160;
      p.paragraph(spec.title, 124, 50, titleW, { size: 40, bold: true, maxLines: 2 });
      if (spec.badge) {
        p.text(spec.badge.text, W - 40, 40, { size: 72, bold: true, color: spec.badge.color, align: 'right' });
      }
      if (spec.layout === 'stack') {
        let sy = p.paragraph(spec.body, 40, 150, W - 80, { size: 30, maxLines: 4 }) + 16;
        const bh = Math.min(96, (p.heightPx - sy - 30) / spec.buttons.length - 14);
        for (const b of spec.buttons) {
          p.button(b.id, b.label, 40, sy, W - 80, bh, b.onClick, {
            variant: b.variant ?? 'normal',
            align: 'left',
            size: 28,
          });
          sy += bh + 14;
        }
        return;
      }
      let y = p.paragraph(spec.body, 40, 150, W - 80, { size: 32, maxLines: spec.list ? 4 : 8 }) + 12;
      for (const item of spec.list ?? []) {
        if (y > p.heightPx - 170) {
          p.text('…', 40, y, { size: 28, color: UI.muted });
          break;
        }
        y = p.paragraph(item.text, 40, y, W - 80, { size: 27, color: item.color ?? UI.muted, maxLines: 2 }) + 6;
      }
      const n = spec.buttons.length;
      const gap = 20;
      const bw = (W - 80 - gap * (n - 1)) / n;
      spec.buttons.forEach((b, i) => {
        p.button(b.id, b.label, 40 + i * (bw + gap), p.heightPx - 120, bw, 90, b.onClick, {
          variant: b.variant ?? 'normal',
        });
      });
    });
  }

  closeDialog(): void {
    this.dialogOpen = false;
    this.dialog.mesh.visible = false;
  }

  /** Torque dial floating next to the held torque wrench. */
  showDial(anchor: Object3D | null, label: string): void {
    if (!anchor) {
      this.dial.mesh.visible = false;
      this.dial.mesh.removeFromParent();
      return;
    }
    if (this.dial.mesh.parent !== anchor) {
      anchor.add(this.dial.mesh);
      this.dial.mesh.position.set(0, 0.11, 0.05);
      this.dial.mesh.rotation.set(-0.5, 0, 0);
    }
    this.dial.mesh.visible = true;
    this.dial.setDraw((p) => {
      p.background(18);
      const W = p.widthPx;
      const [value, ...unit] = label.split(' ');
      p.button('dial-5', '−5', 8, 12, 64, p.heightPx - 24, () => this.onDial(-5), { size: 30 });
      p.button('dial-1', '−1', 76, 12, 64, p.heightPx - 24, () => this.onDial(-1), { size: 30 });
      p.text('TORQUE SET', W / 2, 10, { size: 18, color: UI.muted, align: 'center' });
      p.text(value ?? '', W / 2, 34, { size: 50, bold: true, align: 'center', maxWidth: 210 });
      p.text(unit.join(' '), W / 2, 92, { size: 22, color: UI.muted, align: 'center', maxWidth: 210 });
      p.button('dial+1', '+1', W - 140, 12, 64, p.heightPx - 24, () => this.onDial(1), { size: 30 });
      p.button('dial+5', '+5', W - 72, 12, 64, p.heightPx - 24, () => this.onDial(5), { size: 30 });
    });
  }
}
