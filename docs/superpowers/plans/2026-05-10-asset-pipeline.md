# Asset Pipeline & Sprite Sheets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 2-line-per-asset import dance with a folder-drop convention, collapse `ASSET_SIZES` + `SPRITES` into a single `SPRITE_REGISTRY`, add sprite-sheet support with animation derived from physics state, and fix the 1px tile seams that show up when the camera lerps to a fractional position.

**Architecture:** One declarative registry (`SPRITE_REGISTRY`) is the single source of truth for sizing, anchor, animation kind, and frame metadata. The runtime image map (`SPRITES`) and the type union (`SpriteName`) are derived. `import.meta.glob` eager-loads any `.webp`/`.png` placed under `src/assets/sprites/` and binds files to slots by filename. Animation selection lives in pure functions in `src/game/animations.ts` that read physics state — zero new mutable fields on `PlayerState` or `Enemy`. Atlas/TexturePacker is intentionally deferred to v2.

**Tech Stack:** TypeScript, Vite (`import.meta.glob`), Canvas 2D rendering. No test runner — verification is `npm run typecheck` + `npm run lint` + manual visual inspection in `npm run dev`.

**Spec:** `docs/superpowers/specs/2026-05-10-asset-pipeline-design.md`

---

## File Structure

**Modify:**
- `src/game/types/sprites.ts` — replace flat `SpriteName` union with derived type, add `SpriteSpec` discriminated union, deprecate `AssetSpec`/`AssetSizes` (kept as type aliases for back-compat)
- `src/game/sprites.ts` — replace explicit imports + parallel maps with `SPRITE_REGISTRY` + `import.meta.glob` auto-load + `tryDrawAnimated`
- `src/game/render.ts` — disable image smoothing once at draw start, integrate `tryDrawAnimated` into player + enemy draw paths

**Create:**
- `src/game/animations.ts` — `selectPlayerAnim` + per-enemy selectors + frame-index math. Pure functions, no I/O.

**Move:**
- `src/assets/tile_ground.webp` → `src/assets/sprites/tile_ground.webp`
- `src/assets/tile_grass.webp` → `src/assets/sprites/tile_grass.webp`
- `src/assets/tile_platform.webp` → `src/assets/sprites/tile_platform.webp`

**Per-task scope:** Tasks 1–4 are pure refactor + a focused bug fix (no visible behavior change except tile seams disappearing in Task 4). Tasks 5–6 add the animation API but leave all `SPRITES.*` slots `null`, so visuals continue to fall back to procedural draws — meaning even Task 6 doesn't change appearance until you actually drop a real sprite sheet into the folder.

---

## Task 1: Move existing tile assets into `sprites/` subfolder

**Files:**
- Move: `src/assets/tile_ground.webp` → `src/assets/sprites/tile_ground.webp`
- Move: `src/assets/tile_grass.webp` → `src/assets/sprites/tile_grass.webp`
- Move: `src/assets/tile_platform.webp` → `src/assets/sprites/tile_platform.webp`
- Modify: `src/game/sprites.ts:98-100` (the three explicit imports)

- [ ] **Step 1: Create the `sprites/` subdirectory and move the 3 existing assets**

```bash
mkdir -p src/assets/sprites
git mv src/assets/tile_ground.webp src/assets/sprites/tile_ground.webp
git mv src/assets/tile_grass.webp src/assets/sprites/tile_grass.webp
git mv src/assets/tile_platform.webp src/assets/sprites/tile_platform.webp
```

- [ ] **Step 2: Update the three import paths in `src/game/sprites.ts`**

Open `src/game/sprites.ts`, find these three lines near the bottom:

```ts
import tileGroundSrc from "@/assets/tile_ground.webp"
import tileGrassSrc from "@/assets/tile_grass.webp"
import tilePlatformSrc from "@/assets/tile_platform.webp"
```

Change each path to point at the new location:

```ts
import tileGroundSrc from "@/assets/sprites/tile_ground.webp"
import tileGrassSrc from "@/assets/sprites/tile_grass.webp"
import tilePlatformSrc from "@/assets/sprites/tile_platform.webp"
```

- [ ] **Step 3: Typecheck + lint**

Run:
```bash
npm run typecheck && npm run lint
```
Expected: both succeed with no errors.

- [ ] **Step 4: Manual visual check**

