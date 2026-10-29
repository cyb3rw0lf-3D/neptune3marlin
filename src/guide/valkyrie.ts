import {
  AdditiveBlending,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { build } from '../world/lowpoly';
import { C } from '../world/palette';

export type Mood = 'happy' | 'thinking' | 'concerned' | 'alarm';

const MOOD_COLOR: Record<Mood, number> = {
  happy: 0x37e0d0,
  thinking: 0x7fb8ff,
  concerned: 0xffb02e,
  alarm: 0xff4a4a,
};

const _v = new Vector3();
const _q = new Quaternion();
const UP = new Vector3(0, 1, 0);

/**
 * Valkyrie, the shop's robot drone. She hovers near the student, flies to the
 * part being discussed and lights it up with a spotlight beam.
 */
export class Valkyrie {
  readonly root = new Group();
  private readonly eyeMat = new MeshBasicMaterial({ color: MOOD_COLOR.happy });
  private readonly rotors: Object3D[] = [];
  private readonly beam: Mesh;
  private readonly beamMat = new MeshBasicMaterial({
    color: 0x7fe9ff,
    transparent: true,
    opacity: 0.22,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  private goal = new Vector3(0, 1.8, 2.5);
  private pointAt: Vector3 | null = null;
  private time = 0;
  /** When true she stays near the student instead of flying to targets. */
  private parked = true;

  constructor() {
    this.root.name = 'valkyrie';
    const body = build()
      .cyl(0.13, 0.15, 0.08, 6, C.valkyrie)
      .cyl(0.1, 0.13, 0.06, 6, C.valkyrieAccent, { p: [0, 0.07, 0] })
      .sphere(0.07, C.valkyrie, { p: [0, 0.1, 0] }, 8, 5)
      .box(0.42, 0.025, 0.04, C.darkSteel, { r: [0, Math.PI / 4, 0] })
      .box(0.42, 0.025, 0.04, C.darkSteel, { r: [0, -Math.PI / 4, 0] })
      .cyl(0.03, 0.03, 0.05, 6, C.darkSteel, { p: [0, -0.06, 0] })
      .mesh('valkyrie-body');
    this.root.add(body);

    const eye = new Mesh(new CylinderGeometry(0.045, 0.045, 0.02, 12).rotateX(Math.PI / 2), this.eyeMat);
    eye.position.set(0, 0.01, -0.145);
    this.root.add(eye);
    const pupil = build()
      .cyl(0.018, 0.018, 0.022, 8, C.black, { r: [Math.PI / 2, 0, 0] })
      .mesh('pupil');
    pupil.position.set(0, 0.01, -0.152);
    this.root.add(pupil);

    for (const [x, z] of [
      [0.15, 0.15],
      [-0.15, 0.15],
      [0.15, -0.15],
      [-0.15, -0.15],
    ] as const) {
      const rotor = build()
        .box(0.16, 0.006, 0.02, 0x2b2d30)
        .box(0.02, 0.006, 0.16, 0x2b2d30)
        .cyl(0.085, 0.085, 0.004, 10, 0x9aa3ab)
        .mesh('rotor');
      rotor.position.set(x, 0.03, z);
      (rotor.material as MeshBasicMaterial).transparent = false;
      this.root.add(rotor);
      this.rotors.push(rotor);
    }

    this.beam = new Mesh(new CylinderGeometry(0.01, 0.07, 1, 12, 1, true), this.beamMat);
    this.beam.visible = false;
    this.beam.renderOrder = 5;
  }

  /** The beam lives in world space so it can reach any target. */
  attach(scene: Object3D): void {
    scene.add(this.root);
    scene.add(this.beam);
  }

  setMood(mood: Mood): void {
    this.eyeMat.color.setHex(MOOD_COLOR[mood]);
  }

  /** Fly to a part and spotlight it. Pass null to come back to the student. */
  showTarget(p: Vector3 | null, camera: Object3D): void {
    if (!p) {
      this.pointAt = null;
      this.parked = true;
      return;
    }
    this.parked = false;
    this.pointAt = p.clone();
    const cam = camera.getWorldPosition(_v.clone());
    const toCam = cam.sub(p).setY(0);
    if (toCam.lengthSq() < 1e-4) toCam.set(0, 0, 1);
    toCam.normalize().multiplyScalar(0.55);
    this.goal
      .copy(p)
      .add(toCam)
      .add(new Vector3(0, 0.45, 0));
    this.goal.y = Math.max(0.5, Math.min(3.6, this.goal.y));
  }

  /** Teleport next to the student (after teleports and at lesson start). */
  snapHome(camera: Object3D): void {
    this.homePosition(camera, this.goal);
    this.root.position.copy(this.goal);
  }

  private homePosition(camera: Object3D, out: Vector3): void {
    camera.getWorldPosition(out);
    const fwd = camera.getWorldDirection(_v).setY(0);
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    const left = new Vector3(fwd.z, 0, -fwd.x);
    out.addScaledVector(fwd, 1.1).addScaledVector(left, 0.95);
    out.y += 0.4;
  }

  update(dt: number, camera: Object3D): void {
    this.time += dt;
    if (this.parked) this.homePosition(camera, this.goal);
    const k = 1 - Math.exp(-dt * (this.parked ? 2.2 : 3.2));
    this.root.position.lerp(this.goal, k);
    this.root.position.y += Math.sin(this.time * 2.2) * 0.0015;

    // Face what she is pointing at, or the student.
    const look = this.pointAt ?? camera.getWorldPosition(new Vector3());
    const dir = _v.copy(look).sub(this.root.position);
    dir.y = 0;
    if (dir.lengthSq() > 1e-4) {
      const yaw = Math.atan2(-dir.x, -dir.z);
      _q.setFromAxisAngle(UP, yaw);
      this.root.quaternion.slerp(_q, 1 - Math.exp(-dt * 6));
    }
    for (const r of this.rotors) r.rotation.y += dt * 40;

    if (this.pointAt && this.root.position.distanceTo(this.goal) < 0.4) {
      const from = this.root.position;
      const to = this.pointAt;
      const len = from.distanceTo(to);
      this.beam.visible = true;
      this.beam.position.copy(from).add(to).multiplyScalar(0.5);
      this.beam.scale.set(1, len, 1);
      const d = _v.copy(from).sub(to).normalize();
      this.beam.quaternion.setFromUnitVectors(UP, d);
      this.beamMat.opacity = 0.09 + Math.sin(this.time * 4) * 0.03;
    } else {
      this.beam.visible = false;
    }
  }
}
