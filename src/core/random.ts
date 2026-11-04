/** Seeded PRNG (mulberry32) so lesson variants are reproducible in tests. */
export type Rng = () => number;

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)] as T;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** Steps through seeds from `seed` until one is accepted (e.g. a variant that matches a job). */
export function matchingSeed(seed: number, accept: (s: number) => boolean, tries = 400): number {
  for (let i = 0; i < tries; i++) {
    const s = (seed + i * 7919) >>> 0;
    if (accept(s)) return s;
  }
  return seed;
}