Run:
```bash
npm run dev
```
Open the browser, start a new game, walk around the overworld. The grass + ground + platform tiles must render exactly as before. If any tile is missing (white/transparent), the import path is wrong — re-check.

- [ ] **Step 5: Commit**

```bash
git add src/assets/sprites src/game/sprites.ts
git commit -m "refactor(assets): move tile sprites into src/assets/sprites/

Prepares for the registry + folder-drop convention. No behavior change
— same files, new path."
```

---

## Task 2: Collapse `ASSET_SIZES` + `SPRITES` into `SPRITE_REGISTRY`

**Files:**
- Modify: `src/game/types/sprites.ts` (rewrite — switch from flat union to discriminated union, derive `SpriteName` from registry)
- Modify: `src/game/sprites.ts` (rewrite the registry section — keep all entries `kind: "static"` for now)

The end state of this task: `SPRITE_REGISTRY` is the single source of truth. `SPRITES` and `SpriteName` are derived from its keys. `ASSET_SIZES` is exported as an alias to `SPRITE_REGISTRY` so existing call sites in `render.ts` keep compiling without a sweep.

- [ ] **Step 1: Rewrite `src/game/types/sprites.ts`**

Replace the entire file contents with:

```ts
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
```

- [ ] **Step 2: Rewrite `src/game/sprites.ts`** — full file replacement

Replace the entire file contents with:

```ts
// Replace procedural drawings with real images. Drop a .webp or .png into
// src/assets/sprites/<slot>.<ext> and the auto-loader binds it to the matching
// slot in SPRITE_REGISTRY. webp wins if both extensions exist.
// All character sprites must face RIGHT — renderer mirrors automatically.
import type { AssetSpec, SpriteAnchor, SpriteSpec } from "@/game/types/sprites"
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
```

- [ ] **Step 3: Typecheck + lint**

Run:
```bash
npm run typecheck && npm run lint
```
Expected: both succeed. If `tsc` complains about `as unknown as AssetSizes`, that's the back-compat shim and is correct — render.ts's existing reads of `ASSET_SIZES.player.w` etc. resolve through it for static slots.

- [ ] **Step 4: Manual visual check**

Run:
```bash
npm run dev
```
Same as Task 1 — verify tiles render, NPCs render procedurally, portals render procedurally. Nothing visible should have changed.

- [ ] **Step 5: Commit**

```bash
git add src/game/types/sprites.ts src/game/sprites.ts
git commit -m "refactor(sprites): collapse ASSET_SIZES+SPRITES into SPRITE_REGISTRY

One declarative registry holds sizing/anchor/kind for every slot. SPRITES
and SpriteName are derived. SpriteSpec discriminated union accepts static
right now and gains strip/sheet support in a follow-up. ASSET_SIZES kept
as an alias so existing render.ts reads keep working."
```

---

## Task 3: Auto-load assets via `import.meta.glob`

**Files:**
- Modify: `src/game/sprites.ts` (replace bottom 8 lines of explicit imports with the glob loop)

- [ ] **Step 1: Replace the explicit imports at the bottom of `src/game/sprites.ts`**

Find these lines at the bottom of the file:

```ts
// Explicit imports — auto-loader replaces these in Task 3.
import tileGroundSrc from "@/assets/sprites/tile_ground.webp"
import tileGrassSrc from "@/assets/sprites/tile_grass.webp"
import tilePlatformSrc from "@/assets/sprites/tile_platform.webp"

SPRITES.tile_ground = loadSprite(tileGroundSrc)
SPRITES.tile_grass = loadSprite(tileGrassSrc)
SPRITES.tile_platform = loadSprite(tilePlatformSrc)
```

Replace them with:

```ts
// Auto-load: every .webp or .png in src/assets/sprites/ is bound to the
// matching slot in SPRITE_REGISTRY by filename. webp wins on collision
// (so a .png draft can coexist with a final .webp).
//
// Adding new art: drop the file, done. Brand-new slots still need a
// SPRITE_REGISTRY entry (sizing/anchor/kind) — but no import wiring.
//
// Files prefixed with "_" are skipped silently — useful for in-progress
// drafts you don't want bound yet (e.g. _player_v2.webp).

const webpModules = import.meta.glob<{ default: string }>(
  "@/assets/sprites/*.webp",
  { eager: true },
)
const pngModules = import.meta.glob<{ default: string }>(
  "@/assets/sprites/*.png",
  { eager: true },
)

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
```

