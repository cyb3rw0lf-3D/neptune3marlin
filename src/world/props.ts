import { CatmullRomCurve3, Group, Mesh, MeshLambertMaterial, Object3D, Shape, TubeGeometry, Vector3 } from 'three';
import { build } from './lowpoly';
import { C } from './palette';

const HANDLE_LEN = 1.2;
const HANDLE_REST = 0.44;
const ARM_LEN = 0.74;
const ARM_PIVOT = new Vector3(0.76, 0.13, 0);

/**
 * A low-profile floor jack. Local frame: the saddle end is at x=0 and the
 * handle sticks out toward +x. Pumping the handle raises the saddle; twisting
 * the handle opens the release valve.
 */
export class FloorJack {
  readonly root = new Group();
  readonly handle = new Group();
  readonly grip = new Object3D();
  readonly occluder: Mesh;
  private readonly arm = new Group();
  private readonly saddle: Mesh;
  saddleHeight = 0.13;

  constructor() {
    this.root.name = 'floor-jack';
    const frame = build()
      .box(0.86, 0.06, 0.06, C.safetyRed, { p: [0.45, 0.07, 0.13] })
      .box(0.86, 0.06, 0.06, C.safetyRed, { p: [0.45, 0.07, -0.13] })
      .box(0.12, 0.12, 0.32, C.safetyRed, { p: [0.84, 0.1, 0] })
      .cyl(0.035, 0.035, 0.14, 8, C.darkSteel, { p: [0.8, 0.16, 0], r: [0, 0, 0.4] })
      .cyl(0.04, 0.04, 0.03, 8, C.black, { p: [0.08, 0.04, 0.17], r: [Math.PI / 2, 0, 0] })
      .cyl(0.04, 0.04, 0.03, 8, C.black, { p: [0.08, 0.04, -0.17], r: [Math.PI / 2, 0, 0] })
      .cyl(0.05, 0.05, 0.04, 8, C.black, { p: [0.84, 0.05, 0.19], r: [Math.PI / 2, 0, 0] })
      .cyl(0.05, 0.05, 0.04, 8, C.black, { p: [0.84, 0.05, -0.19], r: [Math.PI / 2, 0, 0] })
      .mesh('jack-frame');
    this.root.add(frame);
    this.occluder = frame;

    this.arm.position.copy(ARM_PIVOT);
    this.arm.add(
      build()
        .box(ARM_LEN, 0.05, 0.16, C.safetyRed, { p: [-ARM_LEN / 2, 0, 0] })
        .mesh('jack-arm'),
    );
    this.saddle = build()
      .cyl(0.06, 0.05, 0.04, 10, C.darkSteel, { p: [0, 0.02, 0] })
      .box(0.1, 0.012, 0.02, C.steel, { p: [0, 0.045, 0] })
      .mesh('jack-saddle');
    this.root.add(this.arm, this.saddle);

    this.handle.position.set(0.86, 0.18, 0);
    this.handle.add(
      build()
        .cyl(0.016, 0.016, HANDLE_LEN, 6, C.darkSteel, { p: [HANDLE_LEN / 2, 0, 0], r: [0, 0, Math.PI / 2] })
        .cyl(0.024, 0.024, 0.2, 8, C.black, { p: [HANDLE_LEN - 0.1, 0, 0], r: [0, 0, Math.PI / 2] })
        .mesh('jack-handle'),
    );
    this.grip.position.set(HANDLE_LEN - 0.1, 0, 0);
    this.handle.add(this.grip);
    this.handle.rotation.z = HANDLE_REST;
    this.root.add(this.handle);
    this.setSaddle(0.13);
  }

  /** Saddle top height above the floor (jack-local). */
  setSaddle(h: number): void {
    this.saddleHeight = h;
    const rise = Math.max(-0.05, Math.min(ARM_LEN * 0.9, h - 0.065 - ARM_PIVOT.y));
    const a = Math.asin(rise / ARM_LEN);
    this.arm.rotation.z = -a;
    this.saddle.position.set(ARM_PIVOT.x - Math.cos(a) * ARM_LEN, ARM_PIVOT.y + rise, 0);
  }

