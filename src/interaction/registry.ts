import {
  BoxGeometry,
  type BufferGeometry,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type { ItemId, TargetId } from '../lessons/engine/types';

/** userData.pick on a collider says what a ray hit. */
export type PickInfo =
  | { kind: 'target'; id: TargetId }
  | { kind: 'item'; id: ItemId }
  | { kind: 'spot'; id: string }
  | { kind: 'ui'; id: string }
  | { kind: 'floor' };

const COLLIDER_MAT = new MeshBasicMaterial({ visible: false });

/** An invisible mesh that rays can hit. The registry fills in what it picks. */
export function collider(geo: BufferGeometry, pick?: PickInfo): Mesh {
  const m = new Mesh(geo, COLLIDER_MAT);
  if (pick) m.userData.pick = pick;
  return m;
}

export function sphereCollider(r: number, pick?: PickInfo): Mesh {
  return collider(new SphereGeometry(r, 8, 6), pick);
}

export function boxCollider(w: number, h: number, d: number, pick?: PickInfo): Mesh {
  return collider(new BoxGeometry(w, h, d), pick);
}

export interface TargetEntry {
  id: TargetId;
  label: string;
  /** Where highlights and Valkyrie's spotlight point. */
  anchor: Object3D;
  collider: Mesh;
}

export interface ItemEntry {
  id: ItemId;
  /** Visual root; reparented to a hand while held. */
  object: Object3D;
  collider: Mesh;
  home: { parent: Object3D; position: Vector3; quaternion: Quaternion };
  /** Present in the world (e.g. the drain plug only exists once removed). */
  available: boolean;
  /** Offset applied when held, so the tool's working end points forward. */
  grip: { position: Vector3; quaternion: Quaternion };
}

/** Every interactive thing in the world, looked up by id. */
export class Registry {
  readonly targets = new Map<TargetId, TargetEntry>();
  readonly items = new Map<ItemId, ItemEntry>();
  /** Raycast candidates; colliders are toggled through their `visible`-independent `enabled` flag. */
  readonly colliders: Mesh[] = [];
  /** Solid meshes (car body, lift posts, walls) that stop pointer rays. */
  readonly occluders: Mesh[] = [];

  addTarget(id: TargetId, label: string, anchor: Object3D, col: Mesh): TargetEntry {
    col.userData.pick = { kind: 'target', id } satisfies PickInfo;
    col.userData.enabled = true;
    anchor.add(col);
    const entry = { id, label, anchor, collider: col };
    this.targets.set(id, entry);
    this.colliders.push(col);
    return entry;
  }

  addItem(
    id: ItemId,
    object: Object3D,
    col: Mesh,
    grip: { position?: Vector3; quaternion?: Quaternion } = {},
  ): ItemEntry {
    col.userData.pick = { kind: 'item', id } satisfies PickInfo;
    col.userData.enabled = true;
    object.add(col);
    const parent = object.parent ?? new Object3D();
    const entry: ItemEntry = {
      id,
      object,
      collider: col,
      home: { parent, position: object.position.clone(), quaternion: object.quaternion.clone() },
      available: true,
      grip: { position: grip.position ?? new Vector3(), quaternion: grip.quaternion ?? new Quaternion() },
    };
    this.items.set(id, entry);
    this.colliders.push(col);
    return entry;
  }

  addCollider(col: Mesh, pick: PickInfo): void {
    col.userData.pick = pick;
    col.userData.enabled = true;
    this.colliders.push(col);
  }

  addOccluder(...meshes: Mesh[]): void {
    for (const m of meshes) if (!this.occluders.includes(m)) this.occluders.push(m);
  }

  removeOccluder(...meshes: Mesh[]): void {
    for (const m of meshes) {
      const i = this.occluders.indexOf(m);
      if (i >= 0) this.occluders.splice(i, 1);
    }
  }

  removeTarget(id: TargetId): void {
    const t = this.targets.get(id);
    if (!t) return;
    t.collider.removeFromParent();
    this.removeCollider(t.collider);
    this.targets.delete(id);
  }

  removeItem(id: ItemId): void {
    const item = this.items.get(id);
    if (!item) return;
    item.collider.removeFromParent();
    this.removeCollider(item.collider);
    this.items.delete(id);
  }

  removeCollider(col: Mesh): void {
    const i = this.colliders.indexOf(col);
    if (i >= 0) this.colliders.splice(i, 1);
  }

  setItemAvailable(id: ItemId, available: boolean): void {
    const item = this.items.get(id);
    if (!item) return;
    item.available = available;
    item.object.visible = available;
    item.collider.userData.enabled = available;
  }

  /** Moves an item to a new resting place that also becomes its home. */
  rehome(id: ItemId, parent: Object3D, position: Vector3, quaternion?: Quaternion): void {
    const item = this.items.get(id);
    if (!item) return;
    parent.add(item.object);
    item.object.position.copy(position);
    if (quaternion) item.object.quaternion.copy(quaternion);
    item.home = { parent, position: position.clone(), quaternion: item.object.quaternion.clone() };
  }

  /** Returns an item to its home spot. */
  sendHome(id: ItemId): void {
    const item = this.items.get(id);
    if (!item) return;
    item.home.parent.add(item.object);
    item.object.position.copy(item.home.position);
    item.object.quaternion.copy(item.home.quaternion);
    item.object.scale.setScalar(1);
  }

  targetWorldPosition(id: TargetId, out = new Vector3()): Vector3 | null {
    const t = this.targets.get(id);
    if (!t) return null;
    return t.collider.getWorldPosition(out);
  }
}
