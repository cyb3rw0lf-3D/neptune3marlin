import {
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import type { SoundFx } from '../audio/sfx';
import { ease, type Tweens } from '../core/tween';
import type { World } from '../world/world';
import type { ConsequenceId } from './engine/types';

interface Particle {
  mesh: Mesh;
  vel: Vector3;
  life: number;
}

/**
 * Short, non-graphic replays of what a mistake would cause in a real shop.
 * The player's camera never moves (comfort); the world reacts around them,
 * then rewinds so the student can try again.
 */
export class ConsequencePlayer {
  private particles: Particle[] = [];
  private readonly flash: Mesh;
  private readonly dropGeo = new SphereGeometry(0.012, 5, 4);
  private readonly sparkGeo = new BoxGeometry(0.01, 0.01, 0.03);
  reducedMotion = false;

  constructor(
    private readonly world: World,
    private readonly tweens: Tweens,
    private readonly sfx: SoundFx,
    private readonly camera: Object3D,
  ) {
    this.flash = new Mesh(
      new PlaneGeometry(2, 2),
      new MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0, depthTest: false }),
    );
    this.flash.position.z = -0.2;
    this.flash.renderOrder = 100;
    this.flash.visible = false;
    camera.add(this.flash);
  }

  async play(id: ConsequenceId, at: Vector3 | null): Promise<void> {
    const where = at ?? this.world.vehicle.root.getWorldPosition(new Vector3()).add(new Vector3(0, 1, 0));
    switch (id) {
      case 'car-drop':
        return this.carDrop();
      case 'car-tilt':
        return this.carTilt();
      case 'oil-spill':
        return this.oilSpill();
      case 'oil-leak':
        return this.oilLeak(where);
      case 'stripped-thread':
        return this.stripped(where);
      case 'eye-splash':
        return this.eyeSplash();
      case 'wheel-wobble':
        return this.wheelWobble();
      case 'overfill':
        return this.foam(where);
      case 'tire-overinflate':
        return this.tireBulge(where);
      default:
        this.sfx.play('error');
        return this.tweens.wait(0.4);
    }
  }

  private async redFlash(strength = 0.45): Promise<void> {
    const mat = this.flash.material as MeshBasicMaterial;
    this.flash.visible = true;
    const peak = this.reducedMotion ? strength * 0.4 : strength;
    await this.tweens.run(0.9, (t) => {
      mat.opacity = peak * (1 - t);
    });
    this.flash.visible = false;
  }

  private async carDrop(): Promise<void> {
    const w = this.world;
    const start = w.lift.height;
    const drop = Math.min(0.5, Math.max(0.15, start * 0.3));
    this.sfx.play('alarm');
    void this.redFlash();
    await this.tweens.run(0.35, (t) => {
      const h = start - drop * ease.in(t);
      w.lift.setHeight(h);
      w.vehicle.root.position.y = h;
      if (!this.reducedMotion) w.vehicle.root.rotation.x = Math.sin(t * 30) * 0.01;
    });
    this.sfx.play('clunk');
    w.vehicle.root.rotation.x = 0;
    await this.tweens.wait(1.4);
    this.sfx.play('lift');
    await this.tweens.run(1.0, (t) => {
      const h = start - drop + drop * ease.inOut(t);
      w.lift.setHeight(h);
      w.vehicle.root.position.y = h;
    });
  }

  private async carTilt(): Promise<void> {
    const car = this.world.vehicle.root;
    this.sfx.play('alarm');
    void this.redFlash();
    await this.tweens.run(0.6, (t) => {
      car.rotation.x = 0.12 * ease.out(t);
      car.position.z = 0.15 * ease.out(t);
    });
    this.sfx.play('clunk');
    await this.tweens.wait(1.3);
    await this.tweens.run(0.8, (t) => {
      car.rotation.x = 0.12 * (1 - ease.inOut(t));
      car.position.z = 0.15 * (1 - ease.inOut(t));
    });
  }

  private oilSource(): Vector3 {
    return this.world.registry.targetWorldPosition('drain-plug') ?? new Vector3(1.78, 0.2, 0.08);
  }

  private async oilSpill(): Promise<void> {
    const w = this.world;
    const src = this.oilSource();
    w.puddle.position.set(src.x, 0.004, src.z);
    w.puddle.visible = true;
    w.puddle.scale.setScalar(0.01);
    w.oilStream.visible = true;
    this.sfx.loop('spill', 'pour', 0.4);
    await this.tweens.run(1.8, (t) => {
      this.placeStream(src, 0);
      w.puddle.scale.setScalar(0.05 + 0.8 * ease.out(t));
    });
    this.sfx.stopLoop('spill');
    w.oilStream.visible = false;
    await this.tweens.wait(1.2);
    await this.tweens.run(0.8, (t) => w.puddle.scale.setScalar(0.85 * (1 - t) + 0.01));
    w.puddle.visible = false;
  }

  /** Stretches the oil stream from a point down to a floor height. */
  placeStream(from: Vector3, toY: number): void {
    const s = this.world.oilStream;
    const len = Math.max(0.01, from.y - toY);
    s.position.set(from.x, toY + len / 2, from.z);
    s.scale.set(1, len, 1);
  }

  private async oilLeak(at: Vector3): Promise<void> {
    const w = this.world;
    w.puddle.position.set(at.x, 0.004, at.z);
    w.puddle.visible = true;
    w.puddle.scale.setScalar(0.01);
    const mat = new MeshLambertMaterial({ color: 0x3b2a12 });
    await this.tweens.run(2.2, (t) => {
      if (Math.random() < 0.25) this.spawn(at, new Vector3(0, -0.2, 0), mat, this.dropGeo, 1.5);
      w.puddle.scale.setScalar(0.02 + 0.28 * t);
    });
    await this.tweens.wait(0.8);
    w.puddle.visible = false;
  }

  private async stripped(at: Vector3): Promise<void> {
    this.sfx.play('spark');
    this.sfx.play('clunk');
    void this.redFlash(0.25);
    const mat = new MeshBasicMaterial({ color: 0xffc04d });
    for (let i = 0; i < 18; i++) {
      const v = new Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.2, (Math.random() - 0.5) * 1.5);
      this.spawn(at, v, mat, this.sparkGeo, 0.7);
    }
    await this.tweens.wait(1.6);
  }

  private async eyeSplash(): Promise<void> {
    const cam = this.camera.getWorldPosition(new Vector3());
    const dir = this.camera.getWorldDirection(new Vector3());
    const from = cam
      .clone()
      .addScaledVector(dir, 1.2)
      .add(new Vector3(0, 0.3, 0));
    const mat = new MeshLambertMaterial({ color: 0x3b2a12 });
    for (let i = 0; i < 14; i++) {
      const v = cam.clone().sub(from).normalize().multiplyScalar(2.2);
      v.x += (Math.random() - 0.5) * 0.6;
      v.y += Math.random() * 0.4;
      this.spawn(from, v, mat, this.dropGeo, 0.6);
    }
    this.sfx.play('error');
    await this.tweens.wait(0.45);
    const mat2 = this.flash.material as MeshBasicMaterial;
    mat2.color.setHex(0x2a1e0c);
    await this.redFlash(0.7);
    mat2.color.setHex(0xff3b30);
    await this.tweens.wait(0.6);
  }

  private async wheelWobble(): Promise<void> {
    const hub = this.world.vehicle.wheels.FL;
    const wheel = hub.mounted ? this.world.vehicle.wheelParts[hub.mounted].group : null;
    this.sfx.play('clunk');
    await this.tweens.run(2.2, (t) => {
      if (!wheel) return;
      const amp = this.reducedMotion ? 0.03 : 0.09;
      wheel.rotation.x = Math.sin(t * 40) * amp * (1 - t * 0.3);
      wheel.position.z = hub.side * 0.04 * ease.out(t);
    });
    if (wheel) {
      wheel.rotation.x = 0;
      wheel.position.z = 0;
    }
    void this.redFlash(0.3);
    await this.tweens.wait(0.6);
  }

  private async foam(at: Vector3): Promise<void> {
    const mat = new MeshLambertMaterial({ color: 0xe8dcc0 });
    this.sfx.play('error');
    await this.tweens.run(1.6, () => {
      if (Math.random() < 0.6) {
        const v = new Vector3((Math.random() - 0.5) * 0.2, 0.25 + Math.random() * 0.2, (Math.random() - 0.5) * 0.2);
        this.spawn(at, v, mat, this.dropGeo, 0.8, 0.2);
      }
    });
  }

  private async tireBulge(at: Vector3): Promise<void> {
    const hubs = Object.values(this.world.vehicle.wheels);
    let nearest = hubs[0];
    let best = Number.POSITIVE_INFINITY;
    for (const h of hubs) {
      const d = h.hub.getWorldPosition(new Vector3()).distanceTo(at);
      if (d < best) {
        best = d;
        nearest = h;
      }
    }
    const wheel = nearest?.mounted ? this.world.vehicle.wheelParts[nearest.mounted].group : null;
    this.sfx.play('hiss');
    await this.tweens.run(0.6, (t) => wheel?.scale.set(1 + 0.08 * t, 1 + 0.08 * t, 1 + 0.15 * t));
    await this.tweens.wait(0.6);
    this.sfx.play('hiss');
    await this.tweens.run(0.6, (t) => wheel?.scale.set(1.08 - 0.08 * t, 1.08 - 0.08 * t, 1.15 - 0.15 * t));
  }

  private spawn(
    at: Vector3,
    vel: Vector3,
    mat: MeshBasicMaterial | MeshLambertMaterial,
    geo: SphereGeometry | BoxGeometry,
    life: number,
    gravity = 1,
  ): void {
    const mesh = new Mesh(geo, mat);
    mesh.position.copy(at);
    mesh.userData.gravity = gravity;
    this.world.scene.add(mesh);
    this.particles.push({ mesh, vel: vel.clone(), life });
  }

  update(dt: number): void {
    if (this.particles.length === 0) return;
    for (const p of this.particles) {
      p.life -= dt;
      p.vel.y -= 9.8 * dt * (p.mesh.userData.gravity as number);
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.mesh.position.y < 0.005) {
        p.mesh.position.y = 0.005;
        p.vel.set(0, 0, 0);
      }
    }
    const dead = this.particles.filter((p) => p.life <= 0);
    for (const p of dead) this.world.scene.remove(p.mesh);
    this.particles = this.particles.filter((p) => p.life > 0);
  }
}
