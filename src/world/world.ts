import {
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PlaneGeometry,
  RingGeometry,
  Scene,
  Vector3,
} from 'three';
import { boxCollider, collider, type Registry, sphereCollider } from '../interaction/registry';
import { OIL_GRADES, oilTarget } from '../lessons/content/oil-change';
import type { VehicleId } from '../lessons/engine/types';
import { CROUCH_EYE, DESKTOP_EYE } from '../locomotion/locomotion';
import { sign } from '../ui/panel';
import { VEHICLES, WHEELS, type WheelPos } from '../vehicles/specs';
import { Vehicle } from '../vehicles/vehicle';
import { Lift } from './lift';
import { build } from './lowpoly';
import { C } from './palette';
import { buildChock, buildClamp, buildJumpPack, Cable, FloorJack, JackStand } from './props';
import { buildItemModel } from './tools';

export interface WorkSpot {
  id: string;
  label: string;
  position: Vector3;
  yaw: number;
  /** Desktop camera pitch when arriving (look up under the car, down at wheels). */
  pitch: number;
  /** Eye height on a flat screen: low work spots crouch (VR players crouch for real). */
  eye: number;
  marker: Mesh;
  enabled: boolean;
}

/** How a lesson wants the bay arranged before it starts. */
export interface StageSetup {
  /** Pull the car forward off the lift so its nose sits at this x (battery work, jump-starts). */
  carNoseX?: number;
  /** Park the donor car nose-to-nose for a jump-start with cables. */
  donor?: boolean;
  /** Put the portable jump pack beside the car. */
  jumpPack?: boolean;
  /** Floor jack, jack stands and wheel chocks for brake work. */
  jack?: boolean;
  hoodOpen?: boolean;
  drainPan?: boolean;
}

/** Tools that live on the cart. A lesson shows up to nine of them. */
export const ALL_ITEMS = [
  'ratchet-10',
  'ratchet-14',
  'ratchet-17',
  'filter-wrench',
  'torque-wrench',
  'impact-wrench',
  'breaker-bar',
  'tire-gauge',
  'tread-gauge',
  'air-chuck',
  'rag',
  'new-filter',
  'new-washer',
  'brake-gauge',
  'micrometer',
  'brake-grease',
  'piston-tool',
  'multimeter',
  'battery-tester',
  'terminal-brush',
  'jumper-cables',
];

const CART_POS = new Vector3(3.0, 0, 2.35);
const CART_YAW = -0.45;
const CART_TOP = 0.93;
const PAN_HOME = new Vector3(0.45, 0, 2.5);
const DONOR_NOSE_X = 0.45;
const BENCH = new Vector3(-4.4, 0.93, -5.5);
/** Spots for work near the floor, where a flat-screen player crouches. */
const LOW_SPOTS = ['left-front', 'right-front', 'left-rear', 'right-rear', 'jack'];

function yawFacing(from: Vector3, to: Vector3): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

type SpotDef = [id: string, label: string, at: [number, number, number], look: [number, number, number]];

/** The service bay: environment, lift, vehicles, tool cart, props and work spots. */
export class World {
  readonly scene = new Scene();
  readonly lift: Lift;
  readonly vehicles = new Map<VehicleId, Vehicle>();
  vehicle: Vehicle;
  /** The second car used as the power source for a cable jump-start. */
  readonly donor: Vehicle;
  readonly spots = new Map<string, WorkSpot>();
  readonly cart = new Group();
  readonly cartSlots: Vector3[] = [];
  readonly drainPan: Group;
  readonly panOil: Mesh;
  readonly oilStream: Mesh;
  readonly puddle: Mesh;
  readonly floor: Mesh;
  readonly ppeGlasses: Object3D;
  readonly ppeGloves: Object3D;
  readonly trayPlug: Object3D;
  readonly trayParts: Object3D;
  readonly oilJugs = new Map<string, Object3D>();
  readonly recycleDrum: Object3D;
  readonly jack = new FloorJack();
  readonly stands = [new JackStand(), new JackStand()];
  readonly chocks = [buildChock(), buildChock()];
  readonly jumpPack: Group;
  readonly coreShelf: Object3D;
  readonly cables = { red: new Cable('red'), black: new Cable('black') };
  readonly clamps = new Map<string, Mesh>();
  /** Where the car body sits along x (0 on the lift). */
  carX = 0;
  /** How far the floor jack has raised the front (0..1). */
  jackRaise = 0;
  private stage: StageSetup = {};

