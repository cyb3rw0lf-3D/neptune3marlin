import {
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  Quaternion,
  Shape,
  Vector3,
} from 'three';
import { boxCollider, type Registry, sphereCollider } from '../interaction/registry';
import { build } from '../world/lowpoly';
import { C } from '../world/palette';
import { type VehicleSpec, WHEEL_NAMES, WHEELS, type WheelPos } from './specs';

const WHEEL_R = 0.33;
const TIRE_W = 0.215;
const LUG_RADIUS = 0.065;

export interface WheelAssembly {
  pos: WheelPos;
  /** Fixed to the car at the wheel center; brake parts live here. */
  hub: Group;
  /** Which way is outward from the car (+1 right side, -1 left side). */
  side: 1 | -1;
  /** The wheel currently mounted on this hub, if any. */
  mounted: WheelPos | null;
  lugs: Mesh;
  lugAnchors: Object3D[];
}

/** A wheel (tire + rim) that can come off and move to another hub. */
export interface WheelPart {
  origin: WheelPos;
  group: Group;
}

const glassMat = new MeshLambertMaterial({ color: C.glass, transparent: true, opacity: 0.55 });

/**
 * A serviceable car: a root that rides on the lift, a hinged hood, removable
 * wheels and named anchors for every part a lesson can target.
 */
export class Vehicle {
  readonly root = new Group();
  readonly spec: VehicleSpec;
  readonly hoodPivot = new Group();
  readonly wheels = {} as Record<WheelPos, WheelAssembly>;
  readonly wheelParts = {} as Record<WheelPos, WheelPart>;
  readonly anchors = new Map<string, Object3D>();
  /** Small green torque marks painted on lugs once torqued. */
  readonly torqueMarks: InstancedMesh;
  /** Visual pieces that lessons show or hide. */
  readonly drainPlug: Mesh;
  readonly oilFilter: Mesh;
  readonly fillCap: Mesh;
  readonly dipstick: Mesh;
  readonly liftPoints: Record<WheelPos, Vector3> = {
    FL: new Vector3(1.02, 0.28, -0.74),
    FR: new Vector3(1.02, 0.28, 0.74),
    RL: new Vector3(-1.12, 0.28, -0.74),
    RR: new Vector3(-1.12, 0.28, 0.74),
  };

  constructor(spec: VehicleSpec) {
    this.spec = spec;
    this.root.name = `vehicle:${spec.id}`;
    this.buildBody();
    this.buildEngineBay();
    this.buildUnderside();
    this.buildInterior();
    for (const pos of WHEELS) this.buildWheel(pos);

    this.drainPlug = this.named(build().cyl(0.02, 0.02, 0.03, 6, C.steel).mesh('drain-plug'), 'drain-plug-visual');
    this.drainPlug.position.set(1.78, 0.115, 0.08);
    this.root.add(this.drainPlug);

    this.oilFilter = build()
      .cyl(0.047, 0.047, 0.11, 10, C.oilFilter)
      .cyl(0.03, 0.03, 0.012, 10, C.darkSteel, { p: [0, 0.06, 0] })
      .mesh('oil-filter');
    this.oilFilter.position.set(1.5, 0.165, -0.26);
    this.root.add(this.oilFilter);

    this.fillCap = build().cyl(0.036, 0.036, 0.03, 10, C.oilCap).mesh('fill-cap');
    this.fillCap.position.set(1.72, 0.875, 0.18);
    this.root.add(this.fillCap);

    this.dipstick = build()
      .torus(0.025, 0.007, C.oilCap, { r: [0, Math.PI / 2, 0] }, 4, 10)
      .cyl(0.004, 0.004, 0.5, 4, C.steel, { p: [0, -0.27, 0] })
      .mesh('dipstick');
    this.dipstick.position.set(1.95, 0.885, -0.1);
    this.root.add(this.dipstick);

    const markGeo = build().box(0.006, 0.02, 0.006, C.green).geometry();
    this.torqueMarks = new InstancedMesh(markGeo, glassMat.clone(), 4 * 8);
    (this.torqueMarks.material as MeshLambertMaterial).transparent = false;
    (this.torqueMarks.material as MeshLambertMaterial).color = new Color(C.green);
    this.torqueMarks.count = 0;
    this.root.add(this.torqueMarks);
  }

  private named<T extends Object3D>(o: T, name: string): T {
    o.name = name;
    return o;
  }

