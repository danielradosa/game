// Replace procedural drawings with real images. Drop a .webp or .png into
// src/assets/sprites/<slot>.<ext> and the auto-loader binds it to the matching
// slot in SPRITE_REGISTRY. webp wins if both extensions exist.
// All character sprites must face RIGHT — renderer mirrors automatically.
import type { SheetAnimation, SpriteAnchor, SpriteSpec } from "@/game/types/sprites"
import loadSprite from "@/lib/spriteHelper"
import { frameIndex } from "@/game/animations"

// Single source of truth: sizing + anchor + animation kind for every slot.
// SPRITES (the runtime image map) and SpriteName (the type union) are
// derived from this, so adding a new slot is a one-place edit.
export const SPRITE_REGISTRY = {
  // --- Tiles (all static one-frame images, sized to TILE_SIZE=16) ---
  // Existing 36×36 source webps will downscale to 16×16 dest until you
  // re-author at native 16×16. Platform sprites stay at ~1/3 tile height.
  tile_ground: { kind: "static", w: 16, h: 16, anchor: "top-left" },
  tile_grass: { kind: "static", w: 16, h: 16, anchor: "top-left" },
  tile_platform: { kind: "static", w: 16, h: 6, anchor: "top-left" },
  tile_ground_delve: { kind: "static", w: 16, h: 16, anchor: "top-left" },
  tile_platform_delve: { kind: "static", w: 16, h: 6, anchor: "top-left" },

  // --- Player (sheet) ---
  player: {
    kind: "sheet",
    frameW: 48,
    frameH: 64,
    anchor: "bottom-center",
    animations: {
      idle: { row: 0, frames: 4, fps: 6, loop: true },
      run: { row: 1, frames: 4, fps: 12, loop: true },
      jump: { row: 2, frames: 2, fps: 8, loop: false },
      fall: { row: 3, frames: 2, fps: 8, loop: false },
      dash: { row: 4, frames: 2, fps: 18, loop: false },
      slash: { row: 5, frames: 4, fps: 24, loop: false },
      hurt: { row: 6, frames: 2, fps: 8, loop: false },
    },
  },

  // --- Pickups ---
  collectible: { kind: "static", w: 24, h: 24, anchor: "center" },
  cache: { kind: "static", w: 40, h: 40, anchor: "center" },

  // --- Portals ---
  portal_delve: { kind: "static", w: 36, h: 64, anchor: "bottom-center" },
  portal_delve_hard: { kind: "static", w: 36, h: 64, anchor: "bottom-center" },
  portal_destroyed: { kind: "static", w: 36, h: 36, anchor: "bottom-center" },
  portal_return: { kind: "static", w: 36, h: 64, anchor: "bottom-center" },

  // --- NPCs ---
  npc_elder: { kind: "static", w: 36, h: 64, anchor: "bottom-center" },
  npc_merchant: { kind: "static", w: 36, h: 64, anchor: "bottom-center" },
  npc: { kind: "static", w: 36, h: 64, anchor: "bottom-center" },

  // --- Enemies (all sheet) ---
  enemy_ghost: {
    kind: "sheet",
    frameW: 30,
    frameH: 30,
    anchor: "center",
    animations: {
      idle: { row: 0, frames: 4, fps: 6, loop: true },
      hurt: { row: 1, frames: 2, fps: 12, loop: false },
    },
  },
  enemy_slammer: {
    kind: "sheet",
    frameW: 40,
    frameH: 40,
    anchor: "center",
    animations: {
      idle: { row: 0, frames: 4, fps: 6, loop: true },
      windup: { row: 1, frames: 4, fps: 8, loop: false },
      lunge: { row: 2, frames: 2, fps: 16, loop: false },
      hurt: { row: 3, frames: 2, fps: 12, loop: false },
    },
  },
  enemy_spitter: {
    kind: "sheet",
    frameW: 26,
    frameH: 26,
    anchor: "center",
    animations: {
      idle: { row: 0, frames: 4, fps: 6, loop: true },
      fire: { row: 1, frames: 3, fps: 12, loop: false },
      hurt: { row: 2, frames: 2, fps: 12, loop: false },
    },
  },
  enemy_burrower: {
    kind: "sheet",
    frameW: 36,
    frameH: 32,
    anchor: "bottom-center",
    animations: {
      idle: { row: 0, frames: 4, fps: 6, loop: true },
      dive: { row: 1, frames: 3, fps: 12, loop: false },
      hurt: { row: 2, frames: 2, fps: 12, loop: false },
    },
  },

  // --- Projectiles & weapons ---
  projectile: { kind: "static", w: 18, h: 18, anchor: "center" },
  weapon_worn: { kind: "static", w: 64, h: 32, anchor: "center" },
  weapon_forged: { kind: "static", w: 64, h: 32, anchor: "center" },
  weapon_honed: { kind: "static", w: 64, h: 32, anchor: "center" },

  // --- Mod auras ---
  aura_searing: { kind: "static", w: 64, h: 64, anchor: "center" },
  aura_stormbound: { kind: "static", w: 80, h: 80, anchor: "center" },
  aura_glacial: { kind: "static", w: 36, h: 36, anchor: "center" },
  aura_sanguine: { kind: "static", w: 48, h: 48, anchor: "center" },
} as const satisfies Record<string, SpriteSpec>

// Derived types — one source of truth.
export type SpriteName = keyof typeof SPRITE_REGISTRY
export type SpriteMap = Record<SpriteName, HTMLImageElement | null>