  constructor(readonly registry: Registry) {
    this.scene.background = new Color(0xcfd8df);
    this.addLights();
    this.floor = this.buildRoom();

    this.vehicles.set('sedan', new Vehicle(VEHICLES.sedan));
    // A white work truck, so it never looks like the teal sedan.
    this.vehicles.set('pickup', new Vehicle(VEHICLES.pickup, { paint: 0xe4e8ec, trim: 0x9aa4ad }));
    this.vehicle = this.vehicles.get('sedan') as Vehicle;
    this.donor = new Vehicle(VEHICLES.sedan, { paint: 0xb5652a, trim: 0x8a4a1c });
    this.donor.root.name = 'donor-car';
    this.donor.root.rotation.y = Math.PI;
    this.donor.root.visible = false;
    this.scene.add(this.donor.root);

    this.lift = new Lift(this.vehicle.liftPoints);
    this.scene.add(this.lift.root);
    this.scene.add(this.vehicle.root);
    registry.addOccluder(...this.lift.occluders);

    this.buildCart();
    const ppe = this.buildPpe();
    this.ppeGlasses = ppe.glasses;
    this.ppeGloves = ppe.gloves;
    const tray = this.buildTray();
    this.trayPlug = tray.plug;
    this.trayParts = tray.parts;
    this.buildPartsShelf();
    this.recycleDrum = this.buildRecycleDrum();
    this.coreShelf = this.buildBatteryBench();
    this.buildDecor();

    // Drain pan with its oil level, plus the oil stream and a spill puddle.
    const pan = buildItemModel('drain-pan');
    this.drainPan = pan.object;
    this.panOil = new Mesh(new CylinderGeometry(0.25, 0.25, 0.01, 14), new MeshLambertMaterial({ color: 0x3b2a12 }));
    this.panOil.position.y = 0.03;
    this.panOil.visible = false;
    this.drainPan.add(this.panOil);
    this.drainPan.position.copy(PAN_HOME);
    this.scene.add(this.drainPan);
    registry.addItem('drain-pan', this.drainPan, pan.collider, pan.grip);

    this.oilStream = new Mesh(new CylinderGeometry(0.008, 0.012, 1, 6), new MeshLambertMaterial({ color: 0x4a3310 }));
    this.oilStream.visible = false;
    this.scene.add(this.oilStream);
    this.puddle = new Mesh(new CircleGeometry(1, 16), new MeshLambertMaterial({ color: 0x2a1e0c }));
    this.puddle.rotation.x = -Math.PI / 2;
    this.puddle.visible = false;
    this.scene.add(this.puddle);

    // Brake work: floor jack, two stands and two chocks.
    this.scene.add(this.jack.root);
    registry.addOccluder(this.jack.occluder);
    for (const s of this.stands) this.scene.add(s.root);
    for (const c of this.chocks) this.scene.add(c);

    // Jump-start: the pack, the cables and their clamps.
    this.jumpPack = buildJumpPack();
    this.scene.add(this.jumpPack);
    this.scene.add(this.cables.red.mesh, this.cables.black.mesh);
    for (const [id, color] of [
      ['batt-pos', C.safetyRed],
      ['donor-pos', C.safetyRed],
      ['donor-neg', C.black],
      ['engine-ground', C.black],
    ] as const) {
      const clamp = buildClamp(color);
      clamp.visible = false;
      this.scene.add(clamp);
      this.clamps.set(id, clamp);
    }

    this.buildItems();
    this.buildSpots();
    this.lift.registerTargets(registry);
    this.registerPropTargets();
    this.registerDonor();
    this.attachVehicle(this.vehicle);
    this.reset();
  }

