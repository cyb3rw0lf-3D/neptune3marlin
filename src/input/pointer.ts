import { Object3D, Ray, Vector2, Vector3 } from 'three';

export type PointerKind = 'controller' | 'hand' | 'transient' | 'mouse' | 'touch';

/**
 * One aiming device: a VR controller, a tracked hand, a Vision Pro gaze+pinch,
 * the mouse or a finger. The interaction system only ever sees pointers.
 */
export class Pointer {
  readonly ray = new Ray(new Vector3(), new Vector3(0, 0, -1));
  /** The device's up vector, used to read wrist twist. */
  readonly up = new Vector3(0, 1, 0);
  readonly stick = new Vector2();
  select = false;
  selectDown = false;
  selectUp = false;
  squeezeDown = false;
  connected = false;
  /** Held items attach here. */
  holdAnchor: Object3D;
  handedness: 'left' | 'right' | 'none' = 'none';

  constructor(
    readonly id: string,
    public kind: PointerKind,
    holdAnchor?: Object3D,
  ) {
    this.holdAnchor = holdAnchor ?? new Object3D();
  }

  /** Can this device measure wrist roll for twist gestures? */
  get canTwist(): boolean {
    return this.kind === 'controller' || this.kind === 'hand';
  }

  /** Clears one-frame edges after the frame has been processed. */
  endFrame(): void {
    this.selectDown = false;
    this.selectUp = false;
    this.squeezeDown = false;
  }

  pressSelect(): void {
    if (!this.select) this.selectDown = true;
    this.select = true;
  }

  releaseSelect(): void {
    if (this.select) this.selectUp = true;
    this.select = false;
  }
}
