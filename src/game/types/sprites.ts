// Type contract for the sprite registry. Lets call sites do
//   tryDrawSprite(ctx, "tile_grass", x, y)
// with autocomplete on the name and a build error for typos.

// How to position the sprite relative to the (x, y) draw point.
//   "top-left"      — (x, y) is the upper-left corner
//   "center"        — (x, y) is the center
//   "bottom-center" — (x, y) is the bottom-center (used for characters/portals
//                     so the feet/base anchor to a ground tile)
export type SpriteAnchor = "top-left" | "center" | "bottom-center"

// One animation in a "sheet" sprite — a row in the grid.
export interface SheetAnimation {
  row: number
  frames: number
  fps: number
  loop: boolean
}

// Discriminated union of slot kinds. Add `kind: "atlas"` here in v2
// when TexturePacker / Aseprite JSON support lands.
export type SpriteSpec =
  | { kind: "static"; w: number; h: number; anchor: SpriteAnchor }
  | {
      kind: "strip"
      frameW: number
      frameH: number
      anchor: SpriteAnchor
      frames: number
      fps: number
      loop: boolean
    }
  | {
      kind: "sheet"
      frameW: number
      frameH: number
      anchor: SpriteAnchor
      animations: Record<string, SheetAnimation>
    }

// Back-compat: existing render.ts calls do `ASSET_SIZES.player` and read .w
// /.h/.anchor. The registry's "static" variant carries those fields directly,
// and animated variants expose frameW/frameH instead — call sites that read
// .w/.h need to handle both. Keep this alias so non-animated call sites
// don't have to change.
export interface AssetSpec {
  w: number
  h: number
  anchor: SpriteAnchor
}

// Note: the runtime SpriteName / AssetSizes / SpriteMap types are exported
// from sprites.ts (derived from SPRITE_REGISTRY's keys) — having them
// declared there keeps the single-source-of-truth shape working with TS's
// `keyof typeof` inference.