  private anchor(name: string, x: number, y: number, z: number, parent: Object3D = this.root): Object3D {
    const a = new Object3D();
    a.name = `anchor:${name}`;
    a.position.set(x, y, z);
    parent.add(a);
    this.anchors.set(name, a);
    return a;
  }

  private buildBody(): void {
    const s = new Shape();
    s.moveTo(-2.25, 0.3);
    s.lineTo(-1.75, 0.3);
    s.absarc(-1.35, 0.33, 0.4, Math.PI, 0, true);
    s.lineTo(0.95, 0.3);
    s.absarc(1.35, 0.33, 0.4, Math.PI, 0, true);
    s.lineTo(2.2, 0.3);
    s.lineTo(2.3, 0.45);
    s.lineTo(2.3, 0.63);
    s.lineTo(2.2, 0.72);
    s.lineTo(1.32, 0.72);
    s.lineTo(1.25, 0.98);
    s.lineTo(-1.32, 1.0);
    s.lineTo(-1.4, 0.97);
    s.lineTo(-2.18, 0.95);
    s.lineTo(-2.28, 0.8);
    s.lineTo(-2.3, 0.5);
    s.lineTo(-2.25, 0.3);

    const body = build()
      .extrude(s, 1.66, C.carBody, {}, 0.03)
      // fenders forming the engine bay walls
      .box(0.9, 0.13, 0.1, C.carBody, { p: [1.76, 0.785, 0.79] })
      .box(0.9, 0.13, 0.1, C.carBody, { p: [1.76, 0.785, -0.79] })
      // roof and pillars
      .box(1.24, 0.05, 1.5, C.carBody, { p: [-0.2, 1.405, 0] })
      .box(0.07, 0.4, 0.05, C.carBody, { p: [-0.15, 1.2, 0.76] })
      .box(0.07, 0.4, 0.05, C.carBody, { p: [-0.15, 1.2, -0.76] })
      // bumpers, grille, lights
      .box(0.08, 0.2, 1.66, C.black, { p: [2.29, 0.45, 0] })
      .box(0.08, 0.2, 1.66, C.black, { p: [-2.29, 0.45, 0] })
      .box(0.04, 0.1, 0.8, C.black, { p: [2.3, 0.63, 0] })
      .box(0.05, 0.07, 0.32, C.headlight, { p: [2.27, 0.68, 0.58] })
      .box(0.05, 0.07, 0.32, C.headlight, { p: [2.27, 0.68, -0.58] })
      .box(0.05, 0.08, 0.34, C.taillight, { p: [-2.29, 0.84, 0.58] })
      .box(0.05, 0.08, 0.34, C.taillight, { p: [-2.29, 0.84, -0.58] })
      // mirrors and door seams
      .box(0.12, 0.08, 0.12, C.carBodyDark, { p: [1.05, 1.03, 0.9] })
      .box(0.12, 0.08, 0.12, C.carBodyDark, { p: [1.05, 1.03, -0.9] })
      .box(0.01, 0.6, 0.01, C.carBodyDark, { p: [-0.15, 0.7, 0.865] })
      .box(0.01, 0.6, 0.01, C.carBodyDark, { p: [-0.15, 0.7, -0.865] })
      .box(0.01, 0.6, 0.01, C.carBodyDark, { p: [1.0, 0.7, 0.865] })
      .box(0.01, 0.6, 0.01, C.carBodyDark, { p: [1.0, 0.7, -0.865] })
      // lift point triangles on the rocker panels
      .cyl(0.04, 0.0, 0.05, 3, C.safetyYellow, { p: [1.02, 0.31, 0.83] })
      .cyl(0.04, 0.0, 0.05, 3, C.safetyYellow, { p: [1.02, 0.31, -0.83] })
      .cyl(0.04, 0.0, 0.05, 3, C.safetyYellow, { p: [-1.12, 0.31, 0.83] })
      .cyl(0.04, 0.0, 0.05, 3, C.safetyYellow, { p: [-1.12, 0.31, -0.83] })
      // tire placard sticker on the driver-side B-pillar
      .box(0.1, 0.07, 0.004, C.white, { p: [-0.15, 0.86, -0.868] })
      .mesh('body');
    this.root.add(body);

    const gh = new Shape();
    gh.moveTo(-1.3, 0.98);
    gh.lineTo(1.22, 0.98);
    gh.lineTo(0.4, 1.4);
    gh.lineTo(-0.8, 1.4);
    gh.lineTo(-1.3, 0.98);
    const glass = new Mesh(build().extrude(gh, 1.52, C.glass).geometry(), glassMat);
    glass.name = 'glass';
    glass.renderOrder = 2;
    this.root.add(glass);

    // Hood hinged at the cowl.
    this.hoodPivot.position.set(1.27, 0.97, 0);
    const hood = build()
      .box(0.96, 0.035, 1.6, C.carBody, { p: [0.47, -0.06, 0], r: [0, 0, -0.14] })
      .mesh('hood');
    this.hoodPivot.add(hood);
    this.root.add(this.hoodPivot);
    this.anchor('hood-latch', 2.2, 0.8, 0);
    this.anchor('placard', -0.15, 0.86, -0.88);
  }