- [ ] **Step 2: Typecheck + lint**

Run:
```bash
npm run typecheck && npm run lint
```
Expected: both succeed. If `tsc` complains about `import.meta.glob`, ensure `vite/client` is in the project's tsconfig types — check `tsconfig.json` for `"types": ["vite/client"]` or that `vite-env.d.ts` exists (it does — `src/vite-env.d.ts`).

- [ ] **Step 3: Manual visual check**

Run:
```bash
npm run dev
```
Tiles must still render (now via the glob, not the explicit imports). To convince yourself the auto-load is working:

1. Open browser DevTools → Console.
2. Drop a placeholder PNG into the folder: `cp src/assets/sprites/tile_ground.webp src/assets/sprites/_test_orphan.webp` (the `_` prefix means it's silently skipped).
3. Now create an actual orphan: `cp src/assets/sprites/tile_ground.webp src/assets/sprites/notarealslot.webp`.
4. Vite HMR will reload. Console should show:
   `[sprites] orphan asset /src/assets/sprites/notarealslot.webp — no slot named "notarealslot" in SPRITE_REGISTRY...`
5. Clean up: `rm src/assets/sprites/_test_orphan.webp src/assets/sprites/notarealslot.webp`.

- [ ] **Step 4: Commit**

```bash
git add src/game/sprites.ts
git commit -m "feat(sprites): auto-load .webp/.png from src/assets/sprites/

import.meta.glob eager-loads any file in the folder; filename matches
slot name. webp wins over png if both exist. Orphan files (no matching
slot) trigger a dev-mode console warning. Files prefixed _ are skipped.

New asset for an existing slot: drop the file, done. Zero code edits."
```

---

## Task 4: Rendering hygiene — fix tile seams

**Files:**
- Modify: `src/game/render.ts:24-30` (the `draw` function entrypoint where `setTransform` is called)

The translate at `render.ts:51` already rounds `s.cam.x + sx` for the world transform. But sub-pixel rendering issues remain because (a) image smoothing is on by default, and on fractional DPRs (1.5×) bilinear filtering fades the last pixel column toward transparency, and (b) the lerped `s.cam.x` itself is fractional — code paths that read `s.cam.x` directly (rather than the rounded version used in `translate`) end up with sub-pixel positions.

This task does two surgical fixes:

1. Disable image smoothing once after `setTransform` — pixel art sprites should never bilinearly fade.
2. Round `s.cam.x` and `s.cam.y` immediately after the lerp so any downstream reads see integers.

- [ ] **Step 1: Add `imageSmoothingEnabled = false` and round the lerped camera**

Open `src/game/render.ts`, find the top of the `draw` function (around lines 24-43):

```ts
export function draw(ctx: Ctx, s: GameState, ch: Character, alpha: number): void {
  // Reset to a transform that maps world units (VIEWPORT_WIDTH × VIEWPORT_HEIGHT)
  // onto the canvas's actual pixel buffer. App.tsx resizes the buffer to match
  // CSS pixels × devicePixelRatio, so this gives us native-resolution rendering.
  const cv = ctx.canvas
  const scale = cv.width / VIEWPORT_WIDTH
  ctx.setTransform(scale, 0, 0, scale, 0, 0)

  // Render-time interpolation: physics ticks at fixed 60 Hz, render at native
  // refresh. Lerp player + camera between pre-tick and post-tick state so the
  // 2/3/2/3 tick distribution on 144 Hz doesn't read as stutter. Mutate in
  // place across the draw, restore at the end so physics never sees the lerp.
  const realPx = s.p.x,
    realPy = s.p.y
  const realCx = s.cam.x,
    realCy = s.cam.y
  s.p.x = s.p.renderPrevX + (realPx - s.p.renderPrevX) * alpha
  s.p.y = s.p.renderPrevY + (realPy - s.p.renderPrevY) * alpha
  s.cam.x = s.prevCamX + (realCx - s.prevCamX) * alpha
  s.cam.y = s.prevCamY + (realCy - s.prevCamY) * alpha
```

Make these two changes:

(A) **Add `ctx.imageSmoothingEnabled = false`** immediately after the `setTransform` line:

```ts
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  // Pixel-art friendly: disable bilinear filtering. Without this, sprites at
  // fractional DPR (e.g., 1.5× on some Windows displays) fade their last
  // pixel column toward transparency and adjacent tiles appear to have hairline
  // gaps. Has to be set after every setTransform — the property survives,
  // but being explicit here makes the intent obvious.
  ctx.imageSmoothingEnabled = false
```

(B) **Round the lerped camera** — change the two `s.cam.x` / `s.cam.y` assignments at the end of the lerp block:

```ts
  s.cam.x = Math.round(s.prevCamX + (realCx - s.prevCamX) * alpha)
  s.cam.y = Math.round(s.prevCamY + (realCy - s.prevCamY) * alpha)
```

Leaves the player lerp (`s.p.x` / `s.p.y`) fractional — the player is a single moving entity where the rounding-flip artifact isn't visible. Tiles are the ones that show seams because they're a grid.

- [ ] **Step 2: Typecheck + lint**

Run:
```bash
npm run typecheck && npm run lint
```
Expected: both succeed.

- [ ] **Step 3: Manual visual check — verify tile seams are gone**

Run:
```bash
npm run dev
```
Start a new game. Walk slowly left and right across the overworld grass tiles. Before this fix, you'd see 1px shimmering gaps appear and disappear between adjacent tiles as the camera lerps. After: tiles abut cleanly with no visible gap regardless of camera position.

If you have a Windows machine handy at fractional DPR (1.5× or 1.25×), test there too — that's where image smoothing was causing the worst seams.

- [ ] **Step 4: Commit**

```bash
git add src/game/render.ts
git commit -m "fix(render): disable image smoothing + round lerped camera

Eliminates the 1px shimmering gaps between adjacent tiles. Two causes
fixed: (a) bilinear filtering at fractional DPR fades last pixel column
to transparent; (b) downstream reads of s.cam.x/y after the lerp saw
sub-pixel values, producing inconsistent rounding per tile. Camera is
rounded once at the lerp; player position stays fractional (single
entity, no neighbor seams)."
```

---

## Task 5: Animation infrastructure — `tryDrawAnimated` + `animations.ts`

**Files:**
- Create: `src/game/animations.ts` (new — pure functions: frame-index math + per-entity selectors)
- Modify: `src/game/sprites.ts` (add `tryDrawAnimated` function; uses helpers from animations.ts)

This task introduces the animation API but doesn't yet wire it into the renderer. Player and enemies still use `tryDrawSprite` (which short-circuits to false now that they'll be `kind: "sheet"` — but that conversion is Task 6, so for now they remain `kind: "static"` and call sites work unchanged).

