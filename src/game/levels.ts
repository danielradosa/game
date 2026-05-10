import { TILE_SIZE } from "@/game/constants"
import { chance, randInt, seedRng } from "@/game/rng"
import type {
  DelveLevel,
  EnemySpawn,
  EnemyType,
  OverworldLevel,
  TileChar,
} from "@/game/types/physics"

// Plat / cell coordinate tables. Typed as fixed-arity tuples so destructuring
// gives proper `number`s rather than `number | undefined` under
// `noUncheckedIndexedAccess`.
type PlatRow = [px: number, py: number, pw: number]
type CellRow = [x: number, y: number]

// Procedural overworld. Seeded heightmap + randomized NPC / portal / cell /
// platform placement. Same dimensions as buildOverworld so renderer and
// camera don't need adjustment. Constraints kept light:
//   - Heightmap stays in [8, 20] so platforms above ground are reachable
//   - NPC placed at a flat spot (3-tile flat run) so the dialog "[E] Talk"
//     prompt is visible and the player doesn't slide off
//   - Portals spaced ≥ 15 tiles apart so they're distinguishable in the HUD
export function generateOverworld(seed: number): OverworldLevel {
  const rng = seedRng(seed)
  // World size in TILES doubled to compensate for TILE_SIZE shrinking 36→16.
  // Physical size stays roughly the same (~10% smaller from the non-perfect
  // ratio); player feels appropriately ~2 tiles tall instead of <1 tile.
  const W = 220,
    H = 44
  const m: TileChar[][] = Array.from({ length: H }, () => Array<TileChar>(W).fill(" "))

  // Heightmap: two seeded sine layers + a couple of mesa plateaus at random
  // x-bands so each world has visually distinct terrain. Sine frequencies
  // halved so the same hills/valleys span the doubled tile-count; amplitudes
  // doubled so the variation matches the same physical pixel range.
  const phase1 = rng() * Math.PI * 2
  const phase2 = rng() * Math.PI * 2
  const amp1 = 1 + rng() * 1.2
  const amp2 = 1 + rng() * 1.2
  const mesas: { from: number; to: number; y: number }[] = []
  const mesaCount = randInt(rng, 2, 4)
  for (let i = 0; i < mesaCount; i++) {
    const from = randInt(rng, 16, W - 36)
    const to = from + randInt(rng, 12, 24)
    const y = randInt(rng, 18, 36)
    mesas.push({ from, to, y })
  }

  const g: number[] = []
  for (let x = 0; x < W; x++) {
    let y = 32
    y += Math.round(Math.sin(x * 0.045 + phase1) * 3 * amp1)
    y += Math.round(Math.cos(x * 0.0225 + phase2) * 2.8 * amp2)
    for (const mesa of mesas) {
      if (x >= mesa.from && x < mesa.to) y = mesa.y
    }
    g.push(Math.max(16, Math.min(40, y)))
  }

  for (let x = 0; x < W; x++) for (let y = g[x]!; y < H; y++) m[y]![x] = "#"

  // Helper: is a 3-tile span flat? Used for NPC and portal placement so
  // entities don't end up dangling on a 1-tile peak.
  const isFlat3 = (x: number): boolean =>
    x >= 1 && x <= W - 2 && g[x - 1] === g[x] && g[x] === g[x + 1]

  // Pick distinct anchored spots: NPC + 6 portals, each on a flat-3 patch
  // and spaced apart so they're not crowded together. Spacing relaxes from
  // 12 → 8 to fit the extra portals comfortably across the same world width.
  const taken: number[] = []
  const findFlatSpot = (range: [number, number], minDist = 8): number | null => {
    const [lo, hi] = range
    for (let attempts = 0; attempts < 80; attempts++) {
      const x = randInt(rng, lo, hi)
      if (!isFlat3(x)) continue
      if (taken.some((t) => Math.abs(t - x) < minDist)) continue
      taken.push(x)
      return x
    }
    return null
  }

  const npcX = findFlatSpot([16, 60], 24) ?? 20
  m[g[npcX]! - 1]![npcX] = "n"

  // Merchant — placed somewhere in the middle bands so the player encounters
  // them naturally on the way to a portal. Independent flat-spot search; the
  // taken[] de-dupe makes sure they're not on top of the Elder or a portal.
  const merchantX = findFlatSpot([70, 180], 24) ?? 100
  m[g[merchantX]! - 1]![merchantX] = "M"

  // Try for 6 portals across the width. If a band fails (too few flats), the
  // returned null is replaced with a fallback x in that band. Bumped from 4
  // in Phase C — pairs with the Rebirth dialog which rerolls the world when
  // every portal in s.portals is destroyed.
  const portalBands: [number, number][] = [
    [64, 88],
    [88, 112],
    [112, 136],
    [136, 160],
    [160, 184],
    [184, 210],
  ]
  for (const band of portalBands) {
    const px = findFlatSpot(band) ?? band[0]
    m[g[px]! - 1]![px] = "p"
  }

  // Floating platforms — count scales with W. Each placed at a random x where
  // the platform height clears the ground by at least 6 tiles so it's not
  // buried inside a hill (was 3 before tile size was halved).
  const platCount = randInt(rng, 16, 28)
  for (let i = 0; i < platCount; i++) {
    const len = randInt(rng, 6, 10)
    const x = randInt(rng, 8, W - len - 8)
    const groundY = Math.min(...g.slice(x, x + len))
    if (groundY === undefined) continue
    const y = randInt(rng, Math.max(8, groundY - 16), groundY - 6)
    for (let j = 0; j < len; j++) {
      const row = m[y]
      if (row && x + j < W && row[x + j] === " ") row[x + j] = "="
    }
  }

  // Cells scattered: half on platforms (above the platform tile), half on
  // open air just above ground level. Counts scale with W.
  const cellCount = randInt(rng, 16, 28)
  for (let i = 0; i < cellCount; i++) {
    const x = randInt(rng, 8, W - 10)
    // Try to find a "=" platform in this column to perch on; else float
    // above the ground.
    let placedY = -1
    for (let y = 8; y < H - 4; y++) {
      if (m[y]?.[x] === "=" && m[y - 1]?.[x] === " ") {
        placedY = y - 1
        break
      }
    }
    if (placedY === -1) {
      placedY = g[x]! - randInt(rng, 2, 6)
    }
    if (placedY > 1 && m[placedY]?.[x] === " ") {
      m[placedY]![x] = "c"
    }
  }

  // Spawn at the leftmost flat patch the player can stand on without sliding.
  let spawnX = 6
  for (let x = 4; x < 20; x++) {
    if (isFlat3(x)) {
      spawnX = x
      break
    }
  }

  return {
    map: m,
    W,
    H,
    spawn: { x: spawnX * TILE_SIZE, y: (g[spawnX]! - 3) * TILE_SIZE },
    ground: g,
    theme: "over",
  }
}

