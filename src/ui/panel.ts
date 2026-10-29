import {
  CanvasTexture,
  DoubleSide,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from 'three';

export const FONT = '"Atkinson Hyperlegible", "Segoe UI", Roboto, Arial, sans-serif';

/** UI colors (canvas CSS strings). Blue/orange pair stays readable for color-blind players. */
export const UI = {
  bg: '#121c24',
  bgSolid: '#121c24',
  card: '#1f2f3b',
  cardHover: '#2b4152',
  border: '#3a5366',
  text: '#f1f5f8',
  muted: '#a9bac7',
  accent: '#2f9bff',
  accentText: '#ffffff',
  good: '#3fbf6f',
  warn: '#ffa630',
  bad: '#ff5c5c',
  disabled: '#4b5a66',
};

export interface Button {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  onClick: () => void;
  enabled: boolean;
}

export interface ButtonStyle {
  variant?: 'primary' | 'normal' | 'danger' | 'ghost' | 'good';
  size?: number;
  enabled?: boolean;
  selected?: boolean;
  align?: 'center' | 'left';
}

/**
 * A flat in-world panel drawn with the 2D canvas API onto a texture. Panels are
 * redrawn only when their content changes. Buttons are registered while
 * drawing, so hit-testing always matches what is on screen.
 */
export class Panel {
  readonly mesh: Mesh;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: CanvasTexture;
  readonly widthPx: number;
  readonly heightPx: number;
  buttons: Button[] = [];
  hoverId: string | null = null;
  private drawFn: (p: Panel) => void = () => {};

  constructor(
    readonly name: string,
    readonly widthM: number,
    readonly heightM: number,
    pxPerM = 1100,
  ) {
    this.widthPx = Math.round(widthM * pxPerM);
    this.heightPx = Math.round(heightM * pxPerM);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.widthPx;
    this.canvas.height = this.heightPx;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas not available');
    this.ctx = ctx;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearMipmapLinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.anisotropy = 4;
    const mat = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
      depthTest: false,
    });
    this.mesh = new Mesh(new PlaneGeometry(widthM, heightM), mat);
    this.mesh.name = `panel:${name}`;
    this.mesh.renderOrder = 10;
    this.mesh.userData.pick = { kind: 'ui', id: name };
    this.mesh.userData.enabled = true;
    this.mesh.userData.panel = this;
  }

  setDraw(fn: (p: Panel) => void): this {
    this.drawFn = fn;
    this.redraw();
    return this;
  }

  redraw(): void {
    this.buttons = [];
    this.ctx.clearRect(0, 0, this.widthPx, this.heightPx);
    this.drawFn(this);
    this.texture.needsUpdate = true;
  }

  /** Converts a raycast UV into a button, if any. */
  hit(uv: { x: number; y: number }): Button | null {
    const x = uv.x * this.widthPx;
    const y = (1 - uv.y) * this.heightPx;
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i] as Button;
      if (b.enabled && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
    }
    return null;
  }

  setHover(id: string | null): void {
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.redraw();
  }

  click(id: string): boolean {
    const b = this.buttons.find((btn) => btn.id === id && btn.enabled);
    if (!b) return false;
    b.onClick();
    return true;
  }

  // --- drawing helpers ---

  background(radius = 28, color = UI.bg): void {
    roundRect(this.ctx, 0, 0, this.widthPx, this.heightPx, radius);
    this.ctx.fillStyle = color;
    this.ctx.fill();
    this.ctx.lineWidth = 3;
    this.ctx.strokeStyle = UI.border;
    this.ctx.stroke();
  }

  text(
    str: string,
    x: number,
    y: number,
    opts: { size?: number; color?: string; bold?: boolean; align?: CanvasTextAlign; maxWidth?: number } = {},
  ): void {
    const ctx = this.ctx;
    ctx.font = `${opts.bold ? '700' : '400'} ${opts.size ?? 34}px ${FONT}`;
    ctx.fillStyle = opts.color ?? UI.text;
    ctx.textAlign = opts.align ?? 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(opts.maxWidth ? ellipsize(ctx, str, opts.maxWidth) : str, x, y);
  }

  /** Word-wrapped paragraph; returns the y below the last line. */
  paragraph(
    str: string,
    x: number,
    y: number,
    width: number,
    opts: { size?: number; color?: string; bold?: boolean; lineHeight?: number; maxLines?: number } = {},
  ): number {
    const size = opts.size ?? 32;
    this.ctx.font = `${opts.bold ? '700' : '400'} ${size}px ${FONT}`;
    const lines = wrap(this.ctx, str, width);
    const lh = opts.lineHeight ?? Math.round(size * 1.3);
    const shown = opts.maxLines ? lines.slice(0, opts.maxLines) : lines;
    shown.forEach((line, i) => {
      const last = opts.maxLines && i === opts.maxLines - 1 && lines.length > opts.maxLines;
      this.text(last ? `${line.replace(/\s+\S*$/, '')}…` : line, x, y + i * lh, {
        size,
        color: opts.color,
        bold: opts.bold,
      });
    });
    return y + shown.length * lh;
  }

  button(
    id: string,
    label: string,
    x: number,
    y: number,
    w: number,
    h: number,
    onClick: () => void,
    style: ButtonStyle = {},
  ): void {
    const enabled = style.enabled ?? true;
    const hover = enabled && this.hoverId === id;
    const ctx = this.ctx;
    let fill: string = UI.card;
    let textColor: string = UI.text;
    if (style.variant === 'primary') {
      fill = hover ? '#5bb2ff' : UI.accent;
      textColor = UI.accentText;
    } else if (style.variant === 'good') {
      fill = hover ? '#5fd38a' : UI.good;
      textColor = '#0b1a10';
    } else if (style.variant === 'danger') {
      fill = hover ? '#ff7f7f' : '#c94343';
    } else if (style.variant === 'ghost') {
      fill = hover ? UI.cardHover : 'rgba(0,0,0,0)';
    } else if (hover) {
      fill = UI.cardHover;
    }
    if (!enabled) {
      fill = UI.card;
      textColor = UI.disabled;
    }
    roundRect(ctx, x, y, w, h, Math.min(18, h / 3));
    ctx.fillStyle = fill;
    ctx.fill();
    if (style.selected || hover) {
      ctx.lineWidth = 5;
      ctx.strokeStyle = style.selected ? UI.warn : '#9fd0ff';
      ctx.stroke();
    } else if (style.variant !== 'ghost') {
      ctx.lineWidth = 2;
      ctx.strokeStyle = UI.border;
      ctx.stroke();
    }
    let size = style.size ?? Math.min(36, Math.round(h * 0.42));
    ctx.font = `700 ${size}px ${FONT}`;
    // Shrink long labels a little before truncating them.
    while (size > 18 && ctx.measureText(label).width > w - 36) {
      size -= 2;
      ctx.font = `700 ${size}px ${FONT}`;
    }
    ctx.fillStyle = textColor;
    ctx.textBaseline = 'middle';
    if (style.align === 'left') {
      ctx.textAlign = 'left';
      ctx.fillText(ellipsize(ctx, label, w - 36), x + 24, y + h / 2 + 1);
    } else {
      ctx.textAlign = 'center';
      ctx.fillText(ellipsize(ctx, label, w - 24), x + w / 2, y + h / 2 + 1);
    }
    this.buttons.push({ id, x, y, w, h, onClick, enabled });
  }
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Cuts text to fit a width, ending with an ellipsis, using the context's current font. */
export function ellipsize(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= width) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo).trimEnd()}…`;
}

export function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > width && line) {
        out.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

/** A static text sign (walls, labels) drawn once. */
export function sign(
  text: string,
  widthM: number,
  heightM: number,
  opts: { bg?: string; color?: string; size?: number; sub?: string } = {},
): Mesh {
  const p = new Panel(`sign:${text}`, widthM, heightM, 600);
  p.setDraw((panel) => {
    const ctx = panel.ctx;
    ctx.fillStyle = opts.bg ?? '#1d2b36';
    roundRect(ctx, 0, 0, panel.widthPx, panel.heightPx, 16);
    ctx.fill();
    const size = opts.size ?? Math.round(panel.heightPx * (opts.sub ? 0.38 : 0.5));
    panel.text(text, panel.widthPx / 2, opts.sub ? panel.heightPx * 0.14 : (panel.heightPx - size) / 2, {
      size,
      bold: true,
      color: opts.color ?? '#ffffff',
      align: 'center',
      maxWidth: panel.widthPx - 20,
    });
    if (opts.sub) {
      panel.text(opts.sub, panel.widthPx / 2, panel.heightPx * 0.6, {
        size: Math.round(size * 0.55),
        color: opts.color ?? '#ffffff',
        align: 'center',
        maxWidth: panel.widthPx - 20,
      });
    }
  });
  p.mesh.userData.pick = undefined;
  p.mesh.renderOrder = 0;
  const mat = p.mesh.material as MeshBasicMaterial;
  mat.transparent = false;
  mat.alphaTest = 0.5;
  mat.depthWrite = true;
  mat.depthTest = true;
  return p.mesh;
}
