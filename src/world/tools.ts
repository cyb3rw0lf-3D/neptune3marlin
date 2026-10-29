import { Group, type Mesh, type Quaternion, Vector3 } from 'three';
import { boxCollider, sphereCollider } from '../interaction/registry';
import { build } from './lowpoly';
import { C } from './palette';

export interface ItemModel {
  object: Group;
  collider: Mesh;
  grip?: { position?: Vector3; quaternion?: Quaternion };
}

const SOCKET_BAND: Record<number, number> = { 10: 0x2f6fd6, 14: 0x3fa65a, 17: 0xf08a24 };

/**
 * Low-poly tool and part models. Tools are modeled with their working end
 * toward -Z, so when held they point where the hand points.
 */
export function buildItemModel(id: string): ItemModel {
  const g = new Group();
  g.name = `item:${id}`;
  const b = build();
  let col: Mesh;

  const ratchet = /^ratchet-(\d+)$/.exec(id);
  if (ratchet) {
    const mm = Number(ratchet[1]);
    b.box(0.026, 0.018, 0.2, C.chrome, { p: [0, 0, 0.05] })
      .box(0.03, 0.022, 0.08, C.black, { p: [0, 0, 0.11] })
      .cyl(0.024, 0.024, 0.026, 10, C.chrome, { p: [0, 0, -0.06] })
      .cyl(0.008 + mm * 0.0007, 0.008 + mm * 0.0007, 0.045, 6, C.steel, {
        p: [0, 0, -0.095],
        r: [Math.PI / 2, 0, 0],
      })
      .cyl(0.0105 + mm * 0.0007, 0.0105 + mm * 0.0007, 0.012, 10, SOCKET_BAND[mm] ?? C.white, {
        p: [0, 0, -0.085],
        r: [Math.PI / 2, 0, 0],
      });
    col = boxCollider(0.08, 0.08, 0.3);
  } else {
    switch (id) {
      case 'filter-wrench':
        b.box(0.024, 0.02, 0.2, C.cartRed, { p: [0, 0, 0.06] }).torus(0.05, 0.007, C.darkSteel, {
          p: [0, 0, -0.08],
          r: [Math.PI / 2, 0, 0],
        });
        col = boxCollider(0.11, 0.08, 0.3);
        break;
      case 'torque-wrench':
        b.box(0.026, 0.026, 0.42, C.chrome, { p: [0, 0, 0.12] })
          .box(0.034, 0.034, 0.12, C.black, { p: [0, 0, 0.27] })
          .cyl(0.03, 0.03, 0.03, 12, C.chrome, { p: [0, 0, -0.1] })
          .cyl(0.016, 0.016, 0.045, 6, C.steel, { p: [0, 0, -0.14], r: [Math.PI / 2, 0, 0] })
          .box(0.04, 0.012, 0.06, C.white, { p: [0, 0.018, 0.05] });
        col = boxCollider(0.07, 0.08, 0.55);
        break;
      case 'impact-wrench':
        b.box(0.07, 0.08, 0.17, C.darkSteel, { p: [0, 0, 0.01] })
          .box(0.045, 0.13, 0.05, C.black, { p: [0, -0.09, 0.06], r: [0.25, 0, 0] })
          .cyl(0.03, 0.03, 0.03, 10, C.black, { p: [0, 0, -0.085], r: [Math.PI / 2, 0, 0] })
          .cyl(0.02, 0.02, 0.05, 6, C.steel, { p: [0, 0, -0.12], r: [Math.PI / 2, 0, 0] })
          .cyl(0.008, 0.008, 0.06, 6, C.safetyYellow, { p: [0, -0.17, 0.08] });
        col = boxCollider(0.11, 0.25, 0.25);
        break;
      case 'tire-gauge':
        b.cyl(0.012, 0.012, 0.13, 8, C.chrome, { p: [0, 0, 0.03], r: [Math.PI / 2, 0, 0] }).cyl(
          0.016,
          0.012,
          0.03,
          8,
          C.black,
          { p: [0, 0, -0.05], r: [Math.PI / 2, 0, 0] },
        );
        col = boxCollider(0.07, 0.07, 0.2);
        break;
      case 'tread-gauge':
        b.cyl(0.011, 0.011, 0.08, 8, C.safetyYellow, { p: [0, 0, 0.01], r: [Math.PI / 2, 0, 0] })
          .box(0.04, 0.008, 0.02, C.chrome, { p: [0, 0, -0.035] })
          .cyl(0.002, 0.002, 0.03, 4, C.chrome, { p: [0, 0, -0.055], r: [Math.PI / 2, 0, 0] });
        col = boxCollider(0.07, 0.07, 0.16);
        break;
      case 'air-chuck':
        b.box(0.024, 0.024, 0.1, C.black, { p: [0, 0, 0.04] })
          .cyl(0.014, 0.01, 0.05, 8, C.copper, { p: [0, 0, -0.035], r: [Math.PI / 2, 0, 0] })
          .torus(0.05, 0.008, C.safetyYellow, { p: [0, 0, 0.13], r: [0, 0, 0] });
        col = boxCollider(0.1, 0.12, 0.26);
        break;
      case 'rag':
        b.box(0.14, 0.02, 0.1, C.rag);
        col = boxCollider(0.16, 0.08, 0.14);
        break;
      case 'new-filter':
        b.cyl(0.047, 0.047, 0.11, 10, C.oilFilter, { r: [Math.PI / 2, 0, 0] }).cyl(0.032, 0.032, 0.012, 10, C.black, {
          p: [0, 0, -0.06],
          r: [Math.PI / 2, 0, 0],
        });
        col = sphereCollider(0.09);
        break;
      case 'new-washer':
        b.torus(0.016, 0.004, C.copper, {}, 4, 10).box(0.06, 0.004, 0.06, C.white, { p: [0, -0.008, 0] });
        col = sphereCollider(0.06);
        break;
      case 'drain-plug':
        b.cyl(0.018, 0.018, 0.022, 6, C.steel).cyl(0.01, 0.01, 0.03, 8, C.steel, { p: [0, 0.025, 0] });
        col = sphereCollider(0.06);
        break;
      case 'drain-pan':
        b.cyl(0.3, 0.26, 0.1, 14, C.black, { p: [0, 0.05, 0] }).cyl(0.26, 0.26, 0.012, 14, C.darkSteel, {
          p: [0, 0.095, 0],
        });
        col = boxCollider(0.6, 0.2, 0.6);
        break;
      case 'oil-bottle':
        b.box(0.12, 0.22, 0.07, C.oilAmber, { p: [0, 0, 0.02] })
          .box(0.12, 0.08, 0.072, C.black, { p: [0, -0.02, 0.02] })
          .cyl(0.018, 0.018, 0.06, 8, C.black, { p: [0, 0.12, -0.03], r: [-0.6, 0, 0] })
          .torus(0.03, 0.008, C.oilAmber, { p: [0, 0.07, 0.06], r: [0, Math.PI / 2, 0] }, 4, 8);
        col = boxCollider(0.16, 0.3, 0.14);
        break;
      default:
        b.box(0.05, 0.05, 0.05, C.white);
        col = boxCollider(0.08, 0.08, 0.08);
    }
  }
  g.add(b.mesh(`model:${id}`));
  return { object: g, collider: col, grip: { position: new Vector3(0, -0.01, -0.02) } };
}
