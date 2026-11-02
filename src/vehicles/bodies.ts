import { type Group, Mesh, type MeshLambertMaterial, type Object3D, Shape } from 'three';
import { build } from '../world/lowpoly';
import { C } from '../world/palette';
import type { VehicleLayout } from './layout';

/** What a body builder gets: where to put meshes, and the paint color. */
export interface BodyContext {
  root: Object3D;
  hoodPivot: Group;
  layout: VehicleLayout;
  paint: number;
  trim: number;
  glass: MeshLambertMaterial;
  /** Adds a mesh to the car; solid ones stop pointer rays. */
  add(mesh: Mesh, solid?: boolean): Mesh;
}

function liftMarks(ctx: BodyContext, b: ReturnType<typeof build>, y: number, z: number): void {
  const L = ctx.layout.liftPoints;
  for (const p of [L.FL, L.FR, L.RL, L.RR]) {
    b.cyl(0.04, 0.0, 0.05, 3, C.safetyYellow, { p: [p[0], y, Math.sign(p[2]) * z] });
  }
}

/** The Aster S4: a compact four-door sedan. */
export function buildSedanBody(ctx: BodyContext): void {
  const s = new Shape();
  s.moveTo(-2.25, 0.3);
  s.lineTo(-1.75, 0.3);
  s.absarc(-1.35, 0.33, 0.4, Math.PI, 0, true);
  s.lineTo(0.95, 0.3);
  s.absarc(1.35, 0.33, 0.4, Math.PI, 0, true);
  s.lineTo(2.2, 0.3);
  s.lineTo(2.3, 0.45);
  s.lineTo(2.3, 0.78);
  // radiator support header: the closed hood rests on it
  s.lineTo(2.24, 0.83);
  s.lineTo(2.16, 0.83);
  s.lineTo(2.16, 0.72);
  s.lineTo(1.32, 0.72);
  s.lineTo(1.25, 0.98);
  s.lineTo(-1.32, 1.0);
  s.lineTo(-1.4, 0.97);
  s.lineTo(-2.18, 0.95);
  s.lineTo(-2.28, 0.8);
  s.lineTo(-2.3, 0.5);
  s.lineTo(-2.25, 0.3);

  const body = build()
    .extrude(s, 1.66, ctx.paint, {}, 0.03)
    // fenders forming the engine bay walls, their tops following the hood line
    .box(0.92, 0.2, 0.1, ctx.paint, { p: [1.77, 0.8, 0.79], r: [0, 0, -0.11] })
    .box(0.92, 0.2, 0.1, ctx.paint, { p: [1.77, 0.8, -0.79], r: [0, 0, -0.11] })
    // roof and pillars
    .box(1.24, 0.05, 1.5, ctx.paint, { p: [-0.2, 1.405, 0] })
    .box(0.07, 0.4, 0.05, ctx.paint, { p: [-0.15, 1.2, 0.76] })
    .box(0.07, 0.4, 0.05, ctx.paint, { p: [-0.15, 1.2, -0.76] })
    // bumpers, grille, lights
    .box(0.08, 0.2, 1.66, C.black, { p: [2.29, 0.45, 0] })
    .box(0.08, 0.2, 1.66, C.black, { p: [-2.29, 0.45, 0] })
    .box(0.04, 0.1, 0.8, C.black, { p: [2.3, 0.63, 0] })
    .box(0.05, 0.07, 0.32, C.headlight, { p: [2.27, 0.68, 0.58] })
    .box(0.05, 0.07, 0.32, C.headlight, { p: [2.27, 0.68, -0.58] })
    .box(0.05, 0.08, 0.34, C.taillight, { p: [-2.29, 0.84, 0.58] })
    .box(0.05, 0.08, 0.34, C.taillight, { p: [-2.29, 0.84, -0.58] })
    // mirrors and door seams
    .box(0.12, 0.08, 0.12, ctx.trim, { p: [1.05, 1.03, 0.9] })
    .box(0.12, 0.08, 0.12, ctx.trim, { p: [1.05, 1.03, -0.9] })
    .box(0.01, 0.6, 0.01, ctx.trim, { p: [-0.15, 0.7, 0.865] })
    .box(0.01, 0.6, 0.01, ctx.trim, { p: [-0.15, 0.7, -0.865] })
    .box(0.01, 0.6, 0.01, ctx.trim, { p: [1.0, 0.7, 0.865] })
    .box(0.01, 0.6, 0.01, ctx.trim, { p: [1.0, 0.7, -0.865] })
    // tire placard sticker on the driver-side B-pillar
    .box(0.1, 0.07, 0.004, C.white, { p: [-0.15, 0.86, -0.868] });
  liftMarks(ctx, body, 0.31, 0.83);
  ctx.add(body.mesh('body'));

  const gh = new Shape();
  gh.moveTo(-1.3, 0.98);
  gh.lineTo(1.22, 0.98);
  gh.lineTo(0.4, 1.4);
  gh.lineTo(-0.8, 1.4);
  gh.lineTo(-1.3, 0.98);
  const glass = new Mesh(build().extrude(gh, 1.52, C.glass).geometry(), ctx.glass);
  glass.name = 'glass';
  glass.renderOrder = 2;
  // Glass is see-through and the windows are open, so it does not block rays.
  ctx.add(glass, false);

  ctx.add(
    build()
      // transverse four-cylinder with its cover
      .box(0.5, 0.12, 0.72, C.engine, { p: [1.72, 0.76, 0] })
      .box(0.42, 0.05, 0.6, C.darkSteel, { p: [1.72, 0.845, 0] })
      // radiator behind the grille
      .box(0.06, 0.2, 1.2, C.darkSteel, { p: [2.2, 0.72, 0] })
      .mesh('engine'),
  );

  ctx.add(
    build()
      .box(4.2, 0.08, 1.5, C.darkSteel, { p: [0, 0.27, 0] })
      .cyl(0.03, 0.03, 3.6, 6, C.steel, { p: [-0.45, 0.19, 0.35], r: [0, 0, Math.PI / 2] })
      .box(0.5, 0.13, 0.3, C.steel, { p: [-1.6, 0.19, 0.35] })
      .box(0.25, 0.06, 0.6, C.black, { p: [1.3, 0.21, 0] })
      .mesh('underside'),
  );

  ctx.add(
    build()
      .box(0.35, 0.18, 1.4, C.black, { p: [1.0, 0.93, 0] })
      .torus(0.17, 0.02, C.black, { p: [0.78, 1.02, -0.38], r: [0, Math.PI / 2, 0.35] }, 4, 14)
      .box(0.5, 0.5, 0.5, C.darkSteel, { p: [0.2, 0.75, -0.38] })
      .box(0.5, 0.5, 0.5, C.darkSteel, { p: [0.2, 0.75, 0.38] })
      .box(0.5, 0.45, 1.3, C.darkSteel, { p: [-0.9, 0.75, 0] })
      .mesh('interior'),
    false,
  );
}