  private buildEngineBay(): void {
    const bay = build()
      .box(0.5, 0.12, 0.72, C.engine, { p: [1.72, 0.76, 0] })
      .box(0.42, 0.05, 0.6, C.darkSteel, { p: [1.72, 0.845, 0] })
      .box(0.24, 0.16, 0.17, C.black, { p: [1.97, 0.79, -0.52] })
      .cyl(0.015, 0.015, 0.03, 6, C.safetyRed, { p: [1.92, 0.885, -0.47] })
      .cyl(0.015, 0.015, 0.03, 6, C.black, { p: [2.03, 0.885, -0.47] })
      .box(0.14, 0.14, 0.12, C.white, { p: [2.02, 0.79, 0.52] })
      .cyl(0.025, 0.025, 0.02, 8, C.black, { p: [2.02, 0.87, 0.52] })
      .box(0.26, 0.13, 0.28, C.black, { p: [1.45, 0.78, 0.5] })
      .box(0.1, 0.1, 0.1, C.white, { p: [1.42, 0.8, -0.55] })
      .cyl(0.02, 0.02, 0.02, 8, C.safetyYellow, { p: [1.42, 0.86, -0.55] })
      .mesh('engine-bay');
    this.root.add(bay);
    this.anchor('fill-cap', 1.72, 0.88, 0.18);
    this.anchor('dipstick', 1.95, 0.9, -0.1);
  }

  private buildUnderside(): void {
    const under = build()
      .box(4.2, 0.08, 1.5, C.darkSteel, { p: [0, 0.27, 0] })
      .box(0.42, 0.08, 0.44, C.darkSteel, { p: [1.65, 0.17, 0] })
      .cyl(0.03, 0.03, 3.6, 6, C.steel, { p: [-0.45, 0.19, 0.35], r: [0, 0, Math.PI / 2] })
      .box(0.5, 0.13, 0.3, C.steel, { p: [-1.6, 0.19, 0.35] })
      .box(0.25, 0.06, 0.6, C.black, { p: [1.3, 0.21, 0] })
      .mesh('underside');
    this.root.add(under);
    this.anchor('drain-plug', 1.78, 0.11, 0.08);
    this.anchor('filter', 1.5, 0.15, -0.26);
    for (const pos of WHEELS) {
      const p = this.liftPoints[pos];
      this.anchor(`lift-point-${pos}`, p.x, p.y, p.z);
    }
  }

  private buildInterior(): void {
    const inside = build()
      .box(0.35, 0.18, 1.4, C.black, { p: [1.0, 0.93, 0] })
      .torus(0.17, 0.02, C.black, { p: [0.78, 1.02, -0.38], r: [0, Math.PI / 2, 0.35] }, 4, 14)
      .box(0.5, 0.5, 0.5, C.darkSteel, { p: [0.2, 0.75, -0.38] })
      .box(0.5, 0.5, 0.5, C.darkSteel, { p: [0.2, 0.75, 0.38] })
      .box(0.5, 0.45, 1.3, C.darkSteel, { p: [-0.9, 0.75, 0] })
      .cyl(0.02, 0.02, 0.02, 8, C.safetyRed, { p: [0.92, 1.03, -0.12], r: [0, 0, Math.PI / 2] })
      .mesh('interior');
    this.root.add(inside);
    this.anchor('start-button', 0.92, 1.03, -0.12);
  }

  private wheelCenter(pos: WheelPos): Vector3 {
    const x = pos.startsWith('F') ? 1.35 : -1.35;
    const z = pos.endsWith('R') ? 0.76 : -0.76;
    return new Vector3(x, WHEEL_R, z);
  }

