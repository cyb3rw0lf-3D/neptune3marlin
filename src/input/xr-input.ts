import {
  BufferGeometry,
  Float32BufferAttribute,
  type Group,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  RingGeometry,
  Vector3,
  type WebGLRenderer,
  type XRTargetRaySpace,
} from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { build } from '../world/lowpoly';
import { C } from '../world/palette';
import { Pointer } from './pointer';

const _m = new Matrix4();

/** A pointer's laser line and the reticle where it hits something. */
export class PointerVisual {
  readonly line: Line;
  readonly reticle: Mesh;
  constructor(parent: Object3D, scene: Object3D) {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 0, -1], 3));
    this.line = new Line(geo, new LineBasicMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.8 }));
    this.line.name = 'laser';
    parent.add(this.line);
    this.reticle = new Mesh(
      new RingGeometry(0.012, 0.02, 16),
      new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false }),
    );
    this.reticle.renderOrder = 20;
    this.reticle.visible = false;
    scene.add(this.reticle);
  }

  update(length: number, hitPoint: Vector3 | null, camera: Object3D, color: number): void {
    this.line.scale.z = length;
    (this.line.material as LineBasicMaterial).color.setHex(color);
    if (hitPoint) {
      this.reticle.visible = true;
      this.reticle.position.copy(hitPoint);
      this.reticle.lookAt(camera.getWorldPosition(new Vector3()));
    } else {
      this.reticle.visible = false;
    }
  }

  setVisible(v: boolean): void {
    this.line.visible = v;
    if (!v) this.reticle.visible = false;
  }
}

/** A purple nitrile-glove hand shown on each controller. */
function gloveModel(handedness: 'left' | 'right'): Object3D {
  const s = handedness === 'left' ? -1 : 1;
  const b = build()
    .box(0.06, 0.022, 0.07, C.glove, { p: [0, -0.012, 0.035] })
    .box(0.014, 0.016, 0.045, C.glove, { p: [s * -0.036, -0.008, 0.012], r: [0, s * 0.7, 0] });
  // Four curled fingers wrapped around the controller grip.
  for (let i = 0; i < 4; i++) {
    b.box(0.013, 0.016, 0.034, C.glove, { p: [s * (0.022 - i * 0.0145), -0.03, -0.004], r: [0.9, 0, 0] });
  }
  return b.mesh(`glove-${handedness}`);
}

/**
 * Reads WebXR controllers, tracked hands and transient pointers (Vision Pro
 * gaze + pinch) into two Pointers. Thumbsticks feed locomotion.
 */
export class XRInput {
  readonly pointers: Pointer[] = [];
  readonly visuals: PointerVisual[] = [];
  private controllers: XRTargetRaySpace[] = [];
  private grips: Group[] = [];

  constructor(renderer: WebGLRenderer, rig: Object3D, scene: Object3D) {
    const handFactory = new XRHandModelFactory();
    for (let i = 0; i < 2; i++) {
      const controller = renderer.xr.getController(i);
      const grip = renderer.xr.getControllerGrip(i);
      const hand = renderer.xr.getHand(i);
      rig.add(controller, grip, hand);
      this.controllers.push(controller);
      this.grips.push(grip);
      const pointer = new Pointer(`xr-${i}`, 'controller', controller);
      this.pointers.push(pointer);
      this.visuals.push(new PointerVisual(controller, scene));
      const handModel = handFactory.createHandModel(hand, 'boxes');
      hand.add(handModel);

      controller.addEventListener('connected', (event) => {
        const source = (event as unknown as { data: XRInputSource }).data;
        pointer.connected = true;
        pointer.handedness = source.handedness === 'left' ? 'left' : source.handedness === 'right' ? 'right' : 'none';
        pointer.kind = source.targetRayMode === 'transient-pointer' ? 'transient' : source.hand ? 'hand' : 'controller';
        grip.clear();
        if (pointer.kind === 'controller') grip.add(gloveModel(pointer.handedness === 'left' ? 'left' : 'right'));
        (controller.userData as { source?: XRInputSource }).source = source;
      });
      controller.addEventListener('disconnected', () => {
        pointer.connected = false;
        pointer.releaseSelect();
        pointer.stick.set(0, 0);
        (controller.userData as { source?: XRInputSource }).source = undefined;
      });
      controller.addEventListener('selectstart', () => pointer.pressSelect());
      controller.addEventListener('selectend', () => pointer.releaseSelect());
      controller.addEventListener('squeezestart', () => {
        pointer.squeezeDown = true;
      });
    }
  }

  update(): void {
    for (let i = 0; i < 2; i++) {
      const controller = this.controllers[i] as XRTargetRaySpace;
      const pointer = this.pointers[i] as Pointer;
      if (!pointer.connected) continue;
      controller.updateMatrixWorld(true);
      _m.copy(controller.matrixWorld);
      pointer.ray.origin.setFromMatrixPosition(_m);
      pointer.ray.direction.set(0, 0, -1).transformDirection(_m);
      pointer.up.set(0, 1, 0).transformDirection(_m);
      const source = (controller.userData as { source?: XRInputSource }).source;
      const axes = source?.gamepad?.axes;
      if (axes && axes.length >= 4) pointer.stick.set(axes[2] ?? 0, axes[3] ?? 0);
      else pointer.stick.set(0, 0);
    }
  }

  get anyConnected(): boolean {
    return this.pointers.some((p) => p.connected);
  }
}
