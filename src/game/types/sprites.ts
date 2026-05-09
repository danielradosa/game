// Type contract for the sprite registry. Lets call sites do
//   tryDrawSprite(ctx, "tile_grass", x, y)
// with autocomplete on the name and a build error for typos.

export type SpriteName =
  | "player"
  | "tile_ground"
  | "tile_grass"
  | "tile_platform"
  | "collectible"
  | "cache"
  | "portal_delve"
  | "portal_delve_hard"
  | "portal_destroyed"
  | "portal_return"
  | "npc_elder"
  | "npc_merchant"
  // legacy alias kept for the procedural fallback path; prefer npc_elder
  | "npc"
  | "enemy_ghost"
  | "enemy_slammer"
  | "enemy_spitter"
  | "enemy_burrower"
  | "projectile"
  // Per-weapon slash visuals — replace the procedural arc when a sprite is
  // loaded. Drawn at the slash anchor with bottom-center anchor; mirrored
  // automatically based on player.facing.
  | "weapon_worn"
  | "weapon_forged"
  | "weapon_honed"
  // Mod auras / per-effect overlays. Render code attempts these first then
  // falls back to the procedural particles/arcs.
  | "aura_searing"
  | "aura_stormbound"
  | "aura_glacial"
  | "aura_sanguine"
  | "tile_ground_delve"
  | "tile_platform_delve"

// How to position the sprite relative to the (x, y) draw point passed in.
//   "top-left"      — (x, y) is the upper-left corner
//   "center"        — (x, y) is the center
//   "bottom-center" — (x, y) is the bottom-center (used for characters/portals
//                     so the feet/base anchor to a ground tile)
export type SpriteAnchor = "top-left" | "center" | "bottom-center"

export interface AssetSpec {
  w: number
  h: number
  anchor: SpriteAnchor
}

export type AssetSizes = Record<SpriteName, AssetSpec>
export type SpriteMap = Record<SpriteName, HTMLImageElement | null>