  private buildWheel(pos: WheelPos): void {
    const side: 1 | -1 = pos.endsWith('R') ? 1 : -1;
    const hub = new Group();
    hub.name = `hub:${pos}`;
    hub.position.copy(this.wheelCenter(pos));
    this.root.add(hub);

    // Brake rotor, caliper and hub flange stay on the car when the wheel comes off.
    const brakes = build()
      .cyl(0.155, 0.155, 0.025, 14, C.steel, { p: [0, 0, side * 0.0], r: [Math.PI / 2, 0, 0] })
      .cyl(0.075, 0.075, 0.05, 10, C.darkSteel, { p: [0, 0, side * 0.03], r: [Math.PI / 2, 0, 0] })
      .box(0.1, 0.12, 0.07, C.safetyRed, { p: [-0.12, 0.06, -side * 0.005] });
    for (let i = 0; i < this.spec.tires.lugsPerWheel; i++) {
      const a = (i / this.spec.tires.lugsPerWheel) * Math.PI * 2;
      brakes.cyl(0.006, 0.006, 0.05, 5, C.chrome, {
        p: [Math.cos(a) * LUG_RADIUS, Math.sin(a) * LUG_RADIUS, side * 0.07],
        r: [Math.PI / 2, 0, 0],
      });
    }
    hub.add(brakes.mesh(`brakes:${pos}`));

    // Lug nuts belong to the hub (they go on whichever wheel is mounted).
    const lugs = build();
    const lugAnchors: Object3D[] = [];
    for (let i = 0; i < this.spec.tires.lugsPerWheel; i++) {
      const a = (i / this.spec.tires.lugsPerWheel) * Math.PI * 2;
      const lx = Math.cos(a) * LUG_RADIUS;
      const ly = Math.sin(a) * LUG_RADIUS;
      lugs.cyl(0.013, 0.013, 0.026, 6, C.chrome, { p: [lx, ly, side * 0.125], r: [Math.PI / 2, 0, 0] });
      const la = new Object3D();
      la.position.set(lx, ly, side * 0.14);
      la.name = `anchor:lug-${pos}-${i}`;
      hub.add(la);
      lugAnchors.push(la);
      this.anchors.set(`lug-${pos}-${i}`, la);
    }
    const lugMesh = lugs.mesh(`lugs:${pos}`);
    hub.add(lugMesh);

    this.wheels[pos] = { pos, hub, side, mounted: pos, lugs: lugMesh, lugAnchors };

    const wheel = new Group();
    wheel.name = `wheel:${pos}`;
    const tire = build()
      .cyl(WHEEL_R, WHEEL_R, TIRE_W, 18, C.rubber, { r: [Math.PI / 2, 0, 0] })
      .cyl(0.215, 0.215, TIRE_W + 0.008, 14, C.chrome, { r: [Math.PI / 2, 0, 0] })
      .cyl(0.17, 0.17, TIRE_W + 0.012, 5, C.steel, { r: [Math.PI / 2, 0, 0] })
      .cyl(0.045, 0.045, TIRE_W + 0.02, 8, C.darkSteel, { r: [Math.PI / 2, 0, 0] })
      // valve stems on both faces so the wheel looks right on either side after rotation
      .cyl(0.006, 0.006, 0.03, 4, C.black, { p: [0.2, -0.04, 0.115], r: [Math.PI / 2, 0, 0] })
      .cyl(0.006, 0.006, 0.03, 4, C.black, { p: [0.2, -0.04, -0.115], r: [Math.PI / 2, 0, 0] })
      .mesh(`tire:${pos}`);
    wheel.add(tire);
    hub.add(wheel);
    this.wheelParts[pos] = { origin: pos, group: wheel };

    this.anchor(`valve-${pos}`, 0.2, -0.04, side * 0.13, hub);
    this.anchor(`tread-${pos}`, 0, WHEEL_R, 0, hub).position.set(0.12, 0.29, side * 0.05);
    this.anchor(`lugs-${pos}`, 0, 0, side * 0.14, hub);
    this.anchor(`hub-${pos}`, 0, 0, side * 0.1, hub);
  }