  /** Handle pump angle offset (0 at rest, negative pushes it down). */
  pump(offset: number): void {
    this.handle.rotation.z = HANDLE_REST + offset;
  }
}

/** An adjustable jack stand: tripod base, ratcheting column, cradle on top. */
export class JackStand {
  readonly root = new Group();
  private readonly column: Mesh;

  constructor() {
    this.root.name = 'jack-stand';
    this.root.add(
      build()
        .cyl(0.035, 0.14, 0.26, 3, C.safetyRed, { p: [0, 0.13, 0] })
        .cyl(0.04, 0.04, 0.05, 8, C.darkSteel, { p: [0, 0.27, 0] })
        .mesh('stand-base'),
    );
    this.column = build()
      .cyl(0.022, 0.022, 0.3, 6, C.steel, { p: [0, -0.15, 0] })
      .box(0.08, 0.025, 0.05, C.darkSteel, { p: [0, 0.0125, 0] })
      .box(0.012, 0.04, 0.05, C.darkSteel, { p: [0.034, 0.03, 0] })
      .box(0.012, 0.04, 0.05, C.darkSteel, { p: [-0.034, 0.03, 0] })
      .mesh('stand-column');
    this.root.add(this.column);
    this.setHeight(0.3);
  }

  /** Cradle height above the floor. */
  setHeight(h: number): void {
    this.column.position.y = Math.max(0.29, h);
  }
}

/** A rubber wheel chock (a wedge). */
export function buildChock(): Mesh {
  const s = new Shape();
  s.moveTo(-0.1, 0);
  s.lineTo(0.1, 0);
  s.lineTo(0.06, 0.11);
  s.lineTo(-0.1, 0);
  return build().extrude(s, 0.16, C.safetyYellow).mesh('chock');
}

/** A portable jump pack with its two clamp leads coiled on top. */
export function buildJumpPack(): Group {
  const g = new Group();
  g.name = 'jump-pack';
  g.add(
    build()
      .box(0.28, 0.2, 0.12, C.safetyYellow, { p: [0, 0.1, 0] })
      .box(0.2, 0.08, 0.125, C.black, { p: [0, 0.12, 0] })
      .box(0.06, 0.04, 0.03, C.green, { p: [0.08, 0.2, 0.05] })
      .mesh('jump-pack'),
  );
  return g;
}

/** Jumper cable clamp, colored by polarity. */
export function buildClamp(color: number): Mesh {
  return build()
    .box(0.03, 0.05, 0.07, color)
    .box(0.02, 0.012, 0.06, C.chrome, { p: [0, -0.03, 0] })
    .mesh('clamp');
}

const cableMats = {
  red: new MeshLambertMaterial({ color: C.safetyRed }),
  black: new MeshLambertMaterial({ color: 0x1a1c1e }),
};

/** A sagging cable between two points, rebuilt when its ends move. */
export class Cable {
  readonly mesh: Mesh;

  constructor(color: 'red' | 'black') {
    this.mesh = new Mesh(undefined, cableMats[color]);
    this.mesh.visible = false;
  }

  connect(a: Vector3 | null, b: Vector3 | null): void {
    this.mesh.geometry.dispose();
    if (!a || !b) {
      this.mesh.visible = false;
      return;
    }
    const mid = a.clone().lerp(b, 0.5);
    mid.y = Math.max(0.05, Math.min(a.y, b.y) - 0.35);
    const curve = new CatmullRomCurve3([
      a,
      a
        .clone()
        .lerp(mid, 0.5)
        .setY(a.y - 0.2),
      mid,
      b
        .clone()
        .lerp(mid, 0.5)
        .setY(b.y - 0.2),
      b,
    ]);
    this.mesh.geometry = new TubeGeometry(curve, 16, 0.009, 4, false);
    this.mesh.visible = true;
  }
}
