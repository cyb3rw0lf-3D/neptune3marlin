import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Quaternion,
  type Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** One shared vertex-colored, flat-shaded material for almost everything. */
export const SOLID = new MeshLambertMaterial({ vertexColors: true, flatShading: true });

export interface Place {
  p?: [number, number, number];
  r?: [number, number, number];
  s?: [number, number, number];
}

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _c = new Color();

/** Bakes a color and transform into a non-indexed geometry ready for merging. */
export function paint(geo: BufferGeometry, color: number, place: Place = {}): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (geo !== g) geo.dispose();
  const [x, y, z] = place.p ?? [0, 0, 0];
  const [rx, ry, rz] = place.r ?? [0, 0, 0];
  const [sx, sy, sz] = place.s ?? [1, 1, 1];
  _m.compose(new Vector3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), new Vector3(sx, sy, sz));
  g.applyMatrix4(_m);
  _c.setHex(color);
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = _c.r;
    colors[i * 3 + 1] = _c.g;
    colors[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

/** Collects painted parts and merges them into a single draw call. */
export class Build {
  parts: BufferGeometry[] = [];

  add(geo: BufferGeometry, color: number, place?: Place): this {
    this.parts.push(paint(geo, color, place));
    return this;
  }

  box(w: number, h: number, d: number, color: number, place?: Place): this {
    return this.add(new BoxGeometry(w, h, d), color, place);
  }

  /** Cylinder along Y by default. */
  cyl(rTop: number, rBottom: number, h: number, segments: number, color: number, place?: Place): this {
    return this.add(new CylinderGeometry(rTop, rBottom, h, segments), color, place);
  }

  sphere(r: number, color: number, place?: Place, w = 8, h = 6): this {
    return this.add(new SphereGeometry(r, w, h), color, place);
  }

  torus(r: number, tube: number, color: number, place?: Place, radial = 6, tubular = 12): this {
    return this.add(new TorusGeometry(r, tube, radial, tubular), color, place);
  }

  extrude(shape: Shape, depth: number, color: number, place?: Place, bevel = 0): this {
    const g = new ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: bevel > 0,
      bevelSize: bevel,
      bevelThickness: bevel,
      bevelSegments: 1,
      curveSegments: 6,
    });
    g.translate(0, 0, -depth / 2);
    return this.add(g, color, place);
  }

  geometry(): BufferGeometry {
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    if (!merged) throw new Error('Nothing to merge');
    return merged;
  }

  mesh(name = ''): Mesh {
    const m = new Mesh(this.geometry(), SOLID);
    m.name = name;
    return m;
  }
}

export function build(): Build {
  return new Build();
}