// Runtime image map — every slot starts null. Auto-loader (below) populates.
export const SPRITES: SpriteMap = Object.fromEntries(
  (Object.keys(SPRITE_REGISTRY) as SpriteName[]).map((k) => [k, null]),
) as SpriteMap

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
  // Tile overdraw: top-left anchored sprites (only tiles use this anchor)
  // get drawn 1px wider+taller than their nominal size so adjacent tiles
  // overlap by 1 source pixel. This covers any sub-pixel seam artifacts
  // that survive imageSmoothingEnabled=false + image-rendering:pixelated
  // — modern browsers can still produce 1px alpha bleed at tile boundaries
  // when the canvas backbuffer is scaled to a fractional DPR. Other anchors
  // (center, bottom-center) are solo entities where overdraw doesn't help
  // and could cause visible bleed.
  const overdraw = spec.anchor === "top-left" ? 1 : 0
  ctx.drawImage(s, Math.round(dx), Math.round(dy), spec.w + overdraw, spec.h + overdraw)
  return true
}

// Draw a frame from an animated slot. anim is ignored for "strip" kind
// (single anim per slot); for "sheet" kind it must be a key in
// spec.animations. Returns false if the slot is empty, not loaded, or
// not an animated kind — caller falls back to its procedural path.
//
// `time` is in physics ticks (pass s.time directly). One-shot anims
// clamp to their last frame after duration, so the renderer holds the
// final pose until the caller selects a different anim.
//
// `mirror` flips the frame horizontally (for left-facing entities). The
// caller is responsible for already having translated to the entity's
// position — this function just blits the frame at (x, y) with anchor
// applied. Mirroring uses ctx.scale internally; caller does NOT need to
// wrap with save/restore.
export function tryDrawAnimated(
  ctx: CanvasRenderingContext2D,
  name: SpriteName,
  x: number,
  y: number,
  anim: string,
  time: number,
  mirror: boolean = false,
): boolean {
  const img = SPRITES[name]
  if (!isReady(img)) return false
  // Cast to SpriteSpec so TypeScript narrows on the discriminated `kind` union.
  // SPRITE_REGISTRY is `as const` so each slot's kind is a literal — without
  // the cast the compiler sees e.g. kind:"static" and rejects kind==="strip".
  const spec = SPRITE_REGISTRY[name] as SpriteSpec

  let frameW: number, frameH: number, anchor: SpriteAnchor, srcX: number, srcY: number

  if (spec.kind === "strip") {
    frameW = spec.frameW
    frameH = spec.frameH
    anchor = spec.anchor
    const f = frameIndex(spec.frames, spec.fps, spec.loop, time)
    srcX = f * frameW
    srcY = 0
  } else if (spec.kind === "sheet") {
    const a: SheetAnimation | undefined = spec.animations[anim]
    if (!a) {
      if (import.meta.env.DEV) {
        console.warn(`[sprites] sheet "${name}" has no animation "${anim}"`)
      }
      return false
    }
    frameW = spec.frameW
    frameH = spec.frameH
    anchor = spec.anchor
    const f = frameIndex(a.frames, a.fps, a.loop, time)
    srcX = f * frameW
    srcY = a.row * frameH
  } else {
    // kind: "static" — caller should use tryDrawSprite instead.
    return false
  }

  // Compute destination top-left from anchor.
  let dx = x,
    dy = y
  if (anchor === "center") {
    dx = x - frameW / 2
    dy = y - frameH / 2
  } else if (anchor === "bottom-center") {
    dx = x - frameW / 2
    dy = y - frameH
  }

  if (mirror) {
    ctx.save()
    // Mirror around the entity's anchor x (already encoded in dx/x).
    // Translate to mirror axis, scale -1, draw at -frameW so the flipped
    // frame still occupies the same destination rect.
    ctx.translate(Math.round(x), 0)
    ctx.scale(-1, 1)
    ctx.drawImage(
      img,
      srcX,
      srcY,
      frameW,
      frameH,
      Math.round(-x + dx) - frameW,
      Math.round(dy),
      frameW,
      frameH,
    )
    ctx.restore()
  } else {
    ctx.drawImage(img, srcX, srcY, frameW, frameH, Math.round(dx), Math.round(dy), frameW, frameH)
  }
  return true
}

// Auto-load: every .webp or .png in src/assets/sprites/ is bound to the
// matching slot in SPRITE_REGISTRY by filename. webp wins on collision
// (so a .png draft can coexist with a final .webp).
//
// Adding new art: drop the file, done. Brand-new slots still need a
// SPRITE_REGISTRY entry (sizing/anchor/kind) — but no import wiring.
//
// Files prefixed with "_" are skipped silently — useful for in-progress
// drafts you don't want bound yet (e.g. _player_v2.webp).

const webpModules = import.meta.glob<{ default: string }>("@/assets/sprites/*.webp", {
  eager: true,
})
const pngModules = import.meta.glob<{ default: string }>("@/assets/sprites/*.png", { eager: true })

function bindSpriteModules(modules: Record<string, { default: string }>): void {
  for (const path in modules) {
    const match = path.match(/\/([^/]+)\.(webp|png)$/)
    if (!match) continue
    const slot = match[1]!
    if (slot.startsWith("_")) continue // draft files
    if (!(slot in SPRITE_REGISTRY)) {
      if (import.meta.env.DEV) {
        console.warn(
          `[sprites] orphan asset ${path} — no slot named "${slot}" in SPRITE_REGISTRY. ` +
            `Either rename the file or add the slot to the registry.`,
        )
      }
      continue
    }
    const slotName = slot as SpriteName
    if (SPRITES[slotName]) continue // webp already bound; skip png
    SPRITES[slotName] = loadSprite(modules[path]!.default)
  }
}

bindSpriteModules(webpModules) // webp first → wins on collision
bindSpriteModules(pngModules)
