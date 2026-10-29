import { Group, Object3D, type Vector3 } from 'three';
import { boxCollider, type Registry } from '../interaction/registry';
import { WHEELS, type WheelPos } from '../vehicles/specs';
import { build } from './lowpoly';
import { C } from './palette';

export const RAISE_HEIGHT = 1.62;
const POST_Z = 1.45;
const ARM_Y = 0.13;

interface Arm {
  pos: WheelPos;
  pivot: Group;
  pad: Object3D;
  placedAngle: number;
  parkedAngle: number;
  placed: boolean;
}

/** A two-post lift with four swing arms, a control box and a safety-lock lever. */
export class Lift {
  readonly root = new Group();
  /** Everything that rises with the car (carriages and arms). */
  readonly carriage = new Group();
  readonly controlBox = new Group();
  readonly arms = {} as Record<WheelPos, Arm>;
  height = 0;
  locked = false;
  private lockLever: Object3D;

  constructor(liftPoints: Record<WheelPos, Vector3>) {
    this.root.name = 'lift';
    const posts = build();
    for (const side of [1, -1]) {
      const z = side * POST_Z;
      posts
        .box(0.32, 3.4, 0.32, C.liftBlue, { p: [-0.05, 1.7, z] })
        .box(0.6, 0.06, 0.6, C.darkSteel, { p: [-0.05, 0.03, z] })
        // lock ladder (the steel teeth the lift rests on)
        .box(0.04, 2.4, 0.06, C.darkSteel, { p: [-0.05, 1.4, z - side * 0.18] });
    }
    posts.box(0.25, 0.2, POST_Z * 2 + 0.3, C.liftBlue, { p: [-0.05, 3.5, 0] });
    posts.box(0.08, 0.04, POST_Z * 2, C.safetyYellow, { p: [-0.05, 0.02, 0] });
    this.root.add(posts.mesh('lift-posts'));

    const carriages = build();
    for (const side of [1, -1]) {
      carriages.box(0.4, 0.5, 0.2, C.liftYellow, { p: [-0.05, 0.35, side * (POST_Z - 0.24)] });
    }
    this.carriage.add(carriages.mesh('carriages'));
    this.root.add(this.carriage);

    for (const pos of WHEELS) this.buildArm(pos, liftPoints[pos]);

    // Control box on the passenger-side post, facing the tool cart.
    this.controlBox.position.set(-0.05, 1.15, POST_Z + 0.2);
    const box = build()
      .box(0.28, 0.4, 0.08, C.darkSteel)
      .cyl(0.04, 0.04, 0.03, 10, C.green, { p: [-0.06, 0.08, 0.05], r: [Math.PI / 2, 0, 0] })
      .cyl(0.04, 0.04, 0.03, 10, C.safetyRed, { p: [-0.06, -0.08, 0.05], r: [Math.PI / 2, 0, 0] })
      .mesh('lift-control');
    this.controlBox.add(box);
    const lever = new Group();
    lever.position.set(0.08, 0, 0.05);
    lever.add(
      build()
        .box(0.03, 0.18, 0.03, C.safetyYellow, { p: [0, 0.06, 0] })
        .sphere(0.025, C.black, { p: [0, 0.15, 0] })
        .mesh('lock-lever'),
    );
    this.controlBox.add(lever);
    this.lockLever = lever;
    this.root.add(this.controlBox);
  }

  private buildArm(pos: WheelPos, liftPoint: Vector3): void {
    const side = pos.endsWith('R') ? 1 : -1;
    const front = pos.startsWith('F');
    const pivot = new Group();
    pivot.position.set(-0.05 + (front ? 0.14 : -0.14), ARM_Y, side * (POST_Z - 0.24));
    const dx = liftPoint.x - pivot.position.x;
    const dz = liftPoint.z - pivot.position.z;
    const len = Math.hypot(dx, dz);
    const placedAngle = Math.atan2(-dz, dx);
    // Parked arms swing out alongside the car.
    const parkedAngle = placedAngle + (front ? -1 : 1) * side * 0.9;
    const arm = build()
      .box(len, 0.07, 0.12, C.liftBlue, { p: [len / 2, 0, 0] })
      .cyl(0.06, 0.06, 0.18, 10, C.rubber, { p: [len, 0.1, 0] })
      .mesh(`arm-${pos}`);
    pivot.add(arm);
    const pad = new Object3D();
    pad.position.set(len, 0.15, 0);
    pivot.add(pad);
    pivot.rotation.y = parkedAngle;
    this.carriage.add(pivot);
    this.arms[pos] = { pos, pivot, pad, placedAngle, parkedAngle, placed: false };
  }

  registerTargets(reg: Registry): void {
    for (const pos of WHEELS) {
      reg.addTarget(`lift-arm-${pos}`, `Lift arm, ${pos}`, this.arms[pos].pad, boxCollider(0.3, 0.3, 0.3));
    }
    const up = new Object3D();
    up.position.set(-0.06, 0.08, 0.06);
    this.controlBox.add(up);
    reg.addTarget('lift-up', 'Lift UP button', up, boxCollider(0.1, 0.1, 0.08));
    const down = new Object3D();
    down.position.set(-0.06, -0.08, 0.06);
    this.controlBox.add(down);
    reg.addTarget('lift-down', 'Lift DOWN button', down, boxCollider(0.1, 0.1, 0.08));
    const lock = new Object3D();
    lock.position.set(0.08, 0.08, 0.06);
    this.controlBox.add(lock);
    reg.addTarget('lift-lock', 'Lift safety-lock lever', lock, boxCollider(0.08, 0.2, 0.08));
  }

  setArmPlaced(pos: WheelPos, placed: boolean): void {
    const arm = this.arms[pos];
    arm.placed = placed;
    arm.pivot.rotation.y = placed ? arm.placedAngle : arm.parkedAngle;
  }

  /** Animates an arm swinging from parked to placed (t from 0 to 1). */
  swingArm(pos: WheelPos, t: number): void {
    const arm = this.arms[pos];
    arm.pivot.rotation.y = arm.parkedAngle + (arm.placedAngle - arm.parkedAngle) * t;
  }

  setHeight(h: number): void {
    this.height = Math.max(0, Math.min(RAISE_HEIGHT, h));
    this.carriage.position.y = this.height;
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
    this.lockLever.rotation.z = locked ? -0.6 : 0;
  }

  get allArmsPlaced(): boolean {
    return WHEELS.every((p) => this.arms[p].placed);
  }

  reset(): void {
    for (const pos of WHEELS) this.setArmPlaced(pos, false);
    this.setHeight(0);
    this.setLocked(false);
  }
}