- [ ] **Step 1: Create `src/game/animations.ts`**

Full new file:

```ts
// Animation selection + frame-index math. Pure functions of physics state —
// no I/O, no React, no canvas. Enables the renderer to pick the current
// animation for an entity without storing animation state on the entity.

import type { Enemy, PlayerState } from "@/game/types/physics"

// Frame index from world time (in physics ticks). For loop=true, wraps
// modulo frame count. For loop=false, clamps to the last frame so the
// renderer holds the final pose until the caller switches to a different
// animation (e.g. slashFrames hits 0 → selectPlayerAnim picks "idle").
export function frameIndex(
  frames: number,
  fps: number,
  loop: boolean,
  time: number,
): number {
  const tick = Math.floor((time * fps) / 60)
  return loop ? ((tick % frames) + frames) % frames : Math.max(0, Math.min(tick, frames - 1))
}

// Player animation priority order. Higher rules win — death freezes on
// "hurt", then iframe-recovery shows "hurt", then combat actions, then
// air state, then ground state.
export function selectPlayerAnim(p: PlayerState): string {
  if (p.dead) return "hurt"
  if (p.damageIframes > 30) return "hurt" // first half of post-hit window
  if (p.slashFrames > 0) return "slash"
  if (p.dashFrames > 0) return "dash"
  if (!p.onGround && p.vy < 0) return "jump"
  if (!p.onGround) return "fall"
  if (Math.abs(p.vx) > 0.3) return "run"
  return "idle"
}

// Per-archetype enemy animation. Each archetype's selector reads only the
// fields physics already maintains for that AI — windup/lunging for slammer,
// fireCool for spitter, diveTime for burrower, iframes for hit reaction.
export function selectEnemyAnim(e: Enemy): string {
  if (e.iframes > 0) return "hurt"
  switch (e.type) {
    case "ghost":
      return "idle"
    case "slammer":
      if (e.lunging > 0) return "lunge"
      if (e.windup > 0) return "windup"
      return "idle"
    case "spitter":
      // Last 12 ticks of fireCool is the visible wind-up before a shot.
      // 0 means "shot fired this frame, cooldown reset" — also use fire anim.
      if (e.fireCool === 0 || e.fireCool > 78) return "idle"
      if (e.fireCool < 12) return "fire"
      return "idle"
    case "burrower":
      if (e.diveTime > 0) return "dive"
      return "idle"
  }
}
```

