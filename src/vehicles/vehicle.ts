import {
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { boxCollider, type Registry, sphereCollider } from '../interaction/registry';
import type { TargetId, VehicleId } from '../lessons/engine/types';
import { build } from '../world/lowpoly';
import { C } from '../world/palette';
import { type BodyContext, buildPickupBody, buildSedanBody } from './bodies';
import { LAYOUTS, type V3, type VehicleLayout } from './layout';
import { type VehicleSpec, WHEEL_NAMES, WHEELS, type WheelPos } from './specs';

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

/** Front brake parts that a lesson moves around. */
export interface FrontBrake {
  caliper: Group;
  /** Where the caliper sits when bolted on (hub-local). */
  caliperHome: Vector3;
  /** Where it hangs from the S-hook (hub-local). */
  caliperHung: Vector3;
  pads: Mesh[];
}

const glassMat = new MeshLambertMaterial({ color: C.glass, transparent: true, opacity: 0.55 });
const FRONT = ['FL', 'FR'] as const;

const v3 = (a: V3) => new Vector3(a[0], a[1], a[2]);

export interface VehicleOptions {
  /** Body paint, for the donor car in the jump-start lesson. */
  paint?: number;
  trim?: number;
}

/**
 * A serviceable vehicle: a root that rides on the lift, a hinged hood,
 * removable wheels, front brakes, a removable battery and named anchors for
 * every part a lesson can target. The body shape and every anchor position
 * come from the vehicle's layout.
 */
export class Vehicle {
  readonly root = new Group();
  readonly spec: VehicleSpec;
  readonly layout: VehicleLayout;
  readonly hoodPivot = new Group();
  readonly wheels = {} as Record<WheelPos, WheelAssembly>;
  readonly wheelParts = {} as Record<WheelPos, WheelPart>;
  readonly brakes = {} as Record<'FL' | 'FR', FrontBrake>;
  readonly anchors = new Map<string, Object3D>();
  /** Solid meshes that stop pointer rays. */
  readonly occluders: Mesh[] = [];
  /** Small green torque marks painted on lugs once torqued. */
  readonly torqueMarks: InstancedMesh;
  /** Visual pieces that lessons show, hide or move. */
  readonly drainPlug: Mesh;
  readonly oilFilter: Mesh;
  readonly fillCap: Mesh;
  readonly dipstick: Mesh;
  readonly battery: Group;
  readonly batteryHome: Vector3;
  readonly corrosion: Mesh;
  readonly cableEnds: { pos: Mesh; neg: Mesh };
  readonly lamps: Mesh[] = [];
  readonly fillCapHome: Vector3;
  readonly dipstickHome: Vector3;
  readonly liftPoints: Record<WheelPos, Vector3>;
  /** Target ids this vehicle registered, so they can be removed on a swap. */
  private targetIds: TargetId[] = [];

  constructor(spec: VehicleSpec, options: VehicleOptions = {}) {
    this.spec = spec;
    const layout = LAYOUTS[spec.id as Exclude<VehicleId, 'ev'>];
    if (!layout) throw new Error(`No body for ${spec.name} yet`);
    this.layout = layout;
    this.root.name = `vehicle:${spec.id}`;
    this.liftPoints = {
      FL: v3(layout.liftPoints.FL),
      FR: v3(layout.liftPoints.FR),
      RL: v3(layout.liftPoints.RL),
      RR: v3(layout.liftPoints.RR),
    };

    const ctx: BodyContext = {
      root: this.root,
      hoodPivot: this.hoodPivot,
      layout,
      paint: options.paint ?? C.carBody,
      trim: options.trim ?? C.carBodyDark,
      glass: glassMat,
      add: (mesh, solid = true) => {
        this.root.add(mesh);
        if (solid) this.occluders.push(mesh);
        return mesh;
      },
    };
    if (spec.id === 'pickup') buildPickupBody(ctx);
    else buildSedanBody(ctx);
    this.buildHood(ctx.paint);
    this.buildEngineBay();
    this.buildUnderside();
    for (const pos of WHEELS) this.buildWheel(pos);
    for (const pos of FRONT) this.buildFrontBrake(pos);
    this.buildLamps();

    const at = layout.at;
    this.drainPlug = build().cyl(0.02, 0.02, 0.03, 6, C.steel).mesh('drain-plug-visual');
    this.drainPlug.position.copy(v3(at.drainPlug));
    this.root.add(this.drainPlug);

    this.oilFilter = build()
      .cyl(0.047, 0.047, 0.11, 10, C.oilFilter)
      .cyl(0.03, 0.03, 0.012, 10, C.darkSteel, { p: [0, 0.06, 0] })
      .mesh('oil-filter');
    this.oilFilter.position.copy(v3(at.filter));
    this.root.add(this.oilFilter);

    this.fillCapHome = v3(at.fillCap);
    this.fillCap = build().cyl(0.036, 0.036, 0.03, 10, C.oilCap).mesh('fill-cap');
    this.fillCap.position.copy(this.fillCapHome);
    this.root.add(this.fillCap);

    this.dipstickHome = v3(at.dipstick);
    this.dipstick = build()
      .torus(0.025, 0.007, C.oilCap, { r: [0, Math.PI / 2, 0] }, 4, 10)
      .cyl(0.004, 0.004, 0.5, 4, C.steel, { p: [0, -0.27, 0] })
      .mesh('dipstick');
    this.dipstick.position.copy(this.dipstickHome);
    this.root.add(this.dipstick);

    // Battery: one group so it can come out of the car as a whole.
    const [bw, bh, bd] = at.batterySize;
    this.batteryHome = v3(at.battery);
    this.battery = new Group();
    this.battery.name = 'battery';
    this.battery.add(
      build()
        .box(bw, bh, bd, C.black)
        .box(bw * 0.98, 0.012, bd * 0.98, 0x3a3f44, { p: [0, bh / 2, 0] })
        .cyl(0.015, 0.015, 0.03, 6, C.safetyRed, { p: [-bw * 0.2, bh / 2 + 0.015, bd * 0.3] })
        .cyl(0.015, 0.015, 0.03, 6, C.darkSteel, { p: [bw * 0.25, bh / 2 + 0.015, bd * 0.3] })
        .box(0.05, 0.02, 0.04, C.white, { p: [0, bh / 2 + 0.008, -bd * 0.2] })
        .mesh('battery-case'),
    );
    this.battery.position.copy(this.batteryHome);
    this.root.add(this.battery);

    // Cable ends sit on the posts; they swing aside when disconnected.
    const posPost = this.postPosition('pos');
    const negPost = this.postPosition('neg');
    this.cableEnds = {
      pos: build().box(0.04, 0.03, 0.05, C.safetyRed).mesh('cable-pos'),
      neg: build().box(0.04, 0.03, 0.05, C.black).mesh('cable-neg'),
    };
    this.cableEnds.pos.position.copy(posPost);
    this.cableEnds.neg.position.copy(negPost);
    this.root.add(this.cableEnds.pos, this.cableEnds.neg);

    this.corrosion = build()
      .box(0.05, 0.025, 0.05, 0xd7e8c8, { p: [posPost.x, posPost.y + 0.012, posPost.z] })
      .box(0.035, 0.02, 0.035, 0x9fd3b0, { p: [posPost.x + 0.012, posPost.y + 0.025, posPost.z + 0.01] })
      .mesh('corrosion');
    this.corrosion.visible = false;
    this.root.add(this.corrosion);

    this.buildAnchors();

    const markGeo = build().box(0.006, 0.02, 0.006, C.green).geometry();
    this.torqueMarks = new InstancedMesh(markGeo, new MeshLambertMaterial({ color: new Color(C.green) }), 4 * 8);
    this.torqueMarks.count = 0;
    this.root.add(this.torqueMarks);
  }

  /** Battery post top, vehicle-local. */
  postPosition(which: 'pos' | 'neg'): Vector3 {
    const [bw, bh, bd] = this.layout.at.batterySize;
    const b = this.layout.at.battery;
    const x = which === 'pos' ? -bw * 0.2 : bw * 0.25;
    return new Vector3(b[0] + x, b[1] + bh / 2 + 0.035, b[2] + bd * 0.3);
  }

  private anchor(name: string, p: V3 | Vector3, parent: Object3D = this.root): Object3D {
    const a = new Object3D();
    a.name = `anchor:${name}`;
    if (p instanceof Vector3) a.position.copy(p);
    else a.position.set(p[0], p[1], p[2]);
    parent.add(a);
    this.anchors.set(name, a);
    return a;
  }

  private buildHood(paint: number): void {
    const h = this.layout.hood;
    this.hoodPivot.position.set(h.pivot[0], h.pivot[1], h.pivot[2]);
    const hood = build()
      .box(h.length, 0.035, h.width, paint, { p: [h.length / 2, -0.03, 0], r: [0, 0, h.slope] })
      .mesh('hood');
    this.hoodPivot.add(hood);
    this.occluders.push(hood);
    this.root.add(this.hoodPivot);
  }

  /** Battery, fluid reservoirs, air box, belt and hose, placed from the layout. */
  private buildEngineBay(): void {
    const at = this.layout.at;
    const b = build()
      // coolant overflow reservoir with its level marks
      .box(0.14, 0.14, 0.12, C.white, { p: at.coolant })
      .box(0.141, 0.006, 0.121, C.black, { p: [at.coolant[0], at.coolant[1] + 0.03, at.coolant[2]] })
      .box(0.141, 0.006, 0.121, C.black, { p: [at.coolant[0], at.coolant[1] - 0.03, at.coolant[2]] })
      .cyl(0.025, 0.025, 0.02, 8, C.black, { p: [at.coolant[0], at.coolant[1] + 0.08, at.coolant[2]] })
      // radiator cap (pressure cap on the radiator neck)
      .cyl(0.03, 0.03, 0.025, 10, C.chrome, { p: at.radiatorCap })
      .cyl(0.02, 0.02, 0.05, 8, C.darkSteel, {
        p: [at.radiatorCap[0], at.radiatorCap[1] - 0.04, at.radiatorCap[2]],
      })
      // washer fluid filler (blue cap)
      .cyl(0.024, 0.024, 0.02, 8, 0x2f6fd6, { p: at.washer })
      .cyl(0.016, 0.016, 0.08, 6, C.black, { p: [at.washer[0], at.washer[1] - 0.05, at.washer[2]] })
      // brake fluid reservoir (yellow cap)
      .box(0.1, 0.1, 0.1, C.white, { p: at.brakeFluid })
      .cyl(0.02, 0.02, 0.02, 8, C.safetyYellow, {
        p: [at.brakeFluid[0], at.brakeFluid[1] + 0.06, at.brakeFluid[2]],
      })
      // air filter box
      .box(0.26, 0.13, 0.28, C.black, { p: at.airFilter })
      .box(0.2, 0.012, 0.02, C.chrome, { p: [at.airFilter[0], at.airFilter[1] + 0.07, at.airFilter[2] - 0.12] })
      // serpentine belt around two pulleys
      .torus(0.05, 0.008, C.black, { p: [at.belt[0] - 0.06, at.belt[1], at.belt[2]] }, 4, 12)
      .torus(0.035, 0.008, C.black, { p: [at.belt[0] + 0.07, at.belt[1] + 0.03, at.belt[2]] }, 4, 12)
      .box(0.13, 0.012, 0.012, C.black, { p: [at.belt[0], at.belt[1] + 0.045, at.belt[2]], r: [0, 0, 0.2] })
      .box(0.13, 0.012, 0.012, C.black, { p: [at.belt[0], at.belt[1] - 0.035, at.belt[2]], r: [0, 0, 0.2] })
      // upper radiator hose
      .cyl(0.022, 0.022, 0.24, 8, C.black, { p: at.upperHose, r: [0, 0, Math.PI / 2] })
      // bare-metal engine lifting eye: the jump-start ground point
      .box(0.05, 0.05, 0.012, C.chrome, { p: at.engineGround })
      // wiper arms on the cowl
      .box(0.03, 0.015, 0.55, C.black, { p: at.wipers, r: [0, 0.25, 0] })
      .box(0.03, 0.015, 0.55, C.black, { p: [at.wipers[0], at.wipers[1], -at.wipers[2]], r: [0, 0.25, 0] });
    this.root.add(b.mesh('engine-bay'));
  }

  private buildUnderside(): void {
    const at = this.layout.at;
    const pan = build()
      .box(0.42, 0.08, 0.44, C.darkSteel, { p: [at.oilPan[0], at.oilPan[1] + 0.04, at.oilPan[2] + 0.05] })
      .mesh('oil-pan');
    this.root.add(pan);
    this.occluders.push(pan);
  }

  private wheelCenter(pos: WheelPos): Vector3 {
    const L = this.layout;
    const x = pos.startsWith('F') ? L.wheelX.front : L.wheelX.rear;
    const z = pos.endsWith('R') ? L.trackZ : -L.trackZ;
    return new Vector3(x, L.wheelR, z);
  }

  private rotorR(): number {
    return this.layout.rimR * 0.72;
  }

  private buildWheel(pos: WheelPos): void {
    const L = this.layout;
    const side: 1 | -1 = pos.endsWith('R') ? 1 : -1;
    const lugsN = this.spec.tires.lugsPerWheel;
    const hub = new Group();
    hub.name = `hub:${pos}`;
    hub.position.copy(this.wheelCenter(pos));
    this.root.add(hub);

    // Rotor, hub flange, caliper bracket and wheel studs stay on the car when the wheel comes off.
    const r = this.rotorR();
    const brakes = build()
      .cyl(r, r, 0.025, 14, C.steel, { r: [Math.PI / 2, 0, 0] })
      .cyl(0.075, 0.075, 0.05, 10, C.darkSteel, { p: [0, 0, side * 0.03], r: [Math.PI / 2, 0, 0] })
      .box(0.05, 0.16, 0.05, C.darkSteel, { p: [-r * 0.82 - 0.03, r * 0.36, -side * 0.02], r: [0, 0, -0.4] });
    for (let i = 0; i < lugsN; i++) {
      const a = (i / lugsN) * Math.PI * 2;
      brakes.cyl(0.006, 0.006, 0.05, 5, C.chrome, {
        p: [Math.cos(a) * L.lugRadius, Math.sin(a) * L.lugRadius, side * 0.07],
        r: [Math.PI / 2, 0, 0],
      });
    }
    // Coil spring and strut above the hub, with the caliper S-hook hanging from it.
    if (pos.startsWith('F')) {
      brakes
        .cyl(0.07, 0.07, 0.22, 8, C.safetyRed, { p: [0.02, L.wheelR * 1.05, -side * 0.12] })
        .cyl(0.025, 0.025, 0.3, 6, C.darkSteel, { p: [0.02, L.wheelR * 0.7, -side * 0.12] })
        .torus(0.02, 0.004, C.chrome, { p: [0.09, L.wheelR * 0.82, -side * 0.08], r: [Math.PI / 2, 0, 0] }, 4, 8)
        .box(0.006, 0.07, 0.006, C.chrome, { p: [0.09, L.wheelR * 0.76, -side * 0.08] });
    }
    const brakeMesh = brakes.mesh(`brakes:${pos}`);
    hub.add(brakeMesh);
    this.occluders.push(brakeMesh);

    // Lug nuts belong to the hub (they go on whichever wheel is mounted).
    const lugs = build();
    const lugAnchors: Object3D[] = [];
    const face = L.tireW / 2;
    for (let i = 0; i < lugsN; i++) {
      const a = (i / lugsN) * Math.PI * 2;
      const lx = Math.cos(a) * L.lugRadius;
      const ly = Math.sin(a) * L.lugRadius;
      lugs.cyl(0.013, 0.013, 0.026, 6, C.chrome, { p: [lx, ly, side * (face + 0.018)], r: [Math.PI / 2, 0, 0] });
      const la = new Object3D();
      la.position.set(lx, ly, side * (face + 0.033));
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
    const R = L.wheelR;
    const W = L.tireW;
    const tire = build()
      .cyl(R, R, W, 18, C.rubber, { r: [Math.PI / 2, 0, 0] })
      .cyl(L.rimR, L.rimR, W + 0.008, 14, C.chrome, { r: [Math.PI / 2, 0, 0] })
      .cyl(L.rimR * 0.8, L.rimR * 0.8, W + 0.012, lugsN, C.steel, { r: [Math.PI / 2, 0, 0] })
      .cyl(0.045, 0.045, W + 0.02, 8, C.darkSteel, { r: [Math.PI / 2, 0, 0] })
      // valve stems on both faces so the wheel looks right on either side after rotation
      .cyl(0.006, 0.006, 0.03, 4, C.black, { p: [L.rimR * 0.93, -0.04, face + 0.008], r: [Math.PI / 2, 0, 0] })
      .cyl(0.006, 0.006, 0.03, 4, C.black, { p: [L.rimR * 0.93, -0.04, -face - 0.008], r: [Math.PI / 2, 0, 0] })
      .mesh(`tire:${pos}`);
    wheel.add(tire);
    hub.add(wheel);
    this.occluders.push(tire);
    this.wheelParts[pos] = { origin: pos, group: wheel };

    this.anchor(`valve-${pos}`, [L.rimR * 0.93, -0.04, side * (face + 0.02)], hub);
    this.anchor(`tread-${pos}`, [0.12, R - 0.04, side * 0.05], hub);
    this.anchor(`lugs-${pos}`, [0, 0, side * (face + 0.033)], hub);
    this.anchor(`hub-${pos}`, [0, 0, side * (face - 0.008)], hub);
  }

  private buildFrontBrake(pos: 'FL' | 'FR'): void {
    const hub = this.wheels[pos].hub;
    const side = this.wheels[pos].side;
    const L = this.layout;
    const r = this.rotorR();
    const caliperHome = new Vector3(-r * 0.82, r * 0.36, 0);
    const caliperHung = new Vector3(0.09, L.wheelR * 0.62, -side * 0.08);
    const caliper = new Group();
    caliper.name = `caliper:${pos}`;
    caliper.position.copy(caliperHome);
    caliper.rotation.z = -0.4;
    caliper.add(
      build()
        .box(0.075, 0.13, 0.03, C.safetyRed, { p: [0, 0, side * 0.032] })
        .box(0.075, 0.13, 0.03, C.safetyRed, { p: [0, 0, -side * 0.034] })
        .box(0.04, 0.13, 0.1, C.safetyRed, { p: [-0.035, 0, -side * 0.0] })
        .cyl(0.022, 0.022, 0.012, 8, C.chrome, { p: [0, 0, -side * 0.018], r: [Math.PI / 2, 0, 0] })
        .mesh(`caliper-body:${pos}`),
    );
    hub.add(caliper);

    // Pads stay in the bracket when the caliper comes off.
    const pads: Mesh[] = [];
    for (const z of [side * 0.022, -side * 0.022]) {
      const pad = build()
        .box(0.05, 0.11, 0.008, C.darkSteel, { p: [0, 0, z + Math.sign(z) * 0.006] })
        .box(0.046, 0.1, 0.006, 0x6b5a4a, { p: [0, 0, z] })
        .mesh(`pad:${pos}`);
      pad.position.copy(caliperHome);
      pad.rotation.z = -0.4;
      hub.add(pad);
      pads.push(pad);
    }

    // The hose runs from the caliper up into the wheel well.
    const hose = build()
      .cyl(0.008, 0.008, 0.2, 5, C.black, { p: [0, 0.1, 0], r: [0, 0, 0.3] })
      .mesh(`brake-hose:${pos}`);
    hose.position.set(caliperHome.x - 0.02, caliperHome.y + 0.05, -side * 0.04);
    hub.add(hose);

    this.brakes[pos] = { caliper, caliperHome, caliperHung, pads };

    this.anchor(`pad-outer-${pos}`, [caliperHome.x + 0.015, caliperHome.y - 0.02, side * 0.035], hub);
    this.anchor(`pad-inner-${pos}`, [caliperHome.x + 0.03, caliperHome.y + 0.04, -side * 0.012], hub);
    this.anchor(`rotor-${pos}`, [r * 0.45, -r * 0.45, side * 0.015], hub);
    this.anchor(`caliper-bolts-${pos}`, [caliperHome.x - 0.055, caliperHome.y + 0.02, side * 0.03], hub);
    this.anchor(`caliper-bracket-${pos}`, [caliperHome.x, caliperHome.y, side * 0.02], hub);
    this.anchor(`pad-clips-${pos}`, [caliperHome.x + 0.03, caliperHome.y + 0.075, side * 0.02], hub);
    this.anchor(`caliper-hook-${pos}`, [0.09, L.wheelR * 0.76, -side * 0.06], hub);
    this.anchor(`brake-hose-${pos}`, [caliperHome.x + 0.01, caliperHome.y + 0.13, -side * 0.01], hub);
    this.anchor(`caliper-piston-${pos}`, [0, 0, side * 0.06], caliper);
  }

  private buildLamps(): void {
    const at = this.layout.at;
    const on = new MeshBasicMaterial({ color: 0xfffbe0 });
    const brake = new MeshBasicMaterial({ color: 0xff3b2b });
    const defs: [string, typeof at.headlights, number, MeshBasicMaterial][] = [
      ['lamp-HL', at.headlights, -1, on],
      ['lamp-HR', at.headlights, 1, on],
      ['lamp-TL', at.taillights, -1, brake],
      ['lamp-TR', at.taillights, 1, brake],
    ];
    for (const [name, l, side, mat] of defs) {
      const [w, h, d] = l.size;
      const m = new Mesh(build().box(w, h, d, C.white).geometry(), mat);
      m.name = name;
      m.position.set(l.x + Math.sign(l.x) * 0.006, l.y, side * l.z);
      m.visible = false;
      this.root.add(m);
      this.lamps.push(m);
    }
  }

  private buildAnchors(): void {
    const L = this.layout;
    const at = L.at;
    this.anchor('hood-latch', at.hoodLatch);
    this.anchor('placard', at.placard);
    this.anchor('fill-cap', [at.fillCap[0], at.fillCap[1] + 0.005, at.fillCap[2]]);
    this.anchor('dipstick', [at.dipstick[0], at.dipstick[1] + 0.015, at.dipstick[2]]);
    this.anchor('drain-plug', [at.drainPlug[0], at.drainPlug[1] - 0.005, at.drainPlug[2]]);
    this.anchor('filter', [at.filter[0], at.filter[1] - 0.015, at.filter[2]]);
    this.anchor('oil-pan', at.oilPan);
    this.anchor('start-button', at.startButton);
    this.anchor('light-switch', at.lightSwitch);
    this.anchor('driver-seat', at.driverSeat);
    for (const pos of WHEELS) this.anchor(`lift-point-${pos}`, L.liftPoints[pos]);
    this.anchor('jack-point', L.jackPoint);
    this.anchor('stand-point-FL', L.standPoints.FL);
    this.anchor('stand-point-FR', L.standPoints.FR);
    this.anchor('car-shake', [L.front - 0.02, L.wheelR + 0.3, -L.halfWidth + 0.25]);
    // Battery
    const [, bh] = at.batterySize;
    const posPost = this.postPosition('pos');
    const negPost = this.postPosition('neg');
    this.anchor('batt-pos', posPost);
    this.anchor('batt-neg', negPost);
    this.anchor('battery-posts', posPost.clone().add(negPost).multiplyScalar(0.5));
    this.anchor('battery', [at.battery[0], at.battery[1] + bh / 2, at.battery[2]]);
    this.anchor('batt-holddown', [at.battery[0], at.battery[1] + bh / 2 + 0.01, at.battery[2] - 0.05]);
    this.anchor('cable-pos', posPost.clone().add(new Vector3(-0.03, 0.06, 0.08)));
    this.anchor('cable-neg', negPost.clone().add(new Vector3(0.03, 0.06, 0.08)));
    this.anchor('engine-ground', at.engineGround);
    // Inspection points
    this.anchor('coolant-reservoir', at.coolant);
    this.anchor('radiator-cap', [at.radiatorCap[0], at.radiatorCap[1] + 0.02, at.radiatorCap[2]]);
    this.anchor('washer-cap', at.washer);
    this.anchor('brake-reservoir', [at.brakeFluid[0], at.brakeFluid[1] + 0.03, at.brakeFluid[2]]);
    this.anchor('air-filter', [at.airFilter[0], at.airFilter[1] + 0.07, at.airFilter[2]]);
    this.anchor('drive-belt', at.belt);
    this.anchor('upper-hose', at.upperHose);
    this.anchor('wipers', at.wipers);
    this.anchor('leak-check', at.leakCheck);
  }

  /** Registers every vehicle target with the interaction registry. */
  registerTargets(reg: Registry): void {
    const L = this.layout;
    const t = (id: string, label: string, anchorName: string, col: Mesh) => {
      const a = this.anchors.get(anchorName);
      if (!a) throw new Error(`Missing anchor ${anchorName}`);
      reg.addTarget(id, label, a, col);
      this.targetIds.push(id);
    };
    t('hood-latch', 'Hood latch', 'hood-latch', boxCollider(0.2, 0.15, 0.9));
    t('fill-cap', 'Oil fill cap', 'fill-cap', sphereCollider(0.06));
    t('fill-neck', 'Oil fill opening', 'fill-cap', sphereCollider(0.08));
    t('dipstick', 'Engine oil dipstick', 'dipstick', sphereCollider(0.06));
    t('drain-plug', 'Oil drain plug', 'drain-plug', sphereCollider(0.07));
    t('filter', 'Oil filter', 'filter', sphereCollider(0.09));
    t('filter-mount', 'Oil filter mount', 'filter', sphereCollider(0.1));
    t('oil-pan', 'Oil pan', 'oil-pan', boxCollider(0.4, 0.1, 0.4));
    t('start-button', 'Engine start button', 'start-button', sphereCollider(0.08));
    t('light-switch', 'Headlight switch', 'light-switch', sphereCollider(0.07));
    t('driver-seat', "Driver's seat (brake pedal)", 'driver-seat', boxCollider(0.3, 0.25, 0.12));
    t('placard', 'Tire pressure placard', 'placard', boxCollider(0.16, 0.12, 0.04));
    // The jacking point sits deep under the car, so the target is the floor lane in front of the
    // bumper where the jack rolls in. The halo still marks the real point.
    const lane = boxCollider(0.6, 0.2, 0.45);
    lane.position.set(L.front + 0.12 - L.jackPoint[0], 0.1 - L.jackPoint[1], -L.jackPoint[2]);
    t('jack-point', 'Front jacking point (roll the jack in here)', 'jack-point', lane);
    t('stand-point-FL', 'Jack stand point, front left', 'stand-point-FL', boxCollider(0.25, 0.16, 0.25));
    t('stand-point-FR', 'Jack stand point, front right', 'stand-point-FR', boxCollider(0.25, 0.16, 0.25));
    t('car-shake', 'Front corner of the car', 'car-shake', boxCollider(0.25, 0.25, 0.25));
    t('battery-posts', 'Battery posts', 'battery-posts', boxCollider(0.14, 0.06, 0.08));
    t('batt-pos', 'Positive (+) battery terminal', 'batt-pos', sphereCollider(0.035));
    t('batt-neg', 'Negative (−) battery terminal', 'batt-neg', sphereCollider(0.035));
    t('battery', 'Battery', 'battery', boxCollider(0.2, 0.06, 0.12));
    t('batt-tray', 'Battery tray', 'battery', boxCollider(0.26, 0.12, 0.18));
    t('batt-holddown', 'Battery hold-down', 'batt-holddown', sphereCollider(0.04));
    t('cable-pos', 'Positive cable end', 'cable-pos', sphereCollider(0.035));
    t('cable-neg', 'Negative cable end', 'cable-neg', sphereCollider(0.035));
    t('engine-ground', 'Bare metal engine bracket', 'engine-ground', sphereCollider(0.045));
    t('coolant-reservoir', 'Coolant reservoir', 'coolant-reservoir', boxCollider(0.16, 0.18, 0.14));
    t('radiator-cap', 'Radiator pressure cap', 'radiator-cap', sphereCollider(0.05));
    t('washer-cap', 'Washer fluid cap', 'washer-cap', sphereCollider(0.045));
    t('brake-reservoir', 'Brake fluid reservoir', 'brake-reservoir', boxCollider(0.12, 0.12, 0.12));
    t('air-filter', 'Air filter box', 'air-filter', boxCollider(0.28, 0.06, 0.3));
    t('drive-belt', 'Drive belt', 'drive-belt', boxCollider(0.22, 0.14, 0.06));
    t('upper-hose', 'Upper radiator hose', 'upper-hose', boxCollider(0.24, 0.06, 0.06));
    t('wipers', 'Wiper blades', 'wipers', boxCollider(0.1, 0.06, 0.5));
    t('leak-check', 'Floor under the front of the car', 'leak-check', boxCollider(0.5, 0.06, 1.0));
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
    for (const pos of FRONT) {
      const name = WHEEL_NAMES[pos];
      t(`pad-outer-${pos}`, `Outer brake pad, ${name}`, `pad-outer-${pos}`, sphereCollider(0.035));
      t(`pad-inner-${pos}`, `Inner brake pad, ${name}`, `pad-inner-${pos}`, sphereCollider(0.035));
      t(`rotor-${pos}`, `Brake rotor, ${name}`, `rotor-${pos}`, sphereCollider(0.05));
      t(`caliper-bolts-${pos}`, `Caliper bolts, ${name}`, `caliper-bolts-${pos}`, sphereCollider(0.04));
      t(`caliper-bracket-${pos}`, `Caliper bracket, ${name}`, `caliper-bracket-${pos}`, sphereCollider(0.06));
      t(`pad-clips-${pos}`, `Pad slide clips, ${name}`, `pad-clips-${pos}`, sphereCollider(0.03));
      t(`caliper-hook-${pos}`, `Caliper S-hook, ${name}`, `caliper-hook-${pos}`, sphereCollider(0.045));
      t(`brake-hose-${pos}`, `Brake hose, ${name}`, `brake-hose-${pos}`, sphereCollider(0.035));
      t(`caliper-piston-${pos}`, `Caliper piston, ${name}`, `caliper-piston-${pos}`, sphereCollider(0.045));
    }
  }

  /** Removes everything registerTargets added. */
  unregisterTargets(reg: Registry): void {
    for (const id of this.targetIds) reg.removeTarget(id);
    this.targetIds = [];
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
    this.root.updateMatrixWorld(true);
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

  /** Moves a front caliper: 'home' bolted on, 'hung' on the S-hook. */
  setCaliper(pos: 'FL' | 'FR', where: 'home' | 'hung'): void {
    const b = this.brakes[pos];
    b.caliper.position.copy(where === 'home' ? b.caliperHome : b.caliperHung);
    b.caliper.rotation.set(where === 'home' ? 0 : 0.2, 0, where === 'home' ? -0.4 : 1.2);
  }

  setPadsVisible(pos: 'FL' | 'FR', visible: boolean): void {
    for (const p of this.brakes[pos].pads) p.visible = visible;
  }

  /** Lamps for the lights check; `out` names a lamp that stays dark. */
  setLights(on: boolean, out: string | null = null): void {
    for (const l of this.lamps) l.visible = on && l.name !== out;
  }

  /** Swings a cable end off its post (connected=false) or back on. */
  setCable(which: 'pos' | 'neg', connected: boolean): void {
    const end = this.cableEnds[which];
    const post = this.postPosition(which);
    end.position.copy(post);
    if (!connected) end.position.add(new Vector3(which === 'pos' ? -0.03 : 0.03, 0.05, 0.08));
  }

  /** Puts everything back the way the car arrived. */
  reset(): void {
    for (const pos of WHEELS) {
      this.mountWheel(pos, pos);
      this.wheels[pos].lugs.visible = true;
    }
    for (const pos of FRONT) {
      this.setCaliper(pos, 'home');
      this.setPadsVisible(pos, true);
    }
    this.clearTorqueMarks();
    this.setHoodOpen(false);
    this.setLights(false);
    this.setCable('pos', true);
    this.setCable('neg', true);
    this.corrosion.visible = false;
    this.root.add(this.battery);
    this.battery.position.copy(this.batteryHome);
    this.battery.quaternion.identity();
    this.battery.scale.setScalar(1);
    this.battery.visible = true;
    this.drainPlug.visible = true;
    this.oilFilter.visible = true;
    this.fillCap.visible = true;
    this.fillCap.position.copy(this.fillCapHome);
    this.dipstick.position.copy(this.dipstickHome);
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
  }
}