/** The Talus 1500: a full-size crew-cab pickup with a short bed and a 4WD stance. */
export function buildPickupBody(ctx: BodyContext): void {
  const s = new Shape();
  s.moveTo(-2.9, 0.62);
  s.lineTo(-2.45, 0.62);
  s.absarc(-1.95, 0.4, 0.5, Math.PI - 0.45, 0.45, true);
  s.lineTo(1.2, 0.62);
  s.absarc(1.75, 0.4, 0.5, Math.PI - 0.45, 0.45, true);
  s.lineTo(2.9, 0.62);
  s.lineTo(2.95, 0.75);
  s.lineTo(2.95, 1.08);
  s.lineTo(2.9, 1.1);
  s.lineTo(2.84, 1.1);
  s.lineTo(2.84, 0.95);
  s.lineTo(1.4, 0.95);
  s.lineTo(1.36, 1.26);
  s.lineTo(1.25, 1.33);
  s.lineTo(-0.55, 1.33);
  s.lineTo(-0.62, 1.31);
  s.lineTo(-2.88, 1.31);
  s.lineTo(-2.95, 1.22);
  s.lineTo(-2.95, 0.72);
  s.lineTo(-2.9, 0.62);

  const body = build()
    .extrude(s, 1.9, ctx.paint, {}, 0.03)
    // front fenders form the engine bay walls up to the hood
    .box(1.42, 0.27, 0.1, ctx.paint, { p: [2.1, 1.08, 0.92] })
    .box(1.42, 0.27, 0.1, ctx.paint, { p: [2.1, 1.08, -0.92] })
    // fender flares over the wheels
    .box(1.05, 0.06, 0.08, C.black, { p: [1.75, 0.98, 0.99] })
    .box(1.05, 0.06, 0.08, C.black, { p: [1.75, 0.98, -0.99] })
    .box(1.05, 0.06, 0.08, C.black, { p: [-1.95, 0.98, 0.99] })
    .box(1.05, 0.06, 0.08, C.black, { p: [-1.95, 0.98, -0.99] })
    // cab roof and pillars
    .box(1.05, 0.06, 1.72, ctx.paint, { p: [-0.02, 1.91, 0] })
    .box(0.08, 0.58, 0.06, ctx.paint, { p: [0.35, 1.62, 0.9] })
    .box(0.08, 0.58, 0.06, ctx.paint, { p: [0.35, 1.62, -0.9] })
    .box(0.08, 0.58, 0.06, ctx.paint, { p: [-0.52, 1.62, 0.9] })
    .box(0.08, 0.58, 0.06, ctx.paint, { p: [-0.52, 1.62, -0.9] })
    // tonneau cover over the bed, bed rails and tailgate seam
    .box(2.28, 0.03, 1.84, C.black, { p: [-1.75, 1.325, 0] })
    .box(0.01, 0.5, 1.84, ctx.trim, { p: [-2.94, 1.0, 0] })
    // grille, lights, bumpers, tow hooks
    .box(0.06, 0.3, 1.3, C.darkSteel, { p: [2.96, 0.96, 0] })
    .box(0.07, 0.03, 1.3, C.chrome, { p: [2.97, 0.9, 0] })
    .box(0.07, 0.03, 1.3, C.chrome, { p: [2.97, 1.02, 0] })
    .box(0.05, 0.12, 0.3, C.headlight, { p: [2.97, 1.08, 0.72] })
    .box(0.05, 0.12, 0.3, C.headlight, { p: [2.97, 1.08, -0.72] })
    .box(0.05, 0.3, 0.1, C.taillight, { p: [-2.98, 1.05, 0.88] })
    .box(0.05, 0.3, 0.1, C.taillight, { p: [-2.98, 1.05, -0.88] })
    .box(0.14, 0.22, 2.0, C.chrome, { p: [3.0, 0.66, 0] })
    .box(0.14, 0.2, 2.0, C.chrome, { p: [-3.0, 0.66, 0] })
    .box(0.05, 0.05, 0.08, C.safetyRed, { p: [3.08, 0.6, 0.55] })
    .box(0.05, 0.05, 0.08, C.safetyRed, { p: [3.08, 0.6, -0.55] })
    // mirrors, door seams and handles
    .box(0.14, 0.14, 0.16, ctx.trim, { p: [1.15, 1.45, 1.03] })
    .box(0.14, 0.14, 0.16, ctx.trim, { p: [1.15, 1.45, -1.03] })
    .box(0.01, 0.7, 0.01, ctx.trim, { p: [0.35, 0.98, 0.955] })
    .box(0.01, 0.7, 0.01, ctx.trim, { p: [0.35, 0.98, -0.955] })
    .box(0.01, 0.7, 0.01, ctx.trim, { p: [1.3, 0.98, 0.955] })
    .box(0.01, 0.7, 0.01, ctx.trim, { p: [1.3, 0.98, -0.955] })
    .box(0.01, 0.7, 0.01, ctx.trim, { p: [-0.55, 0.98, 0.955] })
    .box(0.01, 0.7, 0.01, ctx.trim, { p: [-0.55, 0.98, -0.955] })
    // running boards
    .box(1.7, 0.05, 0.16, C.black, { p: [0.38, 0.52, 1.02] })
    .box(1.7, 0.05, 0.16, C.black, { p: [0.38, 0.52, -1.02] })
    // tire placard on the driver-side B-pillar
    .box(0.1, 0.07, 0.004, C.white, { p: [0.35, 1.12, -0.958] });
  ctx.add(body.mesh('body'));

  const gh = new Shape();
  gh.moveTo(-0.5, 1.32);
  gh.lineTo(1.22, 1.32);
  gh.lineTo(0.55, 1.88);
  gh.lineTo(-0.48, 1.88);
  gh.lineTo(-0.5, 1.32);
  const glass = new Mesh(build().extrude(gh, 1.78, C.glass).geometry(), ctx.glass);
  glass.name = 'glass';
  glass.renderOrder = 2;
  ctx.add(glass, false);

  ctx.add(
    build()
      // longitudinal V6 with its intake cover
      .box(0.8, 0.18, 0.62, C.engine, { p: [2.0, 1.04, 0] })
      .box(0.6, 0.06, 0.42, C.darkSteel, { p: [2.0, 1.15, 0] })
      .box(0.06, 0.22, 1.5, C.darkSteel, { p: [2.76, 1.0, 0] })
      .mesh('engine'),
  );

  ctx.add(
    build()
      // ladder frame rails and crossmembers
      .box(5.5, 0.18, 0.1, C.black, { p: [-0.05, 0.47, 0.5] })
      .box(5.5, 0.18, 0.1, C.black, { p: [-0.05, 0.47, -0.5] })
      .box(0.1, 0.14, 1.0, C.black, { p: [2.5, 0.47, 0] })
      .box(0.1, 0.14, 1.0, C.black, { p: [0.2, 0.47, 0] })
      .box(0.1, 0.14, 1.0, C.black, { p: [-2.4, 0.47, 0] })
      // cab and bed floors
      .box(1.85, 0.05, 1.8, C.darkSteel, { p: [0.35, 0.6, 0] })
      .box(2.3, 0.05, 1.8, C.darkSteel, { p: [-1.75, 0.66, 0] })
      // transmission, transfer case, driveshafts
      .box(0.7, 0.2, 0.28, C.engine, { p: [1.15, 0.6, 0] })
      .box(0.3, 0.18, 0.24, C.darkSteel, { p: [0.62, 0.55, 0] })
      .cyl(0.035, 0.035, 2.4, 6, C.steel, { p: [-0.75, 0.42, 0], r: [0, 0, Math.PI / 2 - 0.03] })
      .cyl(0.03, 0.03, 1.1, 6, C.steel, { p: [1.2, 0.36, 0.05], r: [0, 0, Math.PI / 2 + 0.08] })
      // front and rear differentials and axle tubes
      .sphere(0.13, C.darkSteel, { p: [1.75, 0.38, 0.05] })
      .sphere(0.15, C.darkSteel, { p: [-1.95, 0.38, 0.05] })
      .cyl(0.045, 0.045, 1.5, 6, C.darkSteel, { p: [-1.95, 0.4, 0], r: [Math.PI / 2, 0, 0] })
      // exhaust
      .cyl(0.03, 0.03, 3.2, 6, C.steel, { p: [-0.9, 0.45, 0.3], r: [0, 0, Math.PI / 2] })
      .box(0.55, 0.14, 0.24, C.steel, { p: [-0.4, 0.44, 0.3] })
      .mesh('underside'),
  );

  ctx.add(
    build()
      .box(0.35, 0.2, 1.6, C.black, { p: [1.1, 1.25, 0] })
      .torus(0.19, 0.022, C.black, { p: [0.88, 1.38, -0.42], r: [0, Math.PI / 2, 0.35] }, 4, 14)
      .box(0.55, 0.55, 0.62, C.darkSteel, { p: [0.45, 1.0, -0.42] })
      .box(0.55, 0.55, 0.62, C.darkSteel, { p: [0.45, 1.0, 0.42] })
      .box(0.5, 0.5, 1.6, C.darkSteel, { p: [-0.35, 1.0, 0] })
      .mesh('interior'),
    false,
  );
}
