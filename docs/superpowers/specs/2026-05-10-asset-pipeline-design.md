# Asset Pipeline & Sprite Sheets

**Status:** Design draft. Awaiting implementation plan.
**Date:** 2026-05-10
**Predecessor:** Phase E (backend) shipped. This is independent of the backend — pure client-side authoring/rendering work.

## Goal

Make adding visual art to Drift painless. Today, every new sprite requires two lines of import/assignment in `src/game/sprites.ts`, and there's no support for animated sprites at all (every visual is a static draw or procedural fallback). After this work:

1. **Drop a `.webp` or `.png` into `src/assets/sprites/<slot>.{webp,png}` and it auto-binds** — zero code changes for an existing slot.
2. **Adding a brand-new slot is one entry in one file**, not three places (current state: `ASSET_SIZES` + `SPRITES` + the `SpriteName` type union).
3. **Sprite sheets are first-class** — strip-per-file or grid layouts, with current animation derived from physics state (no new mutable state on `PlayerState` / `Enemy`).
4. **Tile seams disappear** — fix the 1px sub-pixel gaps that show up between adjacent tiles when the camera lerps to a fractional position.

## Non-goals

- **Atlas format / TexturePacker / Aseprite JSON** — the discriminated union is shaped to accept a `kind: "atlas"` variant later, but no atlas loader code lands in this work. See "Future" section.
- **Runtime sprite-upload UI** — no in-game admin panel. Authoring stays a build-time concern.
- **Auto-derived sizes from image dimensions** — anchor + draw size remain explicit art-direction decisions in the registry.
- **Per-entity animation graphs / blends / state machines** — selecting the current animation from physics state is a single switch, not a graph.
- **Audio assets** — out of scope. Settings audio mute and volume already exist; adding audio files is its own pipeline.

---

## Section 1 · Folder convention + auto-load

### Layout

```
src/assets/
  sprites/
    tile_ground.webp          ← moved from src/assets/
    tile_grass.webp           ← moved
    tile_platform.webp        ← moved
    player.webp               ← drop in when ready (drives the player sprite)
    enemy_ghost.webp
    portal_delve.png          ← png drafts work too; webp wins if both exist
    ...
```

The folder is the source of truth for binding. Filename (minus extension) must match a key in `SPRITE_REGISTRY` exactly.

### Loader

Vite's `import.meta.glob` with `eager: true` resolves the glob at build time — no runtime directory scan, no production overhead, HMR works for free.

```ts
// In src/game/sprites.ts, replacing the explicit imports at the bottom:

const webpModules = import.meta.glob<{ default: string }>(
  "@/assets/sprites/*.webp", { eager: true },
)
const pngModules = import.meta.glob<{ default: string }>(
  "@/assets/sprites/*.png", { eager: true },
)

function bindModules(modules: Record<string, { default: string }>) {
  for (const path in modules) {
    const slot = path.match(/\/([^/]+)\.(webp|png)$/)?.[1]
    if (!slot) continue
    if (!(slot in SPRITE_REGISTRY)) {
      if (import.meta.env.DEV) {
        console.warn(
          `[sprites] orphan asset ${path} — no slot named "${slot}" in SPRITE_REGISTRY. ` +
          `Either rename the file or add the slot to the registry.`,
        )
      }
      continue
    }
    // webp pass runs first; if the slot is already bound, png is skipped.
    if (SPRITES[slot as SpriteName]) continue
    SPRITES[slot as SpriteName] = loadSprite(modules[path]!.default)
  }
}
bindModules(webpModules)  // webp first → wins on collision
bindModules(pngModules)
```

### Behaviors

- **Existing slot, new asset** — drop the file, done. Zero code.
- **Brand-new slot** — add one entry to `SPRITE_REGISTRY` (sizing/anchor/kind) + drop the file. One file edit.
- **Typo** — `playr.webp` triggers a dev-mode `console.warn` naming the orphan and the registry lookup that failed. The file is ignored, no build break.
- **Both `.webp` and `.png` present** — webp wins. Lets you keep a `.png` draft alongside a final `.webp` without manual cleanup.
- **HMR** — Vite's eager glob hot-reloads on file change; sprite swaps without restart.
- **Production** — glob is resolved at build time; bundle is identical to the explicit-import version.

