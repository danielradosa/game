// Seeded pseudo-random number generation for procedural world building.
// Uses mulberry32 — a tiny, fast, dependency-free 32-bit PRNG with a long
// enough period (~2^32) for level generation. Same seed → same world.

export type Rng = () => number

// Hash a string seed (e.g. "drift") into a uint32. xmur3, paired with
// mulberry32, gives a clean text-seed pipeline without bias on the first roll.
export function hashSeed(input: string): number {
  let h = 1779033703 ^ input.length
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return (h ^= h >>> 16) >>> 0
}

export function mulberry32(seed: number): Rng {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Helpers — never write a generator that calls Math.random; pass an Rng in.

export const randInt = (rng: Rng, min: number, max: number): number =>
  Math.floor(rng() * (max - min + 1)) + min

export const randRange = (rng: Rng, min: number, max: number): number => rng() * (max - min) + min

export const pick = <T>(rng: Rng, arr: readonly T[]): T => {
  if (arr.length === 0) throw new Error("pick: empty array")
  return arr[Math.floor(rng() * arr.length)]!
}

// Shuffle in place, Fisher-Yates. Returns the same array for chaining.
export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j]!, arr[i]!]
  }
  return arr
}

// Coin flip — true with probability p (default 0.5). Used for the
// hardmode-vs-destroy roll on delve exit.
export const chance = (rng: Rng, p = 0.5): boolean => rng() < p

// Convenience: a fresh Rng from either a numeric seed or a text seed.
export const seedRng = (seed: number | string): Rng =>
  mulberry32(typeof seed === "string" ? hashSeed(seed) : seed)

// Generate a fresh random seed for a new save. Uses Math.random because we're
// not seeded yet — this is the entry point into determinism.
export const freshSeed = (): number => Math.floor(Math.random() * 0xffffffff)
