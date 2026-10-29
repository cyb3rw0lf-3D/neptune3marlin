import {
  BackSide,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  type PerspectiveCamera,
  SphereGeometry,
  Vector3,
} from 'three';
import type { SoundFx } from '../audio/sfx';
import type { Tweens } from '../core/tween';
import type { Pointer } from '../input/pointer';

const DESKTOP_EYE = 1.62;
const ROOM = { minX: -6.6, maxX: 6.6, minZ: -5.6, maxZ: 5.6 };
const ARC_POINTS = 40;
const _v = new Vector3();

/**
 * Moving the player: teleporting to work spots or with a thumbstick arc,
 * snap turning, seated height, and desktop walking/looking. The camera only
 * ever moves instantly behind a short fade, which keeps VR comfortable.
 */
export class Locomotion {
  readonly rig = new Group();
  private pitch = 0;
  private readonly fade: Mesh;
  private readonly arc: Line;
  private arcActive = false;
  private arcTarget: Vector3 | null = null;
  private turnLatch = false;
  snapDegrees = 45;
  heightOffset = 0;
  seated = false;
  /** Returns true if a floor point is allowed (not inside the car, inside the room). */
  isFloorAllowed: (p: Vector3) => boolean = () => true;

  constructor(
    readonly camera: PerspectiveCamera,
    private readonly tweens: Tweens,
    private readonly sfx: SoundFx,
  ) {
    this.rig.name = 'rig';
    this.rig.add(camera);
    camera.position.set(0, DESKTOP_EYE, 0);
    this.fade = new Mesh(
      new SphereGeometry(0.3, 12, 8),
      new MeshBasicMaterial({ color: 0x000000, side: BackSide, transparent: true, opacity: 0, depthTest: false }),
    );
    this.fade.renderOrder = 200;
    this.fade.visible = false;
    camera.add(this.fade);

    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(new Float32Array(ARC_POINTS * 3), 3));
    this.arc = new Line(geo, new LineBasicMaterial({ color: 0x3fbf6f }));
    this.arc.frustumCulled = false;
    this.arc.visible = false;
  }

  get arcLine(): Line {
    return this.arc;
  }

  /** Applies seated/height settings. In VR the floor is moved; on desktop the eye height. */
  applyHeight(xr: boolean): void {
    const extra = (this.seated ? 0.45 : 0) + this.heightOffset;
    if (xr) {
      this.rig.position.y = extra;
      this.camera.position.set(0, 0, 0);
    } else {
      this.rig.position.y = 0;
      this.camera.position.set(0, DESKTOP_EYE + (this.seated ? -0.35 : 0) + this.heightOffset, 0);
    }
  }

  /** Yaw of the camera in world space. */
  cameraYaw(): number {
    const dir = this.camera.getWorldDirection(_v);
    return Math.atan2(-dir.x, -dir.z);
  }

  /** Puts the camera (not the rig origin) over a floor point, facing `yaw` if given. */
  placeAt(p: Vector3, yaw?: number): void {
    if (yaw !== undefined) {
      const delta = yaw - this.cameraYaw();
      const cam = this.camera.getWorldPosition(new Vector3());
      this.rotateAround(cam, delta);
    }
    const cam = this.camera.getWorldPosition(new Vector3());
    this.rig.position.x += p.x - cam.x;
    this.rig.position.z += p.z - cam.z;
    this.rig.updateMatrixWorld(true);
  }

  private rotateAround(center: Vector3, angle: number): void {
    const offset = this.rig.position.clone().sub(center);
    offset.applyAxisAngle(new Vector3(0, 1, 0), angle);
    this.rig.position.copy(center).add(offset);
    this.rig.rotation.y += angle;
    this.rig.updateMatrixWorld(true);
  }

  async teleport(p: Vector3, yaw?: number, instant = false): Promise<void> {
    if (instant) {
      this.placeAt(p, yaw);
      return;
    }
    this.sfx.play('teleport');
    const mat = this.fade.material as MeshBasicMaterial;
    this.fade.visible = true;
    await this.tweens.run(0.12, (t) => {
      mat.opacity = t;
    });
    this.placeAt(p, yaw);
    await this.tweens.run(0.18, (t) => {
      mat.opacity = 1 - t;
    });
    this.fade.visible = false;
  }

  snapTurn(dir: 1 | -1): void {
    const cam = this.camera.getWorldPosition(new Vector3());
    this.rotateAround(cam, (-dir * this.snapDegrees * Math.PI) / 180);
  }

  // --- desktop ---

  look(dYaw: number, dPitch: number): void {
    this.rig.rotation.y += dYaw;
    this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch + dPitch));
    this.camera.rotation.set(this.pitch, 0, 0);
  }

  resetPitch(): void {
    this.setPitch(0);
  }

  setPitch(pitch: number): void {
    this.pitch = Math.max(-1.3, Math.min(1.3, pitch));
    this.camera.rotation.set(this.pitch, 0, 0);
  }

  move(forward: number, right: number, dt: number): void {
    const yaw = this.rig.rotation.y;
    const speed = 2.2 * dt;
    const dx = (-Math.sin(yaw) * forward + Math.cos(yaw) * right) * speed;
    const dz = (-Math.cos(yaw) * forward - Math.sin(yaw) * right) * speed;
    const next = this.rig.position.clone().add(new Vector3(dx, 0, dz));
    next.x = Math.max(ROOM.minX, Math.min(ROOM.maxX, next.x));
    next.z = Math.max(ROOM.minZ, Math.min(ROOM.maxZ, next.z));
    if (this.isFloorAllowed(next)) this.rig.position.copy(next);
    else {
      // Slide along whichever axis is still free.
      const sx = this.rig.position.clone().setX(next.x);
      const sz = this.rig.position.clone().setZ(next.z);
      if (this.isFloorAllowed(sx)) this.rig.position.copy(sx);
      else if (this.isFloorAllowed(sz)) this.rig.position.copy(sz);
    }
  }

  // --- VR thumbsticks ---

  /** Left stick forward aims a teleport arc; right stick left/right snap turns. */
  updateSticks(pointers: Pointer[]): void {
    const left = pointers.find((p) => p.connected && p.kind === 'controller' && p.handedness === 'left');
    const right = pointers.find((p) => p.connected && p.kind === 'controller' && p.handedness === 'right');
    if (right) {
      const x = right.stick.x;
      if (Math.abs(x) > 0.7 && !this.turnLatch) {
        this.turnLatch = true;
        this.snapTurn(x > 0 ? 1 : -1);
      } else if (Math.abs(x) < 0.3) this.turnLatch = false;
    }
    if (!left) {
      this.arc.visible = false;
      this.arcActive = false;
      return;
    }
    const y = left.stick.y;
    if (y < -0.7) {
      this.arcActive = true;
      this.computeArc(left);
    } else if (this.arcActive && Math.abs(y) < 0.3) {
      this.arcActive = false;
      this.arc.visible = false;
      if (this.arcTarget) void this.teleport(this.arcTarget);
    }
  }

  private computeArc(p: Pointer): void {
    const pos = this.arc.geometry.getAttribute('position') as Float32BufferAttribute;
    const o = p.ray.origin;
    const v = p.ray.direction.clone().multiplyScalar(6.5);
    let hit: Vector3 | null = null;
    let last = 0;
    for (let i = 0; i < ARC_POINTS; i++) {
      const t = i * 0.04;
      const x = o.x + v.x * t;
      const y = o.y + v.y * t - 4.9 * t * t;
      const z = o.z + v.z * t;
      pos.setXYZ(i, x, Math.max(y, 0.01), z);
      last = i;
      if (y <= 0) {
        hit = new Vector3(x, 0, z);
        break;
      }
    }
    for (let i = last + 1; i < ARC_POINTS; i++) pos.setXYZ(i, pos.getX(last), pos.getY(last), pos.getZ(last));
    pos.needsUpdate = true;
    const ok =
      !!hit &&
      hit.x > ROOM.minX &&
      hit.x < ROOM.maxX &&
      hit.z > ROOM.minZ &&
      hit.z < ROOM.maxZ &&
      this.isFloorAllowed(hit);
    this.arcTarget = ok ? hit : null;
    (this.arc.material as LineBasicMaterial).color.setHex(ok ? 0x3fbf6f : 0xff5c5c);
    this.arc.visible = true;
  }
}
