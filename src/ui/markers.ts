import { ConeGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, type Object3D, RingGeometry, Vector3 } from 'three';
import { Panel, UI } from './panel';

const _v = new Vector3();

/**
 * A pulsing halo with a pointer chevron. Blue for "do this here", orange for
 * "use this tool" — shape plus color, so it reads without color vision.
 */
class Halo {
  readonly group = new Group();
  private readonly ring: Mesh;
  private follow: Object3D | null = null;
  private t = Math.random() * 3;

  constructor(color: number, chevron: boolean) {
    const mat = new MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthTest: false });
    this.ring = new Mesh(new RingGeometry(0.075, 0.095, 24), mat);
    this.ring.renderOrder = 15;
    this.group.add(this.ring);
    if (chevron) {
      const cone = new Mesh(new ConeGeometry(0.035, 0.07, 4).rotateX(Math.PI), mat);
      cone.position.y = 0.16;
      cone.renderOrder = 15;
      this.group.add(cone);
    }
    this.group.visible = false;
  }

  show(target: Object3D | null): void {
    this.follow = target;
    this.group.visible = !!target;
  }

  update(dt: number, camera: Object3D): void {
    if (!this.follow) return;
    this.t += dt;
    this.follow.getWorldPosition(this.group.position);
    this.group.lookAt(camera.getWorldPosition(_v));
    const s = 1 + Math.sin(this.t * 5) * 0.12;
    this.ring.scale.setScalar(s);
    const cone = this.group.children[1];
    if (cone) cone.position.y = 0.16 + Math.sin(this.t * 5) * 0.02;
  }
}

/** Highlights, progress ring, readings and hover labels floating in the world. */
export class Markers {
  readonly root = new Group();
  private targetHalos: Halo[] = [];
  private itemHalo = new Halo(0xffa630, false);
  private hoverHalo = new Halo(0xffffff, false);
  private readonly progressRing: Mesh;
  private readonly progressBg: Mesh;
  private readonly segments = 40;
  private readonly reading: Panel;
  private readingAnchor: Object3D | null = null;
  private readingTimer = 0;
  private readonly label: Panel;
  private labelText = '';
  private labelAnchor: Object3D | null = null;
  /** Green / yellow / red call for an inspected part, shown beside it. */
  readonly tag: Panel;
  private tagAnchor: Object3D | null = null;

  constructor() {
    for (let i = 0; i < 6; i++) {
      const h = new Halo(0x2f9bff, true);
      this.targetHalos.push(h);
      this.root.add(h.group);
    }
    this.root.add(this.itemHalo.group, this.hoverHalo.group);

    this.progressBg = new Mesh(
      new RingGeometry(0.11, 0.135, this.segments),
      new MeshBasicMaterial({ color: 0x0b1a24, transparent: true, opacity: 0.6, depthTest: false }),
    );
    this.progressRing = new Mesh(
      new RingGeometry(0.11, 0.135, this.segments, 1, Math.PI / 2, -Math.PI * 2),
      new MeshBasicMaterial({ color: 0x3fbf6f, depthTest: false, transparent: true, side: DoubleSide }),
    );
    this.progressBg.renderOrder = 16;
    this.progressRing.renderOrder = 17;
    this.progressBg.add(this.progressRing);
    this.progressBg.visible = false;
    this.root.add(this.progressBg);

    this.reading = new Panel('reading', 0.42, 0.16, 1000);
    this.reading.mesh.userData.pick = undefined;
    this.reading.mesh.visible = false;
    this.root.add(this.reading.mesh);

    this.tag = new Panel('tag', 0.62, 0.42, 1000);
    this.tag.mesh.visible = false;
    this.root.add(this.tag.mesh);

    this.label = new Panel('label', 0.5, 0.075, 1000);
    this.label.mesh.userData.pick = undefined;
    this.label.mesh.visible = false;
    this.root.add(this.label.mesh);
  }

  showTargets(anchors: Object3D[]): void {
    this.targetHalos.forEach((h, i) => {
      h.show(anchors[i] ?? null);
    });
  }

  showItem(anchor: Object3D | null): void {
    this.itemHalo.show(anchor);
  }

  hover(anchor: Object3D | null, text: string): void {
    this.hoverHalo.show(anchor);
    this.labelAnchor = anchor;
    this.label.mesh.visible = !!anchor && !!text;
    if (text !== this.labelText) {
      this.labelText = text;
      this.label.setDraw((p) => {
        if (!text) return;
        p.ctx.font = `700 40px ${'"Atkinson Hyperlegible", Arial, sans-serif'}`;
        const w = Math.min(p.widthPx, p.ctx.measureText(text).width + 50);
        const x = (p.widthPx - w) / 2;
        p.ctx.fillStyle = 'rgba(10,20,28,0.85)';
        p.ctx.beginPath();
        p.ctx.roundRect?.(x, 0, w, p.heightPx, 18);
        p.ctx.fill();
        p.text(text, p.widthPx / 2, 14, { size: 40, bold: true, align: 'center', maxWidth: p.widthPx - 30 });
      });
    }
  }