  /** Registers every vehicle target with the interaction registry. */
  registerTargets(reg: Registry): void {
    const t = (id: string, label: string, anchorName: string, col: Mesh) => {
      const a = this.anchors.get(anchorName);
      if (!a) throw new Error(`Missing anchor ${anchorName}`);
      reg.addTarget(id, label, a, col);
    };
    t('hood-latch', 'Hood latch', 'hood-latch', boxCollider(0.2, 0.15, 0.9));
    t('fill-cap', 'Oil fill cap', 'fill-cap', sphereCollider(0.06));
    t('fill-neck', 'Oil fill opening', 'fill-cap', sphereCollider(0.08));
    t('dipstick', 'Engine oil dipstick', 'dipstick', sphereCollider(0.06));
    t('drain-plug', 'Oil drain plug', 'drain-plug', sphereCollider(0.07));
    t('filter', 'Oil filter', 'filter', sphereCollider(0.09));
    t('filter-mount', 'Oil filter mount', 'filter', sphereCollider(0.1));
    t('start-button', 'Engine start button', 'start-button', sphereCollider(0.08));
    t('placard', 'Tire pressure placard', 'placard', boxCollider(0.16, 0.12, 0.04));
    for (const pos of WHEELS) {
      const name = WHEEL_NAMES[pos];
      t(`valve-${pos}`, `Valve stem, ${name}`, `valve-${pos}`, sphereCollider(0.05));
      t(`tread-${pos}`, `Tread, ${name} tire`, `tread-${pos}`, boxCollider(0.14, 0.12, 0.24));
      t(`lugs-${pos}`, `Lug nuts, ${name}`, `lugs-${pos}`, sphereCollider(0.12));
      t(`hub-${pos}`, `Wheel hub, ${name}`, `hub-${pos}`, sphereCollider(0.2));
      for (let i = 0; i < this.spec.tires.lugsPerWheel; i++) {
        t(`lug-${pos}-${i}`, `Lug nut ${i + 1}, ${name}`, `lug-${pos}-${i}`, sphereCollider(0.022));
      }
    }
  }

  // --- state changes used by lesson effects ---

  setHoodOpen(open: boolean, t = 1): void {
    this.hoodPivot.rotation.z = open ? 1.05 * t : 0;
  }

  setLugsVisible(pos: WheelPos, visible: boolean): void {
    this.wheels[pos].lugs.visible = visible;
  }

  /** Detaches the wheel on a hub and returns it (it becomes a loose item). */
  removeWheel(hubPos: WheelPos): WheelPart | null {
    const assembly = this.wheels[hubPos];
    if (!assembly.mounted) return null;
    const part = this.wheelParts[assembly.mounted];
    assembly.mounted = null;
    assembly.lugs.visible = false;
    return part;
  }

  mountWheel(hubPos: WheelPos, origin: WheelPos): void {
    const assembly = this.wheels[hubPos];
    const part = this.wheelParts[origin];
    assembly.hub.add(part.group);
    part.group.position.set(0, 0, 0);
    part.group.quaternion.identity();
    part.group.scale.setScalar(1);
    assembly.mounted = origin;
  }

  /** Puts a torque mark on a lug (lugIndex) of a hub. */
  markLug(hubPos: WheelPos, lugIndex: number): void {
    const a = this.wheels[hubPos].lugAnchors[lugIndex];
    if (!a) return;
    const world = a.getWorldPosition(new Vector3());
    const local = this.root.worldToLocal(world);
    const m = new Matrix4().compose(local.add(new Vector3(0, 0.014, 0)), new Quaternion(), new Vector3(1, 1, 1));
    this.torqueMarks.setMatrixAt(this.torqueMarks.count, m);
    this.torqueMarks.count++;
    this.torqueMarks.instanceMatrix.needsUpdate = true;
  }

  clearTorqueMarks(): void {
    this.torqueMarks.count = 0;
  }

  /** Puts every wheel back on its own hub with lugs on, hood closed. */
  reset(): void {
    for (const pos of WHEELS) {
      this.mountWheel(pos, pos);
      this.wheels[pos].lugs.visible = true;
    }
    this.clearTorqueMarks();
    this.setHoodOpen(false);
    this.drainPlug.visible = true;
    this.oilFilter.visible = true;
    this.fillCap.visible = true;
    this.fillCap.position.set(1.72, 0.875, 0.18);
    this.dipstick.position.set(1.95, 0.885, -0.1);
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
  }

  static wheelRadius = WHEEL_R;
}
