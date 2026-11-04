import { Group, type Mesh } from 'three';
import { build } from './lowpoly';

interface Look {
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  /** 0 short, 1 long, 2 cap, 3 bun */
  hairStyle: number;
  height: number;
}

/** Six body presets so each regular customer is recognizable. */
const LOOKS: Look[] = [
  { skin: 0xc68a63, hair: 0x2a1d17, shirt: 0x3f7dd8, pants: 0x2f3542, hairStyle: 1, height: 1.0 },
  { skin: 0xe2b48f, hair: 0x8a8a8a, shirt: 0x6c8b3a, pants: 0x5a4632, hairStyle: 2, height: 1.04 },
  { skin: 0x8d5a3b, hair: 0x15100d, shirt: 0xd8573f, pants: 0x30343c, hairStyle: 3, height: 0.97 },
  { skin: 0xf0c9a8, hair: 0xb87d3a, shirt: 0x7a5bc4, pants: 0x3a4a5c, hairStyle: 0, height: 1.06 },
  { skin: 0xa86f4c, hair: 0x2b1b12, shirt: 0xf0b33c, pants: 0x2d2f36, hairStyle: 1, height: 0.95 },
  { skin: 0x6e4630, hair: 0x101010, shirt: 0x2f9e8f, pants: 0x444a52, hairStyle: 0, height: 1.02 },
];

/**
 * A low-poly customer: one merged body mesh plus a head that nods while they
 * talk. Two draw calls each. They face +z in their local frame.
 */
export class Customer {
  readonly root = new Group();
  private readonly head: Mesh;
  private talkUntil = 0;
  private time = 0;

  constructor(look: number) {
    const l = LOOKS[look % LOOKS.length] as Look;
    this.root.name = 'customer';
    const s = l.height;
    const body = build()
      // legs and shoes
      .box(0.13, 0.82 * s, 0.15, l.pants, { p: [-0.08, 0.41 * s, 0] })
      .box(0.13, 0.82 * s, 0.15, l.pants, { p: [0.08, 0.41 * s, 0] })
      .box(0.14, 0.07, 0.24, 0x2a2a2e, { p: [-0.08, 0.035, 0.04] })
      .box(0.14, 0.07, 0.24, 0x2a2a2e, { p: [0.08, 0.035, 0.04] })
      // torso, arms and hands
      .box(0.38, 0.6 * s, 0.22, l.shirt, { p: [0, 1.12 * s, 0] })
      .box(0.1, 0.56 * s, 0.11, l.shirt, { p: [-0.25, 1.1 * s, 0], r: [0, 0, 0.06] })
      .box(0.1, 0.56 * s, 0.11, l.shirt, { p: [0.25, 1.1 * s, 0], r: [0, 0, -0.06] })
      .box(0.08, 0.09, 0.09, l.skin, { p: [-0.27, 0.78 * s, 0] })
      .box(0.08, 0.09, 0.09, l.skin, { p: [0.27, 0.78 * s, 0] })
      .box(0.1, 0.08, 0.1, l.skin, { p: [0, 1.46 * s, 0] })
      .mesh('customer-body');
    this.root.add(body);

    const hb = build().box(0.22, 0.26, 0.24, l.skin, { p: [0, 0.13, 0] });
    if (l.hairStyle === 0) hb.box(0.24, 0.07, 0.26, l.hair, { p: [0, 0.27, -0.01] });
    if (l.hairStyle === 1)
      hb.box(0.25, 0.3, 0.12, l.hair, { p: [0, 0.14, -0.09] }).box(0.24, 0.07, 0.26, l.hair, { p: [0, 0.27, 0] });
    if (l.hairStyle === 2)
      hb.box(0.25, 0.08, 0.27, 0x264e86, { p: [0, 0.28, 0] }).box(0.22, 0.03, 0.14, 0x264e86, { p: [0, 0.25, 0.17] });
    if (l.hairStyle === 3)
      hb.box(0.24, 0.07, 0.26, l.hair, { p: [0, 0.27, 0] }).sphere(0.08, l.hair, { p: [0, 0.3, -0.13] });
    // eyes
    hb.box(0.035, 0.035, 0.01, 0x1b1b1b, { p: [-0.05, 0.16, 0.121] }).box(0.035, 0.035, 0.01, 0x1b1b1b, {
      p: [0.05, 0.16, 0.121],
    });
    this.head = hb.mesh('customer-head');
    this.head.position.y = 1.5 * s;
    this.root.add(this.head);
  }

  /** Nods for a few seconds while a line plays. */
  talk(seconds: number): void {
    this.talkUntil = this.time + seconds;
  }

  update(dt: number, walking: boolean): void {
    this.time += dt;
    const talking = this.time < this.talkUntil;
    this.head.rotation.x = talking ? Math.sin(this.time * 9) * 0.06 : Math.sin(this.time * 0.8) * 0.02;
    this.head.rotation.y = talking ? Math.sin(this.time * 2.3) * 0.08 : 0;
    this.root.children[0]?.position.set(0, walking ? Math.abs(Math.sin(this.time * 7)) * 0.03 : 0, 0);
  }
}
