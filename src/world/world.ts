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
import { sign } from '../ui/panel';
import { VEHICLES, WHEELS, type WheelPos } from '../vehicles/specs';
import { Vehicle } from '../vehicles/vehicle';
import { Lift } from './lift';
import { build } from './lowpoly';
import { C } from './palette';
import { buildItemModel } from './tools';

export interface WorkSpot {
  id: string;
  label: string;
  position: Vector3;
  yaw: number;
  /** Desktop camera pitch when arriving (look up under the car, down at wheels). */
  pitch: number;
  marker: Mesh;
  enabled: boolean;
}

export const ALL_ITEMS = [
  'ratchet-10',
  'ratchet-14',
  'ratchet-17',
  'filter-wrench',
  'torque-wrench',
  'impact-wrench',
  'tire-gauge',
  'tread-gauge',
  'air-chuck',
  'rag',
  'new-filter',
  'new-washer',
];

const CART_POS = new Vector3(3.0, 0, 2.35);
const CART_YAW = -0.45;
const CART_TOP = 0.93;
const PAN_HOME = new Vector3(0.45, 0, 2.5);

function yawFacing(from: Vector3, to: Vector3): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

/** The service bay: environment, lift, vehicle, tool cart, props and work spots. */
export class World {
  readonly scene = new Scene();
  readonly lift: Lift;
  readonly vehicle: Vehicle;
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
  readonly oilJugs = new Map<string, Object3D>();
  readonly recycleDrum: Object3D;

  constructor(readonly registry: Registry) {
    this.scene.background = new Color(0xcfd8df);
    this.addLights();
    this.floor = this.buildRoom();

    this.vehicle = new Vehicle(VEHICLES.sedan);
    this.lift = new Lift(this.vehicle.liftPoints);
    this.scene.add(this.lift.root);
    this.scene.add(this.vehicle.root);

    this.buildCart();
    const ppe = this.buildPpe();
    this.ppeGlasses = ppe.glasses;
    this.ppeGloves = ppe.gloves;
    this.trayPlug = this.buildTray();
    this.buildPartsShelf();
    this.recycleDrum = this.buildRecycleDrum();
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
    this.puddle.position.set(1.78, 0.004, 0.08);
    this.puddle.visible = false;
    this.scene.add(this.puddle);

    this.buildItems();
    this.buildSpots();
    this.vehicle.registerTargets(registry);
    this.lift.registerTargets(registry);
    this.registerPropTargets();
    this.registerWheelItems();
  }