export function buildOverworld(): OverworldLevel {
  const W = 110,
    H = 22
  const m: TileChar[][] = Array.from({ length: H }, () => Array<TileChar>(W).fill(" "))

  // Ground heightmap. Values are guaranteed populated for every x in [0, W).
  const g: number[] = []
  for (let x = 0; x < W; x++) {
    let y = 16
    y += Math.round(Math.sin(x * 0.09) * 1.5)
    y += Math.round(Math.cos(x * 0.045) * 1.4)
    if (x >= 26 && x < 34) y = 13
    if (x >= 50 && x < 58) y = 18
    if (x >= 68 && x < 80) y = 9
    if (x >= 95 && x < 105) y = 14
    g.push(Math.max(8, Math.min(20, y)))
  }

  // Fill solid ground from the heightmap downward. `g[x]!` and `m[y]!` are
  // safe by construction: we just pushed exactly W entries to g, and m has
  // H rows of W cells each.
  for (let x = 0; x < W; x++) for (let y = g[x]!; y < H; y++) m[y]![x] = "#"

  const plats: PlatRow[] = [
    [10, 13, 3],
    [16, 11, 3],
    [22, 9, 4],
    [38, 14, 3],
    [44, 12, 3],
    [50, 10, 4],
    [60, 11, 3],
    [64, 9, 3],
    [70, 7, 4],
    [85, 11, 3],
    [92, 13, 4],
    [100, 12, 3],
  ]
  plats.forEach(([px, py, pw]) => {
    for (let i = 0; i < pw; i++) {
      const row = m[py]
      if (row && px + i < W && row[px + i] === " ") row[px + i] = "="
    }
  })

  const cells: CellRow[] = [
    [12, 12],
    [23, 8],
    [44, 11],
    [51, 9],
    [65, 8],
    [74, 6],
    [86, 10],
    [101, 11],
    [33, 12],
    [55, 17],
  ]
  cells.forEach(([x, y]) => {
    const row = m[y]
    if (row) row[x] = "c"
  })

  // NPC + portal markers. Bounds are hand-checked against the heightmap.
  m[g[6]! - 1]![6] = "n"
  // Multiple delve portals across the overworld. Each has independent state
  // (seed, tier, fresh/destroyed) tracked in GameState.portals, keyed by
  // "<tx>,<ty>". Spread out so a destroyed roll doesn't end the run.
  for (const px of [30, 60, 85, 105]) {
    m[g[px]! - 1]![px] = "p"
  }

  return {
    map: m,
    W,
    H,
    spawn: { x: 3 * TILE_SIZE, y: (g[3]! - 3) * TILE_SIZE },
    ground: g,
    theme: "over",
  }
}