---

## Section 2 · Single source of truth: `SPRITE_REGISTRY`

Today, `sprites.ts` keeps two parallel maps that must stay in sync — `ASSET_SIZES` (sizing/anchor) and `SPRITES` (runtime image map). They share the exact same key set, but nothing enforces that. Drifting them silently breaks one of `tryDrawSprite`'s lookups.

Collapse them into one declarative registry. The shape below is the **target end state** at the end of the migration path; the migration arrives there incrementally — see step 2 (all-static refactor) vs step 5 (player + enemies converted to `sheet`).

```ts
type Anchor = "top-left" | "center" | "bottom-center"

type StaticSpec = {
  kind: "static"
  w: number
  h: number
  anchor: Anchor
}

type StripSpec = {
  kind: "strip"
  frameW: number
  frameH: number
  anchor: Anchor
  frames: number
  fps: number
  loop: boolean
}

type SheetSpec = {
  kind: "sheet"
  frameW: number
  frameH: number
  anchor: Anchor
  animations: Record<string, {
    row: number
    frames: number
    fps: number
    loop: boolean
  }>
}

export type SpriteSpec = StaticSpec | StripSpec | SheetSpec

export const SPRITE_REGISTRY = {
  // --- Static slots (single image, no animation) ---
  tile_ground:        { kind: "static", w: 36, h: 36, anchor: "top-left" },
  tile_grass:         { kind: "static", w: 36, h: 36, anchor: "top-left" },
  tile_platform:      { kind: "static", w: 36, h: 12, anchor: "top-left" },
  tile_ground_delve:  { kind: "static", w: 36, h: 36, anchor: "top-left" },
  tile_platform_delve:{ kind: "static", w: 36, h: 12, anchor: "top-left" },
  collectible:        { kind: "static", w: 24, h: 24, anchor: "center" },
  cache:              { kind: "static", w: 40, h: 40, anchor: "center" },
  portal_delve:       { kind: "static", w: 36, h: 64, anchor: "bottom-center" },
  portal_delve_hard:  { kind: "static", w: 36, h: 64, anchor: "bottom-center" },
  portal_destroyed:   { kind: "static", w: 36, h: 36, anchor: "bottom-center" },
  portal_return:      { kind: "static", w: 36, h: 64, anchor: "bottom-center" },
  npc_elder:          { kind: "static", w: 36, h: 64, anchor: "bottom-center" },
  npc_merchant:       { kind: "static", w: 36, h: 64, anchor: "bottom-center" },
  npc:                { kind: "static", w: 36, h: 64, anchor: "bottom-center" },
  projectile:         { kind: "static", w: 18, h: 18, anchor: "center" },
  weapon_worn:        { kind: "static", w: 64, h: 32, anchor: "center" },
  weapon_forged:      { kind: "static", w: 64, h: 32, anchor: "center" },
  weapon_honed:       { kind: "static", w: 64, h: 32, anchor: "center" },
  aura_searing:       { kind: "static", w: 64, h: 64, anchor: "center" },
  aura_stormbound:    { kind: "static", w: 80, h: 80, anchor: "center" },
  aura_glacial:       { kind: "static", w: 36, h: 36, anchor: "center" },
  aura_sanguine:      { kind: "static", w: 48, h: 48, anchor: "center" },

  // --- Sheet slots (will be migrated as animated art arrives) ---
  player: {
    kind: "sheet",
    frameW: 48, frameH: 64, anchor: "bottom-center",
    animations: {
      idle:  { row: 0, frames: 4, fps: 6,  loop: true },
      run:   { row: 1, frames: 4, fps: 12, loop: true },
      jump:  { row: 2, frames: 2, fps: 8,  loop: false },
      fall:  { row: 3, frames: 2, fps: 8,  loop: false },
      dash:  { row: 4, frames: 2, fps: 18, loop: false },
      slash: { row: 5, frames: 4, fps: 24, loop: false },
      hurt:  { row: 6, frames: 2, fps: 8,  loop: false },
    },
  },

  enemy_ghost:    { kind: "sheet", frameW: 30, frameH: 30, anchor: "center",
    animations: {
      idle: { row: 0, frames: 4, fps: 6,  loop: true },
      hurt: { row: 1, frames: 2, fps: 12, loop: false },
    },
  },
  enemy_slammer:  { kind: "sheet", frameW: 40, frameH: 40, anchor: "center",
    animations: {
      idle:   { row: 0, frames: 4, fps: 6,  loop: true },
      windup: { row: 1, frames: 4, fps: 8,  loop: false },
      lunge:  { row: 2, frames: 2, fps: 16, loop: false },
      hurt:   { row: 3, frames: 2, fps: 12, loop: false },
    },
  },
  enemy_spitter:  { kind: "sheet", frameW: 26, frameH: 26, anchor: "center",
    animations: {
      idle: { row: 0, frames: 4, fps: 6,  loop: true },
      fire: { row: 1, frames: 3, fps: 12, loop: false },
      hurt: { row: 2, frames: 2, fps: 12, loop: false },
    },
  },
  enemy_burrower: { kind: "sheet", frameW: 36, frameH: 32, anchor: "bottom-center",
    animations: {
      idle: { row: 0, frames: 4, fps: 6,  loop: true },
      dive: { row: 1, frames: 3, fps: 12, loop: false },
      hurt: { row: 2, frames: 2, fps: 12, loop: false },
    },
  },
} as const satisfies Record<string, SpriteSpec>

// Derived — single source of truth, no drift possible.
export type SpriteName = keyof typeof SPRITE_REGISTRY

export const SPRITES: SpriteMap = Object.fromEntries(
  (Object.keys(SPRITE_REGISTRY) as SpriteName[]).map((k) => [k, null]),
) as SpriteMap

// Back-compat alias — existing call sites of `ASSET_SIZES[name]` keep working
// without a sweep. Can be removed in a follow-up if/when call sites all use
// SPRITE_REGISTRY directly.
export const ASSET_SIZES = SPRITE_REGISTRY
```