  /** Shows gesture progress (0..1) at an anchor, or hides it with null. */
  progress(anchor: Object3D | null, value: number, color = 0x3fbf6f): void {
    this.progressBg.visible = !!anchor;
    if (!anchor) return;
    anchor.getWorldPosition(this.progressBg.position);
    const n = Math.round(Math.max(0, Math.min(1, value)) * this.segments);
    this.progressRing.geometry.setDrawRange(0, n * 6);
    (this.progressRing.material as MeshBasicMaterial).color.setHex(color);
  }

  showReading(anchor: Object3D, title: string, value: string, note?: string): void {
    this.readingAnchor = anchor;
    this.readingTimer = 6;
    this.reading.mesh.visible = true;
    this.reading.setDraw((p) => {
      p.background(22);
      p.text(title, 24, 14, { size: 26, color: UI.muted, maxWidth: p.widthPx - 48 });
      p.text(value, 24, 48, { size: 50, bold: true, maxWidth: p.widthPx - 48 });
      if (note) p.text(note, 24, 108, { size: 22, color: UI.muted, maxWidth: p.widthPx - 48 });
    });
  }

  /** Shows the inspection tag popup: what was found, and three calls to pick from. */
  showTag(anchor: Object3D, title: string, finding: string, options: string[], onPick: (i: number) => void): void {
    this.hideReading();
    this.tagAnchor = anchor;
    this.tag.mesh.visible = true;
    const swatch = [UI.good, UI.warn, UI.bad];
    this.tag.setDraw((p) => {
      p.background(22);
      p.text(title, 24, 16, { size: 26, color: UI.muted, maxWidth: p.widthPx - 48 });
      p.paragraph(finding, 24, 52, p.widthPx - 48, { size: 28, bold: true, maxLines: 3 });
      options.forEach((label, i) => {
        const y = 168 + i * 82;
        p.button(`tag-${i}`, label, 24, y, p.widthPx - 48, 70, () => onPick(i), { align: 'left', size: 28 });
        // Color plus shape (circle, triangle, square) so the call reads without color vision.
        const ctx = p.ctx;
        const cx = p.widthPx - 70;
        const cy = y + 35;
        ctx.fillStyle = swatch[i] ?? UI.muted;
        ctx.beginPath();
        if (i === 0) ctx.arc(cx, cy, 16, 0, Math.PI * 2);
        else if (i === 1) {
          ctx.moveTo(cx, cy - 18);
          ctx.lineTo(cx + 18, cy + 14);
          ctx.lineTo(cx - 18, cy + 14);
        } else ctx.rect(cx - 15, cy - 15, 30, 30);
        ctx.fill();
      });
    });
  }

  hideTag(): void {
    this.tagAnchor = null;
    this.tag.mesh.visible = false;
  }

  get tagOpen(): boolean {
    return this.tag.mesh.visible;
  }

  hideReading(): void {
    this.readingAnchor = null;
    this.reading.mesh.visible = false;
  }

  update(dt: number, camera: Object3D): void {
    for (const h of this.targetHalos) h.update(dt, camera);
    this.itemHalo.update(dt, camera);
    this.hoverHalo.update(dt, camera);
    const cam = camera.getWorldPosition(new Vector3());
    if (this.progressBg.visible) this.progressBg.lookAt(cam);
    if (this.readingAnchor) {
      this.readingTimer -= dt;
      this.readingAnchor.getWorldPosition(this.reading.mesh.position);
      this.reading.mesh.position.y += 0.22;
      this.reading.mesh.lookAt(cam);
      if (this.readingTimer <= 0) this.hideReading();
    }
    if (this.tagAnchor) {
      this.tagAnchor.getWorldPosition(this.tag.mesh.position);
      // Float above the part and a little toward the viewer.
      const toCam = cam.clone().sub(this.tag.mesh.position).setY(0).normalize().multiplyScalar(0.15);
      this.tag.mesh.position.add(toCam);
      this.tag.mesh.position.y += 0.32;
      this.tag.mesh.lookAt(cam);
    }
    if (this.labelAnchor && this.label.mesh.visible) {
      this.labelAnchor.getWorldPosition(this.label.mesh.position);
      this.label.mesh.position.y += 0.13;
      this.label.mesh.lookAt(cam);
    }
  }
}