  private addLights(): void {
    const hemi = new HemisphereLight(0xffffff, 0x6b7680, 2.2);
    this.scene.add(hemi);
    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 8, 5);
    this.scene.add(sun);
  }

  private buildRoom(): Mesh {
    const room = build()
      // walls
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
      // ceiling and light panels
      .box(14, 0.1, 12, C.ceiling, { p: [0, 4.45, 0] })
      // bay outline and drain grate
      .box(0.1, 0.004, 7, C.floorLine, { p: [-3.2, 0.002, 0] })
      .box(0.1, 0.004, 7, C.floorLine, { p: [3.4, 0.002, 0] })
      .box(6.6, 0.004, 0.1, C.floorLine, { p: [0.1, 0.002, -3.5] })
      .box(0.5, 0.006, 0.5, C.darkSteel, { p: [-2.5, 0.003, -2.6] })
      // garage door glow
      .box(4.9, 3.2, 0.05, 0xf6f2df, { p: [0, 1.6, 6.05] })
      .mesh('room');
    this.scene.add(room);

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
    this.scene.add(this.cart);
    // One row of slots across the top, so long tools never overlap (cart-local).
    for (let col = 0; col < 8; col++) this.cartSlots.push(new Vector3(-0.45 + col * 0.13, CART_TOP + 0.03, 0));
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

  private buildTray(): Object3D {
    const tray = build()
      .cyl(0.09, 0.08, 0.02, 12, C.chrome, { p: [-0.62, CART_TOP + 0.01, 0] })
      .mesh('tray');
    this.cart.add(tray);
    const spot = new Object3D();
    spot.position.set(-0.64, CART_TOP + 0.04, -0.12);
    this.cart.add(spot);
    const label = sign('PARTS TRAY', 0.24, 0.07, { bg: '#4a5258' });
    label.position.set(-0.64, CART_TOP + 0.14, -0.26);
    this.cart.add(label);
    return spot;
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
    this.scene.add(shelf.mesh('parts-shelf'));

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

  private buildDecor(): void {
    const d = build()
      // workbench and battery bench along the back wall
      .box(2.4, 0.06, 0.7, C.wood, { p: [-4.4, 0.9, -5.5] })
      .box(2.4, 0.85, 0.65, C.darkSteel, { p: [-4.4, 0.45, -5.5] })
      .box(0.26, 0.2, 0.18, C.black, { p: [-4.9, 1.03, -5.5] })
      .box(0.26, 0.2, 0.18, C.black, { p: [-4.5, 1.03, -5.5] })
      .box(0.3, 0.22, 0.2, 0xe0e0e0, { p: [-3.8, 1.04, -5.45] })
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

    const jug = buildItemModel('oil-bottle');
    this.cart.add(jug.object);
    jug.object.position.set(-0.64, CART_TOP + 0.13, 0.15);
    this.registry.addItem('oil-bottle', jug.object, jug.collider, jug.grip);
    this.registry.setItemAvailable('oil-bottle', false);
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
  }

  private registerWheelItems(): void {
    for (const pos of WHEELS) {
      const part = this.vehicle.wheelParts[pos];
      const col = collider(new CylinderGeometry(0.34, 0.34, 0.24, 10).rotateX(Math.PI / 2));
      this.registry.addItem(`wheel-${pos}`, part.group, col, { position: new Vector3(0, 0, -0.3) });
      // Wheels on the car are not grabbable until removed.
      this.registry.items.get(`wheel-${pos}`)!.collider.userData.enabled = false;
    }
  }

  /** Puts a removed wheel on the floor beside its hub, standing up. */
  parkWheel(origin: WheelPos, hubPos: WheelPos): void {
    const hub = this.vehicle.wheels[hubPos];
    const part = this.vehicle.wheelParts[origin];
    const x = hubPos.startsWith('F') ? 1.75 : -1.75;
    const z = hub.side * 1.25;
    const position = new Vector3(x, 0.33, z);
    this.registry.rehome(`wheel-${origin}`, this.scene, position);
    part.group.rotation.set(0, 0, 0);
    this.registry.items.get(`wheel-${origin}`)!.collider.userData.enabled = true;
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
    panSpot.position.set(1.78, 0.05, 0.08);
    this.scene.add(panSpot);
    reg.addTarget('pan-spot', 'Floor under the drain plug', panSpot, boxCollider(0.6, 0.1, 0.6));
    reg.addTarget(
      'oil-jug',
      'Open jug of fresh oil',
      this.registry.items.get('oil-bottle')!.object,
      boxCollider(0.14, 0.26, 0.12),
    );
    reg.addTarget('recycle-drum', 'Used oil recycling drum', this.recycleDrum, boxCollider(0.7, 1.2, 0.7));
  }

  private buildSpots(): void {
    const defs: [string, string, [number, number, number], [number, number, number]][] = [
      ['start', 'Shop floor', [3.5, 0, 4.1], [0.9, 0.9, 0.1]],
      ['cart', 'Tool cart', [3.45, 0, 3.3], [3.0, 0.7, 2.35]],
      ['lift-controls', 'Lift controls', [-0.6, 0, 2.6], [-0.05, 1.1, 1.65]],
      ['parts', 'Parts shelf', [-5.4, 0, 1.0], [-6.6, 1.0, 1.0]],
      ['hood', 'Engine bay', [3.2, 0, 0.3], [1.8, 0.8, 0]],
      ['right-front', 'Right front wheel', [1.45, 0, 2.2], [1.35, 0.6, 0.76]],
      ['right-rear', 'Right rear wheel', [-1.45, 0, 2.2], [-1.35, 0.6, 0.76]],
      ['left-front', 'Left front wheel', [1.45, 0, -2.2], [1.35, 0.6, -0.76]],
      ['left-rear', 'Left rear wheel', [-1.45, 0, -2.2], [-1.35, 0.6, -0.76]],
      ['under', 'Under the car', [0.9, 0, 0.6], [1.7, 1.6, 0]],
      ['recycle', 'Oil recycling', [-3.9, 0, 3.0], [-4.7, 0.6, 3.7]],
    ];
    const ringGeo = new RingGeometry(0.22, 0.3, 20).rotateX(-Math.PI / 2);
    for (const [id, label, p, look] of defs) {
      const position = new Vector3(...p);
      const marker = new Mesh(ringGeo, new MeshBasicMaterial({ color: 0x2f9bff, transparent: true, opacity: 0.75 }));
      marker.position.copy(position).setY(0.01);
      marker.name = `spot:${id}`;
      const hit = collider(new CylinderGeometry(0.32, 0.32, 0.05, 10), { kind: 'spot', id });
      hit.userData.enabled = true;
      marker.add(hit);
      this.registry.addCollider(hit, { kind: 'spot', id });
      this.scene.add(marker);
      const target = new Vector3(...look);
      const flat = Math.hypot(target.x - position.x, target.z - position.z);
      const pitch = Math.atan2(target.y - 1.6, flat);
      this.spots.set(id, { id, label, position, yaw: yawFacing(position, target), pitch, marker, enabled: true });
    }
    this.setSpotEnabled('under', false);
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

  /** Raises the car together with the lift carriage. */
  setLiftHeight(h: number): void {
    this.lift.setHeight(h);
    this.vehicle.root.position.y = this.lift.height;
    this.setSpotEnabled('under', this.lift.height > 1.2);
  }

  resetDrainPan(): void {
    this.registry.rehome('drain-pan', this.scene, PAN_HOME.clone());
    this.panOil.visible = false;
    this.panOil.scale.set(1, 1, 1);
  }

  /** Resets every prop, the car and the lift to the start of a lesson run. */
  reset(): void {
    this.vehicle.reset();
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
          parent: this.vehicle.wheels[pos].hub,
          position: new Vector3(),
          quaternion: wheelItem.object.quaternion.clone().identity(),
        };
      }
    }
    this.ppeGlasses.visible = true;
    this.ppeGloves.visible = true;
    this.registry.setItemAvailable('drain-plug', false);
    this.registry.setItemAvailable('oil-bottle', false);
    this.registry.rehome('oil-bottle', this.cart, new Vector3(-0.64, CART_TOP + 0.13, 0.15));
    this.registry.rehome('drain-plug', this.trayPlug, new Vector3());
    for (const jug of this.oilJugs.values()) jug.visible = true;
  }
}