The proposed dimensions/fps for animated entities are starting points based on the existing `ASSET_SIZES` and physics tuning — they will be tuned as real art lands.

---

## Section 3 · Sprite sheet rendering

### Drawing API

The current `tryDrawSprite(ctx, name, x, y)` handles `kind: "static"`. Add two more functions for animated kinds:

```ts
export function tryDrawAnimated(
  ctx: CanvasRenderingContext2D,
  name: SpriteName,
  x: number,
  y: number,
  // Animation name — for "strip" kind, ignored (single anim per slot).
  // For "sheet" kind, must be a key in spec.animations.
  anim: string,
  // World time in physics ticks. Frame index = floor(time * fps / 60).
  // Pass s.time directly. For one-shot anims, the math clamps to the last
  // frame after the duration, so you don't need a separate start-time arg —
  // the renderer naturally returns to the next-priority anim when physics
  // state moves on (e.g. slashFrames hits 0 → selectPlayerAnim picks "idle").
  time: number,
  // Mirror the draw horizontally for left-facing entities. Renderer already
  // does this for procedural draws via ctx.scale.
  mirror?: boolean,
): boolean
```

### Frame index math

```ts
function frameIndex(frames: number, fps: number, loop: boolean, time: number) {
  const tick = Math.floor((time * fps) / 60)
  return loop ? tick % frames : Math.min(tick, frames - 1)
}
```

### Strip drawing (single horizontal row)

Source rect: `(frame * frameW, 0, frameW, frameH)`. Destination rect respects anchor.

### Sheet drawing (grid)

Source rect: `(frame * frameW, animation.row * frameH, frameW, frameH)`.

### Mirror handling

Existing `tryDrawSprite` doesn't mirror — the renderer mirrors via `ctx.save() / ctx.scale(-1, 1) / ctx.translate(...)` around the entire entity draw. Animated sprites use the same mechanism — the new function takes a `mirror` arg so callers can request flipping in one call instead of wrapping each in save/restore. Internally the function applies `ctx.scale(-1, 1)` and adjusts `dx` by `-frameW`.

---

## Section 4 · Animation selection from physics state

No new fields on `PlayerState` or `Enemy`. The current animation is derived in `render.ts` from existing physics fields. This is the same pattern already used for `p.facing` driving the mirror flip.