  private addLights(): void {
    const hemi = new HemisphereLight(0xffffff, 0x6b7680, 2.2);
    this.scene.add(hemi);
    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 8, 5);
    this.scene.add(sun);
  }

  private buildRoom(): Mesh {
    const walls = build()
      .box(14, 4.4, 0.2, C.wall, { p: [0, 2.2, -6] })
      .box(0.2, 4.4, 12, C.wall, { p: [-7, 2.2, 0] })
      .box(0.2, 4.4, 12, C.wall, { p: [7, 2.2, 0] })
      .box(4.5, 4.4, 0.2, C.wall, { p: [-4.75, 2.2, 6] })
      .box(4.5, 4.4, 0.2, C.wall, { p: [4.75, 2.2, 6] })
      .box(5, 1.2, 0.2, C.wall, { p: [0, 3.8, 6] })
      // wall trim stripe
      .box(14, 0.5, 0.22, C.wallTrim, { p: [0, 0.25, -6] })
      .box(0.22, 0.5, 12, C.wallTrim, { p: [-7, 0.25, 0] })
      .box(0.22, 0.5, 12, C.wallTrim, { p: [7, 0.25, 0] })
      // ceiling
      .box(14, 0.1, 12, C.ceiling, { p: [0, 4.45, 0] })
      // bay outline and drain grate
      .box(0.1, 0.004, 7, C.floorLine, { p: [-3.2, 0.002, 0] })
      .box(0.1, 0.004, 7, C.floorLine, { p: [3.4, 0.002, 0] })
      .box(6.6, 0.004, 0.1, C.floorLine, { p: [0.1, 0.002, -3.5] })
      .box(0.5, 0.006, 0.5, C.darkSteel, { p: [-2.5, 0.003, -2.6] })
      // garage door glow
      .box(4.9, 3.2, 0.05, 0xf6f2df, { p: [0, 1.6, 6.05] })
      .mesh('room');
    this.scene.add(walls);
    this.registry.addOccluder(walls);

    const lights = new Mesh(
      build()
        .box(2.2, 0.05, 0.4, C.white, { p: [-3, 4.38, -1.5] })
        .box(2.2, 0.05, 0.4, C.white, { p: [3, 4.38, -1.5] })
        .box(2.2, 0.05, 0.4, C.white, { p: [-3, 4.38, 2.5] })
        .box(2.2, 0.05, 0.4, C.white, { p: [3, 4.38, 2.5] })
        .box(2.6, 0.05, 0.4, C.white, { p: [0, 4.38, 0.5] })
        .geometry(),
      new MeshBasicMaterial({ color: 0xffffff }),
    );
    this.scene.add(lights);

    const floorMesh = new Mesh(new PlaneGeometry(14, 12), new MeshLambertMaterial({ color: C.floor }));
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.name = 'floor';
    floorMesh.userData.pick = { kind: 'floor' };
    floorMesh.userData.enabled = true;
    this.scene.add(floorMesh);

    const title = sign('SERVICE BAY VR', 4, 0.6, { bg: '#2f4858', sub: 'Training Center' });
    title.position.set(0, 3.4, -5.88);
    this.scene.add(title);
    return floorMesh;
  }

  private buildCart(): void {
    this.cart.position.copy(CART_POS);
    this.cart.rotation.y = CART_YAW;
    const cart = build()
      .box(1.5, 0.04, 0.62, C.cartRed, { p: [0, CART_TOP - 0.02, 0] })
      .box(1.5, 0.5, 0.56, C.cartRed, { p: [0, 0.55, 0] })
      .box(1.48, 0.01, 0.54, C.black, { p: [0, 0.81, 0.005] })
      .box(1.48, 0.01, 0.54, C.black, { p: [0, 0.65, 0.005] })
      .box(1.48, 0.01, 0.54, C.black, { p: [0, 0.49, 0.005] })
      .box(1.5, 0.04, 0.62, C.darkSteel, { p: [0, 0.22, 0] })
      .box(0.04, 0.04, 0.66, C.chrome, { p: [0.8, 0.85, 0] })
      .cyl(0.04, 0.04, 0.04, 8, C.black, { p: [0.65, 0.04, 0.25], r: [Math.PI / 2, 0, 0] })
      .cyl(0.04, 0.04, 0.04, 8, C.black, { p: [-0.65, 0.04, 0.25], r: [Math.PI / 2, 0, 0] })
      .cyl(0.04, 0.04, 0.04, 8, C.black, { p: [0.65, 0.04, -0.25], r: [Math.PI / 2, 0, 0] })
      .cyl(0.04, 0.04, 0.04, 8, C.black, { p: [-0.65, 0.04, -0.25], r: [Math.PI / 2, 0, 0] })
      .mesh('cart');
    this.cart.add(cart);
    this.registry.addOccluder(cart);
    this.scene.add(this.cart);
    // One row of slots across the top, so long tools never overlap (cart-local).
    for (let col = 0; col < 9; col++) this.cartSlots.push(new Vector3(-0.47 + col * 0.115, CART_TOP + 0.03, 0));
    const label = sign('TOOL CART', 0.5, 0.1, { bg: '#7a1f1a' });
    label.position.set(0, 0.62, 0.29);
    this.cart.add(label);
  }

  private buildPpe(): { glasses: Object3D; gloves: Object3D } {
    const glasses = build()
      .box(0.14, 0.04, 0.012, 0x9fe3ff, { p: [0, 0.02, 0] })
      .box(0.16, 0.012, 0.012, C.black, { p: [0, 0.045, 0] })
      .box(0.008, 0.008, 0.12, C.black, { p: [0.08, 0.04, 0.06] })
      .box(0.008, 0.008, 0.12, C.black, { p: [-0.08, 0.04, 0.06] })
      .mesh('ppe-glasses');
    glasses.position.set(0.64, CART_TOP + 0.08, -0.13);
    const gloves = build()
      .box(0.07, 0.02, 0.15, C.glove, { p: [-0.04, 0.01, 0] })
      .box(0.07, 0.02, 0.15, C.glove, { p: [0.04, 0.01, 0.01] })
      .mesh('ppe-gloves');
    gloves.position.set(0.64, CART_TOP + 0.02, 0.13);
    const stand = build()
      .box(0.24, 0.05, 0.5, C.darkSteel, { p: [0.62, CART_TOP + 0.0, 0] })
      .mesh('ppe-stand');
    this.cart.add(stand, glasses, gloves);
    const label = sign('PPE', 0.2, 0.08, { bg: '#2f6fd6' });
    label.position.set(0.64, CART_TOP + 0.2, 0);
    label.rotation.y = Math.PI / 2;
    this.cart.add(label);
    return { glasses, gloves };
  }

  private buildTray(): { plug: Object3D; parts: Object3D } {
    const tray = build()
      .cyl(0.09, 0.08, 0.02, 12, C.chrome, { p: [-0.62, CART_TOP + 0.01, 0] })
      .mesh('tray');
    this.cart.add(tray);
    const plug = new Object3D();
    plug.position.set(-0.64, CART_TOP + 0.04, -0.12);
    this.cart.add(plug);
    const parts = new Object3D();
    parts.position.set(-0.62, CART_TOP + 0.05, 0.02);
    this.cart.add(parts);
    const label = sign('PARTS TRAY', 0.24, 0.07, { bg: '#4a5258' });
    label.position.set(-0.64, CART_TOP + 0.14, -0.26);
    this.cart.add(label);
    return { plug, parts };
  }

  private buildPartsShelf(): void {
    const x = -6.6;
    const shelf = build();
    for (const y of [0.35, 0.85, 1.35, 1.85]) shelf.box(0.5, 0.04, 2.0, C.darkSteel, { p: [x, y, 1.0] });
    shelf.box(0.04, 2.0, 0.04, C.steel, { p: [x - 0.23, 1.0, 0.02] });
    shelf.box(0.04, 2.0, 0.04, C.steel, { p: [x + 0.23, 1.0, 0.02] });
    shelf.box(0.04, 2.0, 0.04, C.steel, { p: [x - 0.23, 1.0, 1.98] });
    shelf.box(0.04, 2.0, 0.04, C.steel, { p: [x + 0.23, 1.0, 1.98] });
    // boxed parts on other shelves
    for (let i = 0; i < 5; i++) {
      shelf.box(0.3, 0.2, 0.3, i % 2 ? 0xd9b26f : 0xc49a5a, { p: [x, 0.47, 0.25 + i * 0.38] });
      shelf.box(0.28, 0.25, 0.25, i % 2 ? C.oilFilter : 0xe0e0e0, { p: [x, 1.5, 0.25 + i * 0.38] });
    }
    const shelfMesh = shelf.mesh('parts-shelf');
    this.scene.add(shelfMesh);

    const colors = [0xc9851f, 0x2d6cb5, 0x6b8f2a];
    OIL_GRADES.forEach((grade, i) => {
      const jug = build()
        .box(0.22, 0.3, 0.16, colors[i] ?? C.oilAmber, { p: [0, 0.15, 0] })
        .cyl(0.025, 0.025, 0.05, 8, C.black, { p: [0, 0.32, 0.04] })
        .mesh(`jug:${grade}`);
      jug.position.set(x + 0.05, 0.87, 0.45 + i * 0.55);
      jug.rotation.y = Math.PI / 2;
      this.scene.add(jug);
      const label = sign(grade, 0.2, 0.08, { bg: '#ffffff', color: '#111111' });
      label.position.set(0, 0.15, 0.081);
      jug.add(label);
      this.oilJugs.set(grade, jug);
    });
    const label = sign('MOTOR OIL', 0.7, 0.14, { bg: '#2f4858' });
    label.position.set(x + 0.27, 2.1, 1.0);
    label.rotation.y = Math.PI / 2;
    this.scene.add(label);
  }

  private buildRecycleDrum(): Object3D {
    const drum = build()
      .cyl(0.3, 0.3, 0.9, 14, 0x2e6b3a, { p: [0, 0.45, 0] })
      .cyl(0.31, 0.31, 0.03, 14, C.darkSteel, { p: [0, 0.3, 0] })
      .cyl(0.31, 0.31, 0.03, 14, C.darkSteel, { p: [0, 0.65, 0] })
      .cyl(0.16, 0.08, 0.12, 10, C.black, { p: [0, 0.96, 0] })
      .mesh('recycle-drum');
    drum.position.set(-4.7, 0, 3.7);
    this.scene.add(drum);
    const label = sign('USED OIL', 0.5, 0.18, { bg: '#2e6b3a', sub: 'Recycle only' });
    label.position.set(0, 0.55, 0.31);
    drum.add(label);
    return drum;
  }

  /** Workbench with the charger, plus a core-return pallet for old batteries. */
  private buildBatteryBench(): Object3D {
    const bench = build()
      .box(2.4, 0.06, 0.7, C.wood, { p: [BENCH.x, 0.9, BENCH.z] })
      .box(2.4, 0.85, 0.65, C.darkSteel, { p: [BENCH.x, 0.45, BENCH.z] })
      // battery charger with its clamps
      .box(0.3, 0.22, 0.2, 0xe0e0e0, { p: [BENCH.x + 0.75, 1.04, BENCH.z + 0.05] })
      .box(0.2, 0.08, 0.01, 0x9fd3b0, { p: [BENCH.x + 0.75, 1.08, BENCH.z + 0.155] })
      // core return pallet on the floor beside the bench
      .box(0.8, 0.12, 0.6, C.wood, { p: [BENCH.x + 1.75, 0.06, BENCH.z + 0.05] })
      .box(0.24, 0.16, 0.17, C.black, { p: [BENCH.x + 1.55, 0.2, BENCH.z] })
      .mesh('battery-bench');
    this.scene.add(bench);
    this.registry.addOccluder(bench);
    const core = new Object3D();
    core.position.set(BENCH.x + 1.9, 0.14, BENCH.z + 0.05);
    this.scene.add(core);
    const label = sign('CORE RETURN', 0.5, 0.12, { bg: '#4a5258', sub: 'Old batteries' });
    label.position.set(BENCH.x + 1.75, 0.55, BENCH.z - 0.2);
    this.scene.add(label);
    return core;
  }

  private buildDecor(): void {
    const d = build()
      // workbench along the back wall
      .box(0.26, 0.2, 0.18, C.black, { p: [-4.9, 1.03, -5.5] })
      // pegboard tool wall
      .box(4, 1.6, 0.04, 0xc8a46a, { p: [0.5, 1.9, -5.88] })
      // tire changer and balancer
      .box(0.7, 0.9, 0.7, C.safetyRed, { p: [5.6, 0.45, 2.0] })
      .cyl(0.32, 0.32, 0.06, 14, C.darkSteel, { p: [5.6, 0.95, 2.0] })
      .box(0.08, 0.7, 0.08, C.darkSteel, { p: [5.85, 1.3, 2.0] })
      .box(0.6, 0.9, 0.5, 0x2d6cb5, { p: [5.6, 0.45, 0.6] })
      .cyl(0.1, 0.1, 0.4, 8, C.steel, { p: [5.3, 1.0, 0.6], r: [0, 0, Math.PI / 2] })
      // stacked tires
      .cyl(0.33, 0.33, 0.21, 14, C.rubber, { p: [5.9, 0.11, 3.6] })
      .cyl(0.33, 0.33, 0.21, 14, C.rubber, { p: [5.9, 0.33, 3.6] })
      .cyl(0.33, 0.33, 0.21, 14, C.rubber, { p: [5.9, 0.55, 3.6] })
      // EV safety zone tape on the floor
      .box(3, 0.006, 0.12, C.orange, { p: [4.6, 0.003, -2.2] })
      .box(3, 0.006, 0.12, C.orange, { p: [4.6, 0.003, -4.8] })
      .box(0.12, 0.006, 2.6, C.orange, { p: [3.1, 0.003, -3.5] })
      .box(0.12, 0.006, 2.6, C.orange, { p: [6.1, 0.003, -3.5] })
      // safety cones
      .cyl(0.02, 0.14, 0.4, 8, C.orange, { p: [3.2, 0.2, -2.3] })
      .cyl(0.02, 0.14, 0.4, 8, C.orange, { p: [6.0, 0.2, -2.3] })
      // customer counter near the door
      .box(1.8, 1.0, 0.6, C.wallTrim, { p: [-5.2, 0.5, 5.2] })
      .box(1.9, 0.05, 0.7, C.wood, { p: [-5.2, 1.02, 5.2] })
      // air hose reel
      .cyl(0.25, 0.25, 0.12, 12, C.safetyYellow, { p: [-0.1, 2.6, -5.85], r: [Math.PI / 2, 0, 0] })
      .mesh('decor');
    this.scene.add(d);
    this.registry.addOccluder(d);

    const signs: [string, number, number, number, number, string?][] = [
      ['BATTERY BENCH', -4.4, 1.6, -5.9, 0],
      ['TIRE ZONE', 5.6, 2.2, 1.3, -Math.PI / 2],
      ['EV SAFETY ZONE', 4.6, 2.2, -5.88, 0, 'High voltage: certified techs only'],
      ['SAFETY FIRST', -2.4, 2.4, -5.88, 0, 'Glasses on. Lift on locks.'],
      ['CUSTOMER SERVICE', -5.2, 1.8, 5.88, Math.PI],
    ];
    for (const [text, x, y, z, ry, sub] of signs) {
      const s = sign(text, sub ? 1.6 : 1.3, sub ? 0.36 : 0.22, { bg: '#2f4858', sub });
      s.position.set(x, y, z);
      s.rotation.y = ry;
      this.scene.add(s);
    }
  }

  private buildItems(): void {
    ALL_ITEMS.forEach((id, i) => {
      const model = buildItemModel(id);
      model.object.position.copy(this.cartSlots[i % this.cartSlots.length] as Vector3);
      this.cart.add(model.object);
      this.registry.addItem(id, model.object, model.collider, model.grip);
    });
    const plug = buildItemModel('drain-plug');
    this.trayPlug.add(plug.object);
    this.registry.addItem('drain-plug', plug.object, plug.collider, plug.grip);
    this.registry.setItemAvailable('drain-plug', false);

    const pads = buildItemModel('new-pads');
    this.trayParts.add(pads.object);
    this.registry.addItem('new-pads', pads.object, pads.collider, pads.grip);

    const jug = buildItemModel('oil-bottle');
    this.cart.add(jug.object);
    jug.object.position.set(-0.64, CART_TOP + 0.13, 0.15);
    this.registry.addItem('oil-bottle', jug.object, jug.collider, jug.grip);
    this.registry.setItemAvailable('oil-bottle', false);

    // Replacement batteries wait on the bench.
    for (const [id, dx] of [
      ['battery-new', -0.35],
      ['battery-wrong', 0.05],
    ] as const) {
      const m = buildItemModel(id);
      m.object.position.set(BENCH.x + dx, BENCH.y, BENCH.z + 0.05);
      this.scene.add(m.object);
      this.registry.addItem(id, m.object, m.collider, { position: new Vector3(0, -0.1, -0.15) });
    }

    const clamps = buildItemModel('pack-clamps');
    clamps.object.position.set(0, 0.23, 0);
    this.jumpPack.add(clamps.object);
    this.registry.addItem('pack-clamps', clamps.object, clamps.collider, clamps.grip);
  }

  /** Lays out the given items in cart slots and hides the rest. */
  layoutCart(items: string[]): void {
    let slot = 0;
    for (const id of ALL_ITEMS) {
      const shown = items.includes(id);
      this.registry.setItemAvailable(id, shown);
      if (shown) {
        const p = this.cartSlots[slot++ % this.cartSlots.length] as Vector3;
        this.registry.rehome(id, this.cart, p.clone());
      }
    }
    for (const id of ['new-pads', 'battery-new', 'battery-wrong']) {
      this.registry.setItemAvailable(id, items.includes(id));
    }
  }

  // --- vehicles ---

  /** Puts a vehicle in the bay (on the lift), swapping out the current one. */
  setVehicle(id: VehicleId): void {
    const next = this.vehicles.get(id);
    if (!next || next === this.vehicle) return;
    this.detachVehicle(this.vehicle);
    this.vehicle = next;
    this.scene.add(next.root);
    this.lift.setLiftPoints(next.liftPoints);
    this.registry.addOccluder(...this.lift.occluders);
    this.attachVehicle(next);
    this.reset();
  }

  private detachVehicle(v: Vehicle): void {
    this.scene.remove(v.root);
    v.unregisterTargets(this.registry);
    this.registry.removeOccluder(...v.occluders);
    this.registry.removeOccluder(...this.lift.occluders);
    for (const pos of WHEELS) this.registry.removeItem(`wheel-${pos}`);
    for (const pos of ['FL', 'FR']) this.registry.removeItem(`caliper-${pos}`);
    this.registry.removeItem('old-battery');
  }

  private attachVehicle(v: Vehicle): void {
    v.registerTargets(this.registry);
    this.registry.addOccluder(...v.occluders);
    for (const pos of WHEELS) {
      const part = v.wheelParts[pos];
      const r = v.layout.wheelR + 0.01;
      const col = collider(new CylinderGeometry(r, r, v.layout.tireW + 0.03, 10).rotateX(Math.PI / 2));
      this.registry.addItem(`wheel-${pos}`, part.group, col, { position: new Vector3(0, 0, -0.3) });
      this.registry.items.get(`wheel-${pos}`)!.collider.userData.enabled = false;
    }
    for (const pos of ['FL', 'FR'] as const) {
      const cal = v.brakes[pos].caliper;
      this.registry.addItem(`caliper-${pos}`, cal, boxCollider(0.12, 0.16, 0.12), {
        position: new Vector3(0, 0, -0.12),
      });
    }
    this.registry.addItem('old-battery', v.battery, boxCollider(0.3, 0.22, 0.22), {
      position: new Vector3(0, -0.1, -0.15),
    });
    this.layoutSpots();
  }

  private registerDonor(): void {
    const d = this.donor;
    const add = (id: string, label: string, anchor: string, col: Mesh) => {
      const a = d.anchors.get(anchor);
      if (a) this.registry.addTarget(id, label, a, col);
    };
    add('donor-pos', 'Donor car positive (+) terminal', 'batt-pos', sphereCollider(0.035));
    add('donor-neg', 'Donor car negative (−) terminal', 'batt-neg', sphereCollider(0.035));
    add('donor-start', 'Donor car start button', 'start-button', sphereCollider(0.08));
    this.registry.addOccluder(...d.occluders);
  }

  /** Arranges the bay for a lesson. */
  applyStage(stage: StageSetup): void {
    this.stage = stage;
    const L = this.vehicle.layout;
    this.carX = stage.carNoseX !== undefined ? stage.carNoseX - L.front : 0;
    this.vehicle.root.position.x = this.carX;
    if (stage.hoodOpen) this.vehicle.setHoodOpen(true);

    this.donor.root.visible = !!stage.donor;
    this.donor.root.position.set(DONOR_NOSE_X + this.donor.layout.front, 0, 0);
    this.donor.setHoodOpen(!!stage.donor);
    for (const id of ['donor-pos', 'donor-neg', 'donor-start']) {
      const t = this.registry.targets.get(id);
      if (t) t.collider.userData.enabled = !!stage.donor;
    }

    this.jumpPack.visible = !!stage.jumpPack;
    this.jumpPack.position.set(this.carX + L.at.battery[0] - 0.35, 0, -L.halfWidth - 0.25);
    this.jumpPack.rotation.y = Math.PI / 2;
    this.registry.setItemAvailable('pack-clamps', !!stage.jumpPack);
    const power = this.registry.targets.get('pack-power');
    if (power) power.collider.userData.enabled = !!stage.jumpPack;

    this.registry.setItemAvailable('drain-pan', !!stage.drainPan);
    this.drainPan.visible = !!stage.drainPan;

    const jack = !!stage.jack;
    this.jack.root.visible = jack;
    this.stands.forEach((s) => {
      s.root.visible = jack;
    });
    this.chocks.forEach((c) => {
      c.visible = jack;
    });
    for (const id of ['jack-handle', 'jack-release', 'chock-RL', 'chock-RR']) {
      const t = this.registry.targets.get(id);
      if (t) t.collider.userData.enabled = jack;
    }
    this.resetJack();
    this.layoutSpots();
  }

  // --- floor jack and stands ---

  private standHome(i: number): Vector3 {
    const L = this.vehicle.layout;
    const p = i === 0 ? L.standPoints.FL : L.standPoints.FR;
    return new Vector3(p[0] + 0.5, 0, Math.sign(p[2]) * (L.halfWidth + 0.45));
  }

  private resetJack(): void {
    const L = this.vehicle.layout;
    this.jackRaise = 0;
    this.applyJackRaise();
    this.jack.root.position.set(L.front + 0.35, 0, 0.0);
    this.jack.setSaddle(0.13);
    this.jack.pump(0);
    this.stands.forEach((s, i) => {
      s.root.position.copy(this.standHome(i));
      s.setHeight(0.3);
    });
    const rearX = L.wheelX.rear;
    this.chocks.forEach((c, i) => {
      c.position.set(rearX - 0.6, 0, (i === 0 ? -1 : 1) * (L.halfWidth + 0.5));
      c.rotation.y = 0;
    });
  }

  /** Rolls the jack so its saddle sits under the vehicle's jacking point. */
  placeJack(): void {
    const p = this.vehicleLocal(this.vehicle.layout.jackPoint);
    this.jack.root.position.set(p.x - 0.02, 0, p.z);
    this.jack.setSaddle(p.y - 0.01);
  }

  /** Raises the front of the car on the jack (0 = on its tires, 1 = full height). */
  setJackRaise(t: number): void {
    this.jackRaise = Math.max(0, Math.min(1.1, t));
    this.applyJackRaise();
    const p = this.vehicleLocal(this.vehicle.layout.jackPoint);
    this.jack.setSaddle(p.y - 0.01);
  }

  private applyJackRaise(): void {
    const L = this.vehicle.layout;
    const raise = L.jackRaise * this.jackRaise;
    const rz = raise / (L.wheelX.front - L.wheelX.rear);
    const root = this.vehicle.root;
    root.rotation.z = rz;
    root.position.y = -L.wheelX.rear * rz + this.lift.height;
  }

  /** A vehicle-local point in world space (the car may be raised or tilted). */
  vehicleLocal(p: [number, number, number]): Vector3 {
    this.vehicle.root.updateMatrixWorld(true);
    return this.vehicle.root.localToWorld(new Vector3(p[0], p[1], p[2]));
  }

  /** Slides a jack stand under its point (i: 0 left, 1 right) at the current height. */
  placeStand(i: number, under: boolean): void {
    const L = this.vehicle.layout;
    const stand = this.stands[i] as JackStand;
    if (!under) {
      stand.root.position.copy(this.standHome(i));
      stand.setHeight(0.3);
      return;
    }
    const p = this.vehicleLocal(i === 0 ? L.standPoints.FL : L.standPoints.FR);
    stand.root.position.set(p.x, 0, p.z);
    stand.setHeight(p.y - 0.01);
  }

  placeChock(i: number): void {
    const L = this.vehicle.layout;
    const chock = this.chocks[i] as Mesh;
    chock.position.set(this.carX + L.wheelX.rear - L.wheelR - 0.08, 0, (i === 0 ? -1 : 1) * L.trackZ);
    chock.rotation.y = Math.PI;
  }

  // --- jump-start cables ---

  /** Shows a clamp on a terminal (or hides it) and redraws the cables. */
  setClamp(target: string, on: boolean): void {
    const clamp = this.clamps.get(target);
    if (!clamp) return;
    clamp.visible = on;
    const p = this.registry.targetWorldPosition(target);
    if (p) clamp.position.copy(p).add(new Vector3(0, 0.02, 0));
    this.redrawCables();
  }

  private redrawCables(): void {
    const at = (id: string) => {
      const c = this.clamps.get(id);
      return c?.visible ? c.position.clone() : null;
    };
    const pack = this.jumpPack.visible ? this.jumpPack.position.clone().add(new Vector3(0, 0.2, 0)) : null;
    if (this.stage.jumpPack) {
      this.cables.red.connect(at('batt-pos'), pack);
      this.cables.black.connect(at('engine-ground'), pack);
    } else {
      this.cables.red.connect(at('batt-pos'), at('donor-pos'));
      this.cables.black.connect(at('donor-neg'), at('engine-ground'));
    }
  }

  private registerWheelChocks(): void {
    const reg = this.registry;
    const L = this.vehicle.layout;
    for (const [pos, i] of [
      ['RL', 0],
      ['RR', 1],
    ] as const) {
      const spot = new Object3D();
      spot.name = `chock-spot-${pos}`;
      spot.position.set(L.wheelX.rear - L.wheelR - 0.08, 0.06, (i === 0 ? -1 : 1) * L.trackZ);
      this.vehicle.root.add(spot);
      reg.addTarget(
        `chock-${pos}`,
        `Behind the ${i === 0 ? 'left' : 'right'} rear tire`,
        spot,
        boxCollider(0.2, 0.14, 0.3),
      );
    }
  }

  private registerPropTargets(): void {
    const reg = this.registry;
    reg.addTarget('ppe-glasses', 'Safety glasses', this.ppeGlasses, boxCollider(0.2, 0.1, 0.16));
    reg.addTarget('ppe-gloves', 'Nitrile gloves', this.ppeGloves, boxCollider(0.2, 0.08, 0.2));
    reg.addTarget('plug-on-tray', 'Drain plug on the parts tray', this.trayPlug, sphereCollider(0.07));
    for (const [grade, jug] of this.oilJugs) {
      reg.addTarget(oilTarget(grade), `${grade} motor oil`, jug, boxCollider(0.3, 0.4, 0.3));
    }
    const panSpot = new Object3D();
    panSpot.name = 'pan-spot';
    this.scene.add(panSpot);
    reg.addTarget('pan-spot', 'Floor under the drain plug', panSpot, boxCollider(0.6, 0.1, 0.6));
    reg.addTarget(
      'oil-jug',
      'Open jug of fresh oil',
      this.registry.items.get('oil-bottle')!.object,
      boxCollider(0.14, 0.26, 0.12),
    );
    reg.addTarget('recycle-drum', 'Used oil recycling drum', this.recycleDrum, boxCollider(0.7, 1.2, 0.7));
    reg.addTarget('core-shelf', 'Core return pallet', this.coreShelf, boxCollider(0.8, 0.3, 0.6));
    reg.addTarget('jack-handle', 'Floor jack handle', this.jack.grip, sphereCollider(0.1));
    reg.addTarget('jack-release', 'Floor jack release (twist the handle)', this.jack.grip, sphereCollider(0.09));
    const power = new Object3D();
    power.position.set(0.08, 0.21, 0.05);
    this.jumpPack.add(power);
    reg.addTarget('pack-power', 'Jump pack power button', power, sphereCollider(0.04));
  }

  /** Wheel chocks target the vehicle's rear tires, so they move with each vehicle swap. */
  private refreshChockTargets(): void {
    for (const id of ['chock-RL', 'chock-RR']) {
      const t = this.registry.targets.get(id);
      if (t) {
        t.anchor.removeFromParent();
        this.registry.removeTarget(id);
      }
    }
    this.registerWheelChocks();
  }

  // --- work spots ---

  private spotDefs(): SpotDef[] {
    const v = this.vehicle;
    const L = v.layout;
    const x = this.carX;
    const fx = x + L.wheelX.front;
    const rx = x + L.wheelX.rear;
    const side = L.halfWidth + 1.3;
    const nose = x + L.front;
    const plug = v.layout.at.drainPlug;
    const batt = v.layout.at.battery;
    const seat = v.layout.at.driverSeat;
    return [
      ['start', 'Shop floor', [3.5, 0, 4.1], [0.9, 0.9, 0.1]],
      ['cart', 'Tool cart', [3.45, 0, 3.3], [3.0, 0.7, 2.35]],
      ['lift-controls', 'Lift controls', [-0.6, 0, 2.6], [-0.05, 1.1, 1.65]],
      ['parts', 'Parts shelf', [-5.4, 0, 1.0], [-6.6, 1.0, 1.0]],
      ['hood', 'Engine bay', [nose + 0.75, 0, 0.3], [nose - 0.6, 0.8, 0]],
      ['right-front', 'Right front wheel', [fx + 0.1, 0, side], [fx, 0.6, L.trackZ]],
      ['right-rear', 'Right rear wheel', [rx - 0.1, 0, side], [rx, 0.6, L.trackZ]],
      ['left-front', 'Left front wheel', [fx + 0.1, 0, -side], [fx, 0.6, -L.trackZ]],
      ['left-rear', 'Left rear wheel', [rx - 0.1, 0, -side], [rx, 0.6, -L.trackZ]],
      ['under', 'Under the car', [x + plug[0] - 0.85, 0, 0.6], [x + plug[0] - 0.05, 1.6 + plug[1], 0]],
      ['recycle', 'Oil recycling', [-3.9, 0, 3.0], [-4.7, 0.6, 3.7]],
      ['bench', 'Battery bench', [-3.4, 0, -4.4], [-3.4, 0.6, -5.5]],
      ['battery', 'Battery', [x + batt[0] + 0.15, 0, -L.halfWidth - 0.55], [x + batt[0], batt[1], batt[2]]],
      ['jack', 'Floor jack', [nose + 1.5, 0, 0.6], [nose + 0.5, 0.5, 0]],
      ['driver', "Driver's door", [x + seat[0] - 0.1, 0, -L.halfWidth - 0.6], [x + seat[0], 1.1, 0]],
      ['donor', 'Donor car', [DONOR_NOSE_X + 0.25, 0, 1.25], [DONOR_NOSE_X + 0.6, 0.8, 0.3]],
    ];
  }

  private buildSpots(): void {
    const ringGeo = new RingGeometry(0.22, 0.3, 20).rotateX(-Math.PI / 2);
    for (const [id, label] of this.spotDefs()) {
      const marker = new Mesh(ringGeo, new MeshBasicMaterial({ color: 0x2f9bff, transparent: true, opacity: 0.75 }));
      marker.name = `spot:${id}`;
      const hit = collider(new CylinderGeometry(0.32, 0.32, 0.05, 10), { kind: 'spot', id });
      hit.userData.enabled = true;
      marker.add(hit);
      this.registry.addCollider(hit, { kind: 'spot', id });
      this.scene.add(marker);
      this.spots.set(id, { id, label, position: new Vector3(), yaw: 0, pitch: 0, eye: 1.6, marker, enabled: true });
    }
    this.layoutSpots();
  }

  /** Moves the work spots to suit the current vehicle and arrangement. */
  private layoutSpots(): void {
    if (this.spots.size === 0) return;
    for (const [id, label, p, look] of this.spotDefs()) {
      const spot = this.spots.get(id);
      if (!spot) continue;
      spot.label = label;
      spot.position.set(...p);
      spot.marker.position.copy(spot.position).setY(0.01);
      const target = new Vector3(...look);
      if (LOW_SPOTS.includes(id) && this.lift.height < 0.5) {
        spot.eye = CROUCH_EYE;
        target.y = Math.min(target.y, 0.45);
      } else {
        spot.eye = DESKTOP_EYE;
      }
      const flat = Math.hypot(target.x - spot.position.x, target.z - spot.position.z);
      spot.pitch = Math.atan2(target.y - spot.eye, flat);
      spot.yaw = yawFacing(spot.position, target);
    }
    const panSpot = this.registry.targets.get('pan-spot');
    if (panSpot) {
      const plug = this.vehicle.layout.at.drainPlug;
      panSpot.anchor.position.set(this.carX + plug[0], 0.05, plug[2]);
      this.puddle.position.set(this.carX + plug[0], 0.004, plug[2]);
    }
    if (
      !this.registry.targets.has('chock-RL') ||
      this.registry.targets.get('chock-RL')?.anchor.parent !== this.vehicle.root
    ) {
      this.refreshChockTargets();
    }
    // Lesson-specific spots appear only when their gear is out.
    this.setSpotEnabled('under', this.lift.height > 1.2);
    this.setSpotEnabled('jack', !!this.stage.jack);
    this.setSpotEnabled('donor', !!this.stage.donor);
    this.setSpotEnabled('battery', this.carX !== 0);
    this.setSpotEnabled('hood', !this.stage.donor && !this.stage.jack);
  }

  private highlighted: WorkSpot | null = null;
  private pulse = 0;

  /** Pulses one work spot orange to show where to go next (Learn mode and hints). */
  highlightSpot(id: string | null): void {
    if (this.highlighted) {
      (this.highlighted.marker.material as MeshBasicMaterial).color.setHex(0x2f9bff);
      this.highlighted.marker.scale.setScalar(1);
    }
    this.highlighted = id ? (this.spots.get(id) ?? null) : null;
    if (this.highlighted) (this.highlighted.marker.material as MeshBasicMaterial).color.setHex(0xffa630);
  }

  update(dt: number): void {
    if (!this.highlighted) return;
    this.pulse += dt;
    this.highlighted.marker.scale.setScalar(1 + Math.sin(this.pulse * 5) * 0.15);
  }

  setSpotEnabled(id: string, enabled: boolean): void {
    const spot = this.spots.get(id);
    if (!spot) return;
    spot.enabled = enabled;
    spot.marker.visible = enabled;
    const hit = spot.marker.children[0];
    if (hit) hit.userData.enabled = enabled;
  }

  /** The work spot closest to a world position (for guiding the student). */
  nearestSpot(p: Vector3): WorkSpot | null {
    let best: WorkSpot | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const s of this.spots.values()) {
      if (!s.enabled || s.id === 'start') continue;
      const d = s.position.distanceToSquared(new Vector3(p.x, 0, p.z));
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  /** Floor areas the player cannot walk into: cars on the floor, lift posts, the jack. */
  isWalkable(p: Vector3): boolean {
    const L = this.vehicle.layout;
    const raised = this.lift.height > 1.2;
    const inCar =
      p.x > this.carX + L.rear - 0.12 && p.x < this.carX + L.front + 0.12 && Math.abs(p.z) < L.halfWidth + 0.15;
    if (inCar && !raised) return false;
    if (this.donor.root.visible) {
      const dL = this.donor.layout;
      if (
        p.x > DONOR_NOSE_X - 0.1 &&
        p.x < DONOR_NOSE_X + dL.front - dL.rear + 0.1 &&
        Math.abs(p.z) < dL.halfWidth + 0.15
      )
        return false;
    }
    const nearPost = Math.abs(p.x + 0.05) < 0.35 && Math.abs(Math.abs(p.z) - 1.45) < 0.35;
    return !nearPost;
  }

  // --- lift ---

  /** Raises the car together with the lift carriage. */
  setLiftHeight(h: number): void {
    const wasLow = this.lift.height < 0.5;
    this.lift.setHeight(h);
    this.applyJackRaise();
    this.setSpotEnabled('under', this.lift.height > 1.2);
    if (wasLow !== this.lift.height < 0.5) this.layoutSpots();
  }

  /** Puts a removed wheel on the floor beside its hub, standing up. */
  parkWheel(origin: WheelPos, hubPos: WheelPos): void {
    const v = this.vehicle;
    const hub = v.wheels[hubPos];
    const part = v.wheelParts[origin];
    const L = v.layout;
    const x = this.carX + (hubPos.startsWith('F') ? L.wheelX.front + 0.4 : L.wheelX.rear - 0.4);
    const z = hub.side * (L.halfWidth + 0.38);
    this.registry.rehome(`wheel-${origin}`, this.scene, new Vector3(x, L.wheelR, z));
    part.group.rotation.set(0, 0, 0);
    this.registry.items.get(`wheel-${origin}`)!.collider.userData.enabled = true;
  }

  resetDrainPan(): void {
    this.registry.rehome('drain-pan', this.scene, PAN_HOME.clone());
    this.panOil.visible = false;
    this.panOil.scale.set(1, 1, 1);
  }

  /** Resets every prop, the car and the lift to the start of a lesson run. */
  reset(): void {
    const v = this.vehicle;
    v.reset();
    this.lift.reset();
    this.setLiftHeight(0);
    this.resetDrainPan();
    this.oilStream.visible = false;
    this.puddle.visible = false;
    for (const pos of WHEELS) {
      const wheelItem = this.registry.items.get(`wheel-${pos}`);
      if (wheelItem) {
        wheelItem.collider.userData.enabled = false;
        wheelItem.home = {
          parent: v.wheels[pos].hub,
          position: new Vector3(),
          quaternion: wheelItem.object.quaternion.clone().identity(),
        };
      }
    }
    for (const pos of ['FL', 'FR'] as const) {
      const cal = this.registry.items.get(`caliper-${pos}`);
      if (cal) {
        cal.home = {
          parent: v.wheels[pos].hub,
          position: v.brakes[pos].caliperHome.clone(),
          quaternion: cal.object.quaternion.clone(),
        };
        cal.collider.userData.enabled = false;
        cal.available = true;
      }
    }
    const old = this.registry.items.get('old-battery');
    if (old) {
      old.home = {
        parent: v.root,
        position: v.batteryHome.clone(),
        quaternion: old.object.quaternion.clone().identity(),
      };
      old.collider.userData.enabled = false;
      old.available = true;
    }
    this.ppeGlasses.visible = true;
    this.ppeGloves.visible = true;
    this.registry.setItemAvailable('drain-plug', false);
    this.registry.setItemAvailable('oil-bottle', false);
    this.registry.rehome('oil-bottle', this.cart, new Vector3(-0.64, CART_TOP + 0.13, 0.15));
    this.registry.rehome('drain-plug', this.trayPlug, new Vector3());
    this.registry.rehome('new-pads', this.trayParts, new Vector3());
    this.registry.rehome('pack-clamps', this.jumpPack, new Vector3(0, 0.23, 0));
    this.registry.rehome('battery-new', this.scene, new Vector3(BENCH.x - 0.35, BENCH.y, BENCH.z + 0.05));
    this.registry.rehome('battery-wrong', this.scene, new Vector3(BENCH.x + 0.05, BENCH.y, BENCH.z + 0.05));
    for (const jug of this.oilJugs.values()) jug.visible = true;
    for (const id of this.clamps.keys()) this.setClamp(id, false);
    this.donor.reset();
    this.donor.root.rotation.y = Math.PI;
    this.stage = {};
    this.carX = 0;
    v.root.position.x = 0;
    this.applyStage({});
  }
}
