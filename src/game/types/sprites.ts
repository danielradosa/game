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
  | "portal_return"
  | "npc"
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