### Player rules (priority order)

```ts
function selectPlayerAnim(p: PlayerState): string {
  if (p.dead)                  return "hurt"      // dying = falling, hurt freeze frame
  if (p.damageIframes > 30)    return "hurt"      // first half of iframe window
  if (p.slashFrames > 0)       return "slash"
  if (p.dashFrames > 0)        return "dash"
  if (!p.onGround && p.vy < 0) return "jump"
  if (!p.onGround)             return "fall"
  if (Math.abs(p.vx) > 0.3)    return "run"
  return "idle"
}
```

### Enemy rules per archetype

- `ghost`: `iframes > 0 → "hurt"`, else `"idle"`
- `slammer`: `iframes > 0 → "hurt"`, `lunging > 0 → "lunge"`, `windup > 0 → "windup"`, else `"idle"`
- `spitter`: `iframes > 0 → "hurt"`, `fireCool < 12 → "fire"` (last 12 ticks before shot is the wind-up), else `"idle"`
- `burrower`: `iframes > 0 → "hurt"`, `diveTime > 0 → "dive"` (note: also invisible underground in current code), else `"idle"`

These functions live in `render.ts` (or a new `src/game/animations.ts` if they grow). Pure functions of physics state — easy to unit test if a test harness gets added later.

### One-shot timing

Slash and dash are short one-shots. Their start time is implicit: when the animation switches, `tryDrawAnimated` clamps frame index (`Math.min(tick, frames - 1)` for non-loop), so once the slash ends physics-side, the renderer naturally returns to the next-priority anim.

For longer one-shots (slammer windup at 32 frames, hurt at variable iframes), this still works: the renderer reads the physics counter every frame, picks the matching anim, and draws the frame at the count. No state machine, no coordination.

---

## Section 5 · Rendering hygiene (fix tile seams)

Two bugs cause the 1px gaps between adjacent tiles:

### Bug A · Independent per-sprite rounding with a fractional camera

`render.draw(ctx, s, ch, alpha)` lerps `cam.x` between `s.prevCamX` and `s.cam.x` for smooth motion at non-60Hz refresh. The result is a fractional camera position. Each tile is drawn at `tx * TILE_SIZE - cam.x`, then `tryDrawSprite` calls `Math.round(dx)` per tile independently.

When `cam.x = 142.7`:
- Tile 4: `round(144 - 142.7) = round(1.3) = 1`. Spans 1..36.
- Tile 5: `round(180 - 142.7) = round(37.3) = 37`. Spans 37..72. **OK**.

When `cam.x = 142.3`:
- Tile 4: `round(1.7) = 2`. Spans 2..37.
- Tile 5: `round(37.7) = 38`. Spans 38..73. **1px gap at column 37**.

The seams shimmer as the camera moves because the rounding flips per frame.

**Fix:** round `cam.x` and `cam.y` once at the top of `draw()`. All world→screen calcs use the rounded values. Adjacent tiles always abut.

```ts
// In render.draw, after the camera lerp:
const camX = Math.round(s.cam.x)
const camY = Math.round(s.cam.y)
// pass camX/camY (not s.cam.x/y) to tile/entity draw helpers
```

Then `tryDrawSprite` no longer needs its internal `Math.round` calls — they become no-ops because the inputs are already integers.

### Bug B · Image smoothing fades sprite edges

By default, `CanvasRenderingContext2D.imageSmoothingEnabled = true`. When the canvas is scaled (DPR=1.5 on some Windows displays, `setTransform(scale, ...)` for HiDPI), bilinear filtering blurs the last pixel column toward transparency. Adjacent tiles look like they have hairline gaps even when world coords align perfectly.

**Fix:** `ctx.imageSmoothingEnabled = false` at draw start. For pixel art this is the right default anyway — it preserves crisp edges when scaling.

```ts
// In render.draw, immediately after setTransform:
ctx.imageSmoothingEnabled = false
```

### Verification

After both fixes:
1. Walk left/right slowly across the overworld, confirm no shimmering seams between adjacent ground tiles.
2. Stand still and confirm tiles render flush.
3. On a HiDPI display (DPR=2), confirm sprites are crisp, not blurry.
4. On a fractional-DPI display (DPR=1.5), confirm sprites are still crisp (this is where image smoothing was hiding bugs).