- [ ] **Step 2: Update imports at the top of `src/game/sprites.ts`**

Find the top-of-file imports (currently `import type { AssetSpec, SpriteAnchor, SpriteSpec } from "@/game/types/sprites"` after Task 2). Replace that line with:

```ts
import type {
  AssetSpec,
  SheetAnimation,
  SpriteAnchor,
  SpriteSpec,
} from "@/game/types/sprites"
import loadSprite from "@/lib/spriteHelper"
import { frameIndex } from "@/game/animations"
```

(The existing `loadSprite` import line is replaced with the same line — no real change there. The new additions are `SheetAnimation` and `frameIndex`.)

- [ ] **Step 3: Add `tryDrawAnimated` to `src/game/sprites.ts`**

After the existing `tryDrawSprite` function, before the auto-load section, paste:

```ts
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
  const spec = SPRITE_REGISTRY[name]

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
    ctx.drawImage(img, srcX, srcY, frameW, frameH, Math.round(-x + dx) - frameW, Math.round(dy), frameW, frameH)
    ctx.restore()
  } else {
    ctx.drawImage(
      img,
      srcX,
      srcY,
      frameW,
      frameH,
      Math.round(dx),
      Math.round(dy),
      frameW,
      frameH,
    )
  }
  return true
}
```

- [ ] **Step 4: Typecheck + lint**

Run:
```bash
npm run typecheck && npm run lint
```
Expected: both succeed. If `tsc` complains that `tryDrawAnimated` is unused, that's expected — Task 6 wires it up.

- [ ] **Step 5: Manual visual check**

Run:
```bash
npm run dev
```
Game should look identical to before — no animated sprites are wired up yet. This is just confirming the new code compiles and doesn't break existing rendering.

- [ ] **Step 6: Commit**

```bash
git add src/game/animations.ts src/game/sprites.ts
git commit -m "feat(sprites): tryDrawAnimated + animation selectors

Adds the strip/sheet rendering path and pure functions to pick the
current animation from physics state. No call site uses the new path
yet — that's the next commit. selectPlayerAnim and selectEnemyAnim live
in src/game/animations.ts so they can be unit-tested standalone if a
test runner gets added later."
```

---

## Task 6: Convert `player` + 4 enemies to `kind: "sheet"` and integrate

**Files:**
- Modify: `src/game/sprites.ts` (change 5 registry entries from `kind: "static"` to `kind: "sheet"`)
- Modify: `src/game/render.ts` (player draw + enemy draw — call `tryDrawAnimated` before the procedural fallback; pass `s.time` and the selector result)

This is the integration step. After this, dropping a real `player.webp` sheet (192×448px, 4 cols × 7 rows) into `src/assets/sprites/` will animate the player. Without art, all 5 entities continue to render via their existing procedural draws — `tryDrawAnimated` returns false on null `SPRITES.player`, and the existing `tryDrawSprite` path also returns false (because `kind` is now `"sheet"`, not `"static"`), so the function falls through to the procedural code that's already there.

- [ ] **Step 1: Switch the 5 registry entries to `kind: "sheet"`**

In `src/game/sprites.ts`, find the entries for `player`, `enemy_ghost`, `enemy_slammer`, `enemy_spitter`, `enemy_burrower`. Replace them with:

```ts
  // --- Player (sheet) ---
  player: {
    kind: "sheet",
    frameW: 48, frameH: 64, anchor: "bottom-center",
    animations: {
      idle:  { row: 0, frames: 4, fps: 6,  loop: true  },
      run:   { row: 1, frames: 4, fps: 12, loop: true  },
      jump:  { row: 2, frames: 2, fps: 8,  loop: false },
      fall:  { row: 3, frames: 2, fps: 8,  loop: false },
      dash:  { row: 4, frames: 2, fps: 18, loop: false },
      slash: { row: 5, frames: 4, fps: 24, loop: false },
      hurt:  { row: 6, frames: 2, fps: 8,  loop: false },
    },
  },
```

```ts
  // --- Enemies (all sheet) ---
  enemy_ghost: {
    kind: "sheet",
    frameW: 30, frameH: 30, anchor: "center",
    animations: {
      idle: { row: 0, frames: 4, fps: 6,  loop: true  },
      hurt: { row: 1, frames: 2, fps: 12, loop: false },
    },
  },
  enemy_slammer: {
    kind: "sheet",
    frameW: 40, frameH: 40, anchor: "center",
    animations: {
      idle:   { row: 0, frames: 4, fps: 6,  loop: true  },
      windup: { row: 1, frames: 4, fps: 8,  loop: false },
      lunge:  { row: 2, frames: 2, fps: 16, loop: false },
      hurt:   { row: 3, frames: 2, fps: 12, loop: false },
    },
  },
  enemy_spitter: {
    kind: "sheet",
    frameW: 26, frameH: 26, anchor: "center",
    animations: {
      idle: { row: 0, frames: 4, fps: 6,  loop: true  },
      fire: { row: 1, frames: 3, fps: 12, loop: false },
      hurt: { row: 2, frames: 2, fps: 12, loop: false },
    },
  },
  enemy_burrower: {
    kind: "sheet",
    frameW: 36, frameH: 32, anchor: "bottom-center",
    animations: {
      idle: { row: 0, frames: 4, fps: 6,  loop: true  },
      dive: { row: 1, frames: 3, fps: 12, loop: false },
      hurt: { row: 2, frames: 2, fps: 12, loop: false },
    },
  },
```

- [ ] **Step 2: Wire `tryDrawAnimated` into the player draw path in `src/game/render.ts`**

This is delicate because the existing `drawPlayer` function reads `ASSET_SIZES.player.w` and `.h` — but those fields don't exist on a `kind: "sheet"` spec. The replacement reads `frameW` / `frameH` from the registry directly when the sprite path is taken.

Open `src/game/render.ts`, find `drawPlayer` (starts around line 1030). Replace the **first half** of the function (the sprite path, lines ~1030–1056) with this:

```ts
function drawPlayer(ctx: Ctx, s: GameState, ch: Character): void {
  const p = s.p
  const cx = p.x + PLAYER_WIDTH / 2,
    by = p.y + PLAYER_HEIGHT
  // Animated path — picks the current animation from physics state, falls
  // through to the procedural draw if the sheet isn't loaded.
  if (isReady(SPRITES.player)) {
    const anim = selectPlayerAnim(p)
    ctx.save()
    ctx.translate(Math.round(cx), Math.round(by))
    ctx.scale(p.facing, 1)
    // Pass mirror=false because we already applied scale(p.facing, 1) above;
    // tryDrawAnimated would double-flip if we asked it to mirror as well.
    tryDrawAnimated(ctx, "player", 0, 0, anim, s.time, false)
    if (s.activeHasSword) {
      // Hip approximation against the player frame size — read from the
      // registry so changing player frameW/frameH only updates one place.
      const spec = SPRITE_REGISTRY.player
      const frameW = spec.kind === "sheet" ? spec.frameW : spec.kind === "strip" ? spec.frameW : spec.w
      const frameH = spec.kind === "sheet" ? spec.frameH : spec.kind === "strip" ? spec.frameH : spec.h
      const hipX = frameW / 2 - 2
      const hipY = -frameH * 0.5
      drawSword(ctx, hipX, hipY, s.activeWeaponLevel, slashProgress(p))
    }
    ctx.restore()
    return
  }
  // ...procedural fallback (the existing code from `const sq = p.squash` onward) stays unchanged.
```

The procedural fallback (`const sq = p.squash` and everything after, down through the closing `}`) stays exactly as it is.

- [ ] **Step 3: Add the imports to `src/game/render.ts`**

At the top of `render.ts`, change the existing sprites import:

```ts
import { ASSET_SIZES, SPRITES, isReady, tryDrawSprite } from "@/game/sprites"
```

To:

```ts
import {
  ASSET_SIZES,
  SPRITES,
  SPRITE_REGISTRY,
  isReady,
  tryDrawAnimated,
  tryDrawSprite,
} from "@/game/sprites"
import { selectPlayerAnim, selectEnemyAnim } from "@/game/animations"
```

- [ ] **Step 4: Wire `tryDrawAnimated` into the enemy draw path in `src/game/render.ts`**

`drawEnemies` (around line 523) currently has this structure:

```ts
function drawEnemies(ctx: Ctx, s: GameState): void {
  for (const e of s.enemies) {
    if (!e.alive) continue
    // ...stats / cx / cy / flash setup...

    // Sprite path for each archetype — sprite takes priority over the
    // procedural body draw. Skip for diving burrowers (mound view below).
    if (
      !(e.type === "burrower" && e.diveTime > 0) &&
      tryDrawSprite(
        ctx,
        e.type === "ghost"
          ? "enemy_ghost"
          : e.type === "slammer"
            ? "enemy_slammer"
            : e.type === "spitter"
              ? "enemy_spitter"
              : "enemy_burrower",
        cx,
        cy,
      )
    ) {
      // Sprite handled the body. Continue past procedural bodies, but still
      // run chill overlay + HP pip below.
    } else if (e.type === "ghost") {
      // ...ghost procedural...
    } else if (e.type === "slammer") {
      // ...slammer procedural...
    } else if (e.type === "burrower") {
      // ...burrower procedural (handles diving variant)...
    } else if (e.type === "spitter") {
      // ...spitter procedural...
    }

    // Glacial chill overlay + HP pip rendering...
  }
}
```

Replace the `if (...tryDrawSprite(...)) { ... } else if (e.type === "ghost") { ... }` chain (the entire body-draw section above the chill overlay) with this new shape. Keep ALL the procedural archetype blocks exactly as they are — only the dispatch wrapper changes:

```ts
    // Sprite path for each archetype — animated sheet takes priority over
    // the procedural body draw. Skip for diving burrowers (mound view runs
    // in the procedural block below).
    const slotName = (`enemy_${e.type}`) as SpriteName
    const isDiving = e.type === "burrower" && e.diveTime > 0
    let bodyHandled = false
    if (!isDiving && isReady(SPRITES[slotName])) {
      ctx.save()
      ctx.translate(Math.round(cx), Math.round(cy))
      ctx.scale(e.facing, 1)
      bodyHandled = tryDrawAnimated(
        ctx,
        slotName,
        0,
        0,
        selectEnemyAnim(e),
        s.time,
        false, // ctx.scale already applied; don't double-flip
      )
      ctx.restore()
    }
    if (!bodyHandled) {
      if (e.type === "ghost") {
        // ...EXISTING ghost procedural block (lines ~552-569 of pre-task render.ts) — paste unchanged...
      } else if (e.type === "slammer") {
        // ...EXISTING slammer procedural block (lines ~570-610) — paste unchanged...
      } else if (e.type === "burrower") {
        // ...EXISTING burrower procedural block (lines ~611-658) — paste unchanged...
      } else if (e.type === "spitter") {
        // ...EXISTING spitter procedural block (lines ~659-688) — paste unchanged...
      }
    }
```

**Important:** Don't actually retype the procedural blocks. The way to make this edit is:

1. Find the line `if (` followed by `!(e.type === "burrower" && e.diveTime > 0) &&` (the start of the existing dispatch).
2. Find the matching closing `}` before the chill-overlay comment (`// Glacial chill overlay`).
3. Replace ONLY the dispatch wrapper — the lines from `if (` through the first `} else if (e.type === "ghost") {` (inclusive of the `else if (...) {` opening), and similarly close with `} else if (e.type === "spitter") { ... }` becoming `}` instead.

Concretely, the surgical edit is:
- Delete: lines 535–549 (the `if ( !(burrower && diving) && tryDrawSprite(...) ) {` block including the closing `} else` that opens the ghost branch)
- Insert before the `// Sprite path` comment: the new `slotName` / `isDiving` / `bodyHandled` block above
- Change: `} else if (e.type === "ghost") {` → `if (!bodyHandled) {\n      if (e.type === "ghost") {`
- Change: `} else if (e.type === "slammer") {` → `} else if (e.type === "slammer") {` (no change on this line)
- Change: the closing `}` before `// Glacial chill overlay` → `}\n    }` (one extra closing brace for the outer `if (!bodyHandled)`)

