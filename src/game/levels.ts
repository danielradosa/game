import { TILE_SIZE } from "@/game/constants"
import type {
  DelveLevel,
  EnemySpawn,
  OverworldLevel,
  TileChar,
} from "@/game/types/physics"

// Plat / cell coordinate tables. Typed as fixed-arity tuples so destructuring
// gives proper `number`s rather than `number | undefined` under
// `noUncheckedIndexedAccess`.
type PlatRow = [px: number, py: number, pw: number]
type CellRow = [x: number, y: number]

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
  m[g[105]! - 1]![105] = "p"

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
  }
}

// Used by physics.ts to classify tiles. Accepts `undefined` because callers
// pass `map[y]?.[x]` results.
export const isSolid = (c: TileChar | undefined): boolean => c === "#"
export const isPlat = (c: TileChar | undefined): boolean => c === "="
