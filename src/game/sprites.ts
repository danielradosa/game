// Replace procedural drawings with real images. Strict sizing required.
// const img = new Image(); img.src = '/sprites/player.png'; SPRITES.player = img;
// All character sprites must face RIGHT — renderer mirrors automatically.
import type { AssetSizes, SpriteMap, SpriteName } from "@/game/types/sprites"
import loadSprite from "@/lib/spriteHelper"

// Every visual entity has a slot here so a custom webp/png can replace the
// procedural draw. To use one: import the asset and assign to SPRITES.<name>
// at the bottom of this file (see existing tile_ground / portal_delve etc.).
export const ASSET_SIZES: AssetSizes = {
  player: { w: 48, h: 64, anchor: "bottom-center" },
  tile_ground: { w: 36, h: 36, anchor: "top-left" },
  tile_grass: { w: 36, h: 36, anchor: "top-left" },
  tile_platform: { w: 36, h: 12, anchor: "top-left" },
  collectible: { w: 24, h: 24, anchor: "center" },
  cache: { w: 40, h: 40, anchor: "center" },
  portal_delve: { w: 36, h: 64, anchor: "bottom-center" },
  portal_delve_hard: { w: 36, h: 64, anchor: "bottom-center" },
  portal_destroyed: { w: 36, h: 36, anchor: "bottom-center" },
  portal_return: { w: 36, h: 64, anchor: "bottom-center" },
  npc_elder: { w: 36, h: 64, anchor: "bottom-center" },
  npc_merchant: { w: 36, h: 64, anchor: "bottom-center" },
  npc: { w: 36, h: 64, anchor: "bottom-center" },
  enemy_ghost: { w: 30, h: 30, anchor: "center" },
  enemy_slammer: { w: 40, h: 40, anchor: "center" },
  enemy_spitter: { w: 26, h: 26, anchor: "center" },
  enemy_burrower: { w: 36, h: 32, anchor: "bottom-center" },
  projectile: { w: 18, h: 18, anchor: "center" },
  weapon_worn: { w: 64, h: 32, anchor: "center" },
  weapon_forged: { w: 64, h: 32, anchor: "center" },
  weapon_honed: { w: 64, h: 32, anchor: "center" },
  aura_searing: { w: 64, h: 64, anchor: "center" },
  aura_stormbound: { w: 80, h: 80, anchor: "center" },
  aura_glacial: { w: 36, h: 36, anchor: "center" },
  aura_sanguine: { w: 48, h: 48, anchor: "center" },
  tile_ground_delve: { w: 36, h: 36, anchor: "top-left" },
  tile_platform_delve: { w: 36, h: 12, anchor: "top-left" },
}

export const SPRITES: SpriteMap = {
  player: null,
  tile_ground: null,
  tile_grass: null,
  tile_platform: null,
  collectible: null,
  cache: null,
  portal_delve: null,
  portal_delve_hard: null,
  portal_destroyed: null,
  portal_return: null,
  npc_elder: null,
  npc_merchant: null,
  npc: null,
  enemy_ghost: null,
  enemy_slammer: null,
  enemy_spitter: null,
  enemy_burrower: null,
  projectile: null,
  weapon_worn: null,
  weapon_forged: null,
  weapon_honed: null,
  aura_searing: null,
  aura_stormbound: null,
  aura_glacial: null,
  aura_sanguine: null,
  tile_ground_delve: null,
  tile_platform_delve: null,
}

// Type predicate: narrows `s` from `HTMLImageElement | null` to
// `HTMLImageElement` so call sites don't need their own null check.
export function isReady(s: HTMLImageElement | null): s is HTMLImageElement {
  return s !== null && s.complete && s.naturalWidth > 0
}

export function tryDrawSprite(
  ctx: CanvasRenderingContext2D,
  name: SpriteName,
  x: number,
  y: number,
): boolean {
  const s = SPRITES[name]
  if (!isReady(s)) return false
  const spec = ASSET_SIZES[name]
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

import tileGroundSrc from "@/assets/tile_ground.webp"
import tileGrassSrc from "@/assets/tile_grass.webp"
import tilePlatformSrc from "@/assets/tile_platform.webp"

SPRITES.tile_ground = loadSprite(tileGroundSrc)
SPRITES.tile_grass = loadSprite(tileGrassSrc)
SPRITES.tile_platform = loadSprite(tilePlatformSrc)