export function buildDelve(): DelveLevel {
  const W = 24,
    H = 30
  const m: TileChar[][] = Array.from({ length: H }, () => Array<TileChar>(W).fill(" "))

  // Outer walls.
  for (let x = 0; x < W; x++) {
    m[H - 1]![x] = "#"
    m[0]![x] = "#"
  }
  for (let y = 0; y < H; y++) {
    m[y]![0] = "#"
    m[y]![W - 1] = "#"
  }

  const plats: PlatRow[] = [
    [3, 26, 5],
    [13, 24, 5],
    [4, 21, 4],
    [15, 19, 4],
    [3, 16, 5],
    [13, 13, 4],
    [5, 10, 4],
    [14, 7, 5],
    [3, 4, 6],
  ]
  plats.forEach(([px, py, pw]) => {
    for (let i = 0; i < pw; i++) m[py]![px + i] = "="
  })

  const cells: CellRow[] = [
    [15, 25],
    [5, 20],
    [16, 18],
    [4, 15],
    [15, 12],
    [5, 9],
    [15, 6],
  ]
  cells.forEach(([x, y]) => {
    m[y]![x] = "c"
  })

  m[3]![12] = "C"
  m[H - 2]![2] = "r"

  // Ghost enemies float toward the player — no terrain collision (intentional:
  // they pass through walls, keeping the AI trivially small for v1).
  const enemySpawns: EnemySpawn[] = [
    { type: "ghost", x: 8 * TILE_SIZE, y: 25 * TILE_SIZE },
    { type: "ghost", x: 10 * TILE_SIZE, y: 17 * TILE_SIZE },
    { type: "ghost", x: 8 * TILE_SIZE, y: 11 * TILE_SIZE },
    { type: "ghost", x: 12 * TILE_SIZE, y: 5 * TILE_SIZE },
  ]

  return {
    map: m,
    W,
    H,
    spawn: { x: 4 * TILE_SIZE, y: (H - 3) * TILE_SIZE },
    theme: "delve",
    enemySpawns,
    seed: 0,
    tier: 0,
  }
}

