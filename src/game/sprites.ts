// Replace procedural drawings with real images. Drop a .webp or .png into
// src/assets/sprites/<slot>.<ext> and the auto-loader binds it to the matching
// slot in SPRITE_REGISTRY. webp wins if both extensions exist.
// All character sprites must face RIGHT — renderer mirrors automatically.
import type { AssetSpec, SpriteSpec } from "@/game/types/sprites"
import loadSprite from "@/lib/spriteHelper"

// Single source of truth: sizing + anchor + animation kind for every slot.
// SPRITES (the runtime image map) and SpriteName (the type union) are
// derived from this, so adding a new slot is a one-place edit.
export const SPRITE_REGISTRY = {
  // --- Tiles (all static one-frame images) ---
  tile_ground:         { kind: "static", w: 36, h: 36, anchor: "top-left" },
  tile_grass:          { kind: "static", w: 36, h: 36, anchor: "top-left" },
  tile_platform:       { kind: "static", w: 36, h: 12, anchor: "top-left" },
  tile_ground_delve:   { kind: "static", w: 36, h: 36, anchor: "top-left" },
  tile_platform_delve: { kind: "static", w: 36, h: 12, anchor: "top-left" },

  // --- Player (kind switches to "sheet" in Task 6) ---
  player:              { kind: "static", w: 48, h: 64, anchor: "bottom-center" },

  // --- Pickups ---
  collectible:         { kind: "static", w: 24, h: 24, anchor: "center" },
  cache:               { kind: "static", w: 40, h: 40, anchor: "center" },

  // --- Portals ---
  portal_delve:        { kind: "static", w: 36, h: 64, anchor: "bottom-center" },
  portal_delve_hard:   { kind: "static", w: 36, h: 64, anchor: "bottom-center" },
  portal_destroyed:    { kind: "static", w: 36, h: 36, anchor: "bottom-center" },
  portal_return:       { kind: "static", w: 36, h: 64, anchor: "bottom-center" },

  // --- NPCs ---
  npc_elder:           { kind: "static", w: 36, h: 64, anchor: "bottom-center" },
  npc_merchant:        { kind: "static", w: 36, h: 64, anchor: "bottom-center" },
  npc:                 { kind: "static", w: 36, h: 64, anchor: "bottom-center" },

  // --- Enemies (kind switches to "sheet" in Task 6) ---
  enemy_ghost:         { kind: "static", w: 30, h: 30, anchor: "center" },
  enemy_slammer:       { kind: "static", w: 40, h: 40, anchor: "center" },
  enemy_spitter:       { kind: "static", w: 26, h: 26, anchor: "center" },
  enemy_burrower:      { kind: "static", w: 36, h: 32, anchor: "bottom-center" },

  // --- Projectiles & weapons ---
  projectile:          { kind: "static", w: 18, h: 18, anchor: "center" },
  weapon_worn:         { kind: "static", w: 64, h: 32, anchor: "center" },
  weapon_forged:       { kind: "static", w: 64, h: 32, anchor: "center" },
  weapon_honed:        { kind: "static", w: 64, h: 32, anchor: "center" },

  // --- Mod auras ---
  aura_searing:        { kind: "static", w: 64, h: 64, anchor: "center" },
  aura_stormbound:     { kind: "static", w: 80, h: 80, anchor: "center" },
  aura_glacial:        { kind: "static", w: 36, h: 36, anchor: "center" },
  aura_sanguine:       { kind: "static", w: 48, h: 48, anchor: "center" },
} as const satisfies Record<string, SpriteSpec>

// Derived types — one source of truth.
export type SpriteName = keyof typeof SPRITE_REGISTRY
export type SpriteMap = Record<SpriteName, HTMLImageElement | null>
export type AssetSizes = Record<SpriteName, AssetSpec>

// Runtime image map — every slot starts null. Auto-loader (Task 3) populates.
export const SPRITES: SpriteMap = Object.fromEntries(
  (Object.keys(SPRITE_REGISTRY) as SpriteName[]).map((k) => [k, null]),
) as SpriteMap

// Back-compat alias. render.ts call sites read ASSET_SIZES[name].w/.h/.anchor.
// For "static" slots those fields are direct. For animated kinds, the same
// fields don't exist as-is — callers that need the FRAME size on animated
// slots should switch to reading .frameW/.frameH (handled in Task 6).
export const ASSET_SIZES = SPRITE_REGISTRY as unknown as AssetSizes

// Type predicate: narrows `s` from `HTMLImageElement | null` to
// `HTMLImageElement` so call sites don't need their own null check.
export function isReady(s: HTMLImageElement | null): s is HTMLImageElement {
  return s !== null && s.complete && s.naturalWidth > 0
}

// Draw a static (single-frame) sprite. Returns false if the slot is empty,
// the image isn't loaded yet, or the slot's kind isn't "static" — caller
// can then fall back to its procedural draw.
export function tryDrawSprite(
  ctx: CanvasRenderingContext2D,
  name: SpriteName,
  x: number,
  y: number,
): boolean {
  const s = SPRITES[name]
  if (!isReady(s)) return false
  const spec = SPRITE_REGISTRY[name]
  if (spec.kind !== "static") return false // Task 6 routes animated kinds through tryDrawAnimated
  let dx = x,
    dy = y
  if (spec.anchor === "center") {
    dx = x - spec.w / 2
    dy = y - spec.h / 2
  } else if (spec.anchor === "bottom-center") {
    dx = x - spec.w / 2
    dy = y - spec.h
  }
  ctx.drawImage(s, Math.round(dx), Math.round(dy), spec.w, spec.h)
  return true
}

// Explicit imports — auto-loader replaces these in Task 3.
import tileGroundSrc from "@/assets/sprites/tile_ground.webp"
import tileGrassSrc from "@/assets/sprites/tile_grass.webp"
import tilePlatformSrc from "@/assets/sprites/tile_platform.webp"

SPRITES.tile_ground = loadSprite(tileGroundSrc)
SPRITES.tile_grass = loadSprite(tileGrassSrc)
SPRITES.tile_platform = loadSprite(tilePlatformSrc)