If you find the surgical edit confusing, an equivalent (slightly noisier) approach is to delete the whole chain and paste a fresh version with the existing procedural code copied over. Either produces the same result.

- [ ] **Step 5: Typecheck + lint**

Run:
```bash
npm run typecheck && npm run lint
```
Expected: both succeed. If `tsc` complains about `ASSET_SIZES.player.w` reads elsewhere in render.ts (the union narrowing might fail because `kind: "sheet"` doesn't have `.w`), search for any remaining `ASSET_SIZES.player.w/.h` reads outside `drawPlayer` and update them to the same `spec.kind === "sheet" ? spec.frameW : spec.w` ternary, or read directly from `SPRITE_REGISTRY.player`.

- [ ] **Step 6: Manual visual check — verify procedural fallback still works**

Run:
```bash
npm run dev
```
**Critical test:** with NO `player.webp` or enemy sheets in the folder, the game must look identical to before this task. Player draws procedurally (the existing rectangles + head + sword). Enemies draw procedurally. If anything is missing or visually broken, the integration is wrong.

Now stress-test the animation path: drop a placeholder sheet into the folder. Easiest way: copy `tile_ground.webp` to `src/assets/sprites/player.webp`. The player will draw as the tile graphic (because the registry expects 48×64 frames, but the tile is 36×36, so frames will mis-align). That's OK — you're confirming `tryDrawAnimated` is *being called*, not that the art is correct. Remove the placeholder when done:
```bash
rm src/assets/sprites/player.webp
```

- [ ] **Step 7: Commit**

```bash
git add src/game/sprites.ts src/game/render.ts
git commit -m "feat(sprites): wire tryDrawAnimated into player + enemy draws

player + 4 enemy slots flip from kind:static to kind:sheet with
animation tables. selectPlayerAnim / selectEnemyAnim drive the current
frame from physics state. With no sprite art loaded, tryDrawAnimated
returns false and the existing procedural draws still run — zero
visible change until a real sheet is dropped into src/assets/sprites/."
```

---

## Final verification

- [ ] **Step 1: Full typecheck + lint sweep**

```bash
npm run typecheck && npm run lint
```
Expected: clean.

- [ ] **Step 2: Build**

```bash
npm run build
```
Expected: clean. This catches issues that `tsc --noEmit` doesn't (e.g., Vite glob-resolution problems at production build time).

- [ ] **Step 3: Smoke-test the full game in dev**

```bash
npm run dev
```
Walk around overworld, enter a delve, fight an enemy, take damage, slash, dash, glide, return to overworld, talk to NPCs. Procedural draws should look identical to pre-refactor. Tile seams should be gone (compare with `git stash` + reload before this branch landed if you want to A/B).

- [ ] **Step 4: Verify the dev experience**

Drop a draft png into the folder:
```bash
cp src/assets/sprites/tile_ground.webp src/assets/sprites/_my_draft.png
```
Vite HMR reloads. Console should be silent (`_` prefix means skip). Game still works.

Drop an orphan:
```bash
cp src/assets/sprites/tile_ground.webp src/assets/sprites/wrongname.webp
```
Vite HMR reloads. Console should warn `[sprites] orphan asset...wrongname...`. Game still works.

Clean up:
```bash
rm src/assets/sprites/_my_draft.png src/assets/sprites/wrongname.webp
```

---

## Out of scope (deliberately NOT in this plan)

- **Atlas / TexturePacker / Aseprite JSON support** — `kind: "atlas"` is reserved for v2; the discriminated union accepts it without breaking existing entries.
- **Real sprite art** — this plan ships the system; no actual `.webp` sheets are created. Dropping the first `player.webp` happens after this plan lands.
- **Sprite-sheet authoring guide** — separate doc work, not code.
- **Animation transitions / blends / state machines** — current "select by physics state" is enough; no transition logic.
- **Audio asset pipeline** — out of scope.
- **Runtime sprite-upload UI** — out of scope.
- **Per-tile autotiling (corner / edge variants)** — out of scope; that's a separate "tile rendering" phase if you want it later.