// Procedurally generate a delve as a horizontal sidescroll corridor. Width,
// platform count, and enemy count all scale with the seed. The player spawns
// at the left edge and traverses to the return portal at the right edge,
// fighting through enemies and grabbing loot along the way.
//
// Tier 0 = normal; tier 1 = hardmode (more enemies, longer corridors).
//
// No reachability graph — the floor is continuous so the level is trivially
// completable on foot. Platforms add verticality + cell rewards but aren't
// required for traversal.
export function generateDelve(seed: number, tier = 0): DelveLevel {
  const rng = seedRng(seed)

  // Width varies per seed; tier 1 stretches the corridor for longer runs.
  // Doubled (from 40-70 + tier*8) to compensate for halved TILE_SIZE so the
  // physical corridor length stays comparable.
  const W = randInt(rng, 80, 140) + tier * 16
  const H = 36

  const m: TileChar[][] = Array.from({ length: H }, () => Array<TileChar>(W).fill(" "))

  for (let x = 0; x < W; x++) {
    m[0]![x] = "#"
    m[H - 1]![x] = "#"
  }
  for (let y = 0; y < H; y++) {
    m[y]![0] = "#"
    m[y]![W - 1] = "#"
  }

  // Platform count scales with width: roughly 1 platform per 6-9 tiles.
  // Formulas reference W which already doubled, so platCount auto-scales.
  const platMin = Math.max(4, Math.floor(W / 9))
  const platMax = Math.max(platMin + 2, Math.floor(W / 5))
  const platCount = randInt(rng, platMin, platMax)

  type Plat = { x: number; y: number; w: number }
  const plats: Plat[] = []
  for (let i = 0; i < platCount; i++) {
    const len = randInt(rng, 6, 12)
    const x = randInt(rng, 6, W - len - 6)
    const y = randInt(rng, 8, H - 10)
    plats.push({ x, y, w: len })
    for (let j = 0; j < len; j++) m[y]![x + j] = "="
  }

  // Cells on ~60% of platforms — overlap with later-placed platforms is fine,
  // they just overwrite each other and we don't bother with collision checks.
  for (const p of plats) {
    if (chance(rng, 0.6)) {
      m[p.y - 1]![p.x + Math.floor(p.w / 2)] = "c"
    }
  }

  // Big cache + return portal anchored at the far end so the player has to
  // traverse the whole corridor.
  m[H - 2]![W - 10] = "C"
  m[H - 2]![W - 6] = "r"

  // Enemy count scales with width and tier. Half spawn on platforms, half on
  // the floor — ghosts pass through walls anyway, so floor placement just
  // means they start at ground level.
  //
  // Type mix: ghosts dominate (60%), slammers are the heavy threat (25%),
  // spitters are rare ranged hazards (15%). Spitters strongly prefer platform
  // placement so they hold elevation while kiting; slammers anywhere.
  const enemyMin = Math.max(3, Math.floor(W / 14))
  const enemyMax = Math.max(enemyMin + 2, Math.floor(W / 8))
  const enemyCount = randInt(rng, enemyMin, enemyMax) + tier * 2
  // Type mix: ghost 50, slammer 22, spitter 14, burrower 14. Burrowers are
  // ground-locked (always floor placement); spitters strongly prefer
  // platforms for the kite advantage.
  const pickType = (): EnemyType => {
    const r = rng()
    if (r < 0.14) return "burrower"
    if (r < 0.28) return "spitter"
    if (r < 0.5) return "slammer"
    return "ghost"
  }
  const enemySpawns: EnemySpawn[] = []
  for (let i = 0; i < enemyCount; i++) {
    const type = pickType()
    const wantPlat =
      type === "spitter" ? chance(rng, 0.85) : type === "burrower" ? false : chance(rng, 0.5)
    if (plats.length > 0 && wantPlat) {
      const pl = plats[randInt(rng, 0, plats.length - 1)]!
      enemySpawns.push({
        type,
        x: (pl.x + Math.floor(pl.w / 2)) * TILE_SIZE,
        y: (pl.y - 1) * TILE_SIZE,
      })
    } else {
      // Floor placement, kept clear of spawn (left) and exit (right) zones.
      const ex = randInt(rng, 16, W - 16)
      enemySpawns.push({
        type,
        x: ex * TILE_SIZE,
        y: (H - 6) * TILE_SIZE,
      })
    }
  }

  return {
    map: m,
    W,
    H,
    spawn: { x: 6 * TILE_SIZE, y: (H - 6) * TILE_SIZE },
    theme: "delve",
    enemySpawns,
    seed,
    tier,
  }
}

// Used by physics.ts to classify tiles. Accepts `undefined` because callers
// pass `map[y]?.[x]` results.
export const isSolid = (c: TileChar | undefined): boolean => c === "#"
export const isPlat = (c: TileChar | undefined): boolean => c === "="