---

## Migration path

Order of work, each step independently shippable:

1. **Create `src/assets/sprites/` and move 3 existing webps** into it. Update the 3 explicit imports at the bottom of `sprites.ts` to point to the new path. Verify game still renders. (Trivial, but unblocks step 2.)
2. **Refactor `sprites.ts` to the registry pattern.** Replace `ASSET_SIZES` + `SPRITES` with `SPRITE_REGISTRY` + derived maps. All slots stay `kind: "static"` initially; existing `tryDrawSprite` callers untouched. Verify game renders identically.
3. **Add the auto-load loop** with webp+png + dev-mode orphan warning. Delete the 3 explicit imports/assignments. Verify game renders identically.
4. **Add rendering hygiene fixes** (camera round + `imageSmoothingEnabled = false`). Verify tile seams are gone.
5. **Add `tryDrawAnimated` + `selectPlayerAnim` / per-enemy selectors.** Convert `player` and the 4 enemies to `kind: "sheet"` in the registry. Without art, all 5 sheets fall back to procedural draws (since `SPRITES.player === null`). Verify nothing visually changes.
6. **Drop a real `player.webp` sheet** (4 cols × 7 rows = 192×448px) into `src/assets/sprites/`. Verify all 7 player animations play correctly given physics state.

Each step lands as its own atomic commit. Steps 1–4 are pure refactor + a focused bug fix. Steps 5–6 introduce the new animation API and the first piece of real art.

---

## Future (v2 — atlas / TexturePacker)

Not in scope for this work, but called out so the design doesn't paint into a corner:

- The `SpriteSpec` discriminated union is open — adding `kind: "atlas"` later is purely additive.
- **Tool of choice when v2 lands: TexturePacker** (industry standard, paid). **Aseprite** is the runner-up if Drift ends up with a hand-drawn pixel art aesthetic, since Aseprite's native JSON export has tag-based animations built in — no separate packing step needed.
- **Trigger for v2**: when (a) total frame count crosses ~150 across 50+ source files, OR (b) bundle size becomes a measurable concern, OR (c) AI-gen / commission workflow consistently produces individual frames that need packing.
- The atlas variant will need: `kind: "atlas", anchor, animations: Record<string, { frames: string[], fps, loop }>`, where `frames` are named keys into a sibling JSON file (`<slot>.json`) that maps frame names to source rects. Loader gains one more case in the bind switch.

## Risks & gotchas

- **Filename → slot collision**: if a user accidentally names two assets `player.webp` and `player.png`, webp wins. This is intentional but worth documenting in a code comment so it doesn't surprise anyone debugging "my png isn't showing".
- **HMR with the registry**: if you edit `SPRITE_REGISTRY` itself (changing dimensions, adding a slot), Vite HMR will rebuild the module — usually fine but may cause one frame of flicker. Acceptable.
- **`as const satisfies` requires TS 4.9+**: the project is on a recent TypeScript so this is fine, but worth flagging in case of toolchain version bumps.
- **The orphan warning fires on every dev startup**: if the user keeps draft files in the folder that aren't yet wired to slots, the console will be noisy. Mitigation: support a `_` prefix that the loader skips silently (e.g., `_player_draft.webp`).
- **Sub-pixel rounding fix changes camera "feel"**: rounding `cam.x` to integer means motion is no longer fractionally smooth — it advances in 1-pixel increments. At 60+ FPS this is visually identical to lerped, but at 30 FPS or below it could feel slightly choppier. We're targeting smooth high-refresh play, so this is acceptable; flag if testing reveals issues on lower-end displays.

## Open questions (none currently — all resolved during brainstorm)

- ~~Should atlas format be in scope?~~ **No** — deferred to v2 with TexturePacker as the planned tool.
- ~~Strip vs sheet vs both?~~ **Both** — registry kind chooses per slot.
- ~~Where does animation state live?~~ **Derived from physics state in `render.ts`** — no new mutable fields.
- ~~Webp vs png?~~ **Both supported** — webp wins when both exist.
