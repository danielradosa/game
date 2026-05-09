// Structural types for the static data tables in src/game/data.ts.
// The actual ID-literal unions (AchievementId, ZoneId) are derived in data.ts
// itself via `(typeof ACHIEVEMENTS)[number]["id"]` — defining them there keeps
// the data table the single source of truth.

import type { Cost } from "@/game/economy"

export interface Zone {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
  xp: number
}

export interface Achievement {
  id: string
  name: string
  desc: string
}

// Cosmetic mod ideas surfaced in the inventory panel. `n` = name, `d` = desc.
export interface ProposedMod {
  n: string
  d: string
}

// Craftable mods. Effects are applied in physics.ts based on `id`. kind
// drives forge UI grouping ("utility" = movement/magnet, "weapon" = combat).
// tier is documentation + a slot for future cost lookups.
export interface Mod {
  id: string
  name: string
  desc: string
  cost: Cost // rarity bundle required to craft
  kind: "utility" | "weapon"
  tier: 1 | 2 | 3
}

// Tiered weapons sold at the Elder forge. level matches HudState.weaponLevel.
export interface Weapon {
  level: number
  name: string
  desc: string
  damage: number
  cost: Cost // rarity bundle to upgrade TO this tier (empty for default)
}

// Color palettes for the character creator. Plain hex strings; documented
// as a named type so call sites read more clearly.
export type ColorHex = string
export type Palette = readonly ColorHex[]
