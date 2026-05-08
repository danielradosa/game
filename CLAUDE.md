# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Drift** — a 2D platformer with combat and a small quest line (Vite + React 18 + TypeScript + Tailwind 3) rendered to a single `<canvas>`. The game loop is imperative; React only owns the menu / HUD / inventory / dialog shell.

## Commands

```bash
npm run dev          # Vite dev server (--host, exposes on LAN)
npm run build        # tsc --noEmit then vite build (typecheck is part of build)
npm run preview      # serve built output
npm run typecheck    # tsc --noEmit only
npm run lint         # oxlint .   (NOT eslint — uses oxc toolchain)
npm run lint:fix
npm run format       # oxfmt . --write
npm run format:check
```

There is no test runner configured.

## Architecture

The split between React state and the canvas game loop is the central thing to understand.

**`src/App.tsx`** is the React shell. It owns scene routing (`menu | about | loadmenu | creator | play`), HUD state (`level`, `xp`, `materials`, `discovered`, `achievements`, `hasSword`, `questStage`, `mods`, `inDelve`), HP, dialog target, the character record, save manifest, and notifications. While `scene === "play"` it mounts a single `<canvas>` and runs a `requestAnimationFrame` loop. **Per-frame mutations live in refs (`stateRef`, `inputRef`, `charRef`, `hudRef`, `pausedRef`, `dialogRef`), not React state** — re-rendering 60×/sec would be untenable. State only goes through `setHud` / `setHp` / `setNotifs` when the *outer* world changes (XP, achievement, scene transition, HP delta, quest stage).

### Fixed-timestep loop (60 Hz) + render interpolation

Physics is authored against a fixed 60 Hz tick (per-tick velocities, frame counters, exponential frictions). To stay identical on 144 / 240 Hz monitors the loop in `App.tsx` uses a time accumulator:

```
TICK_MS = 1000/60, MAX_CATCHUP_TICKS = 5
accumulator += min(100, now - last)
while (accumulator >= TICK_MS) { stepGame(s, …, TICK_MS); accumulator -= TICK_MS }
draw(ctx, s, ch, alpha = accumulator / TICK_MS)
```

`stepGame` snapshots `p.x/y` → `p.renderPrevX/Y` and `cam.x/y` → `prevCamX/Y` at the *start* of each tick. `draw` lerps the live `p.x/y` and `cam.x/y` between those snapshots by `alpha`, then restores them, so motion is smooth on any refresh rate without physics drift. **On any teleport (portal, respawn, load) call `snapRenderPrev(s)` after moving the player** to prevent a lerp smear across the cut.

### Physics → React callbacks

`stepGame` doesn't import React. `App.tsx` builds a `PhysicsCallbacks` object of closures so the loop can poke HUD-visible state when something noteworthy happens:

`grantAch`, `grantXP`, `discover`, `addMaterials`, `getMaterials`, `transitionToDelve`, `transitionToOver`, `hasSword`, `setHp`, `onDeath`, `notify`, `openDialog`, `onDelveClear`, `getMods`.

`getMods()` is read every tick — this is how mods like Quickfeet (+15% run speed) and Lodestone (+60% pickup magnet radius) take effect without recompiling state.

### `src/game/` — framework-agnostic engine (no React imports)

- `constants.ts` — tile size `TILE_SIZE=36`, viewport `VIEWPORT_WIDTH=880 × VIEWPORT_HEIGHT=520`, physics tuning (gravity, jump velocities, dash, coyote/jump-buffer frames), magnet radius, combat tuning (HP, iframes, slash frames/cooldown/reach, enemy stats), `xpForLevel(level)`.
- `levels.ts` — `buildOverworld()` (still hand-authored) and `generateDelve(seed, tier)` (procedural). Tilemaps are `TileChar[][]` where chars encode entities: `#` solid, `=` one-way platform, `c` collectible, `C` big collectible, `n` NPC, `p` portal-to-delve, `r` portal-to-overworld. `isSolid` / `isPlat` are the predicates. `DelveLevel` carries `enemySpawns: EnemySpawn[]`, `seed: number`, `tier: number`. The delve regenerates fresh on every portal entry; the seed is persisted in saves so reloading mid-delve restores the same layout. Reachability is enforced structurally (alternating left/right platforms with bounded vertical gaps) — no graph-search.
- `rng.ts` — seeded mulberry32 PRNG (`seedRng`, `freshSeed`) + helpers (`randInt`, `randRange`, `pick`, `shuffle`, `chance`). All procgen flows through here; never call `Math.random()` from a generator.
- `physics.ts` — `stepGame(s, inp, ch, cb, dt)` mutates state in place. `makeInitialState(ow, dl, x, y, current, collected, defeatedEnemies, delveCleared)` builds the state tree. `spawnEnemiesFrom(spawns, defeated)` rebuilds the active enemy list filtered by the per-run defeated set. `snapRenderPrev(s)` zeros the interpolation snapshot. Implements Warframe-inspired parkour (bullet jump, slide, roll, aim glide, wall latch), pickup magnet, sword auto-slash on enemy overlap, hit-stop on hit, ghost AI that chases the player. The tunables block at the top of the file is the place to tweak feel.
- `render.ts` — `draw(ctx, s, ch, alpha)` renders sky → parallax → bg particles → tiles → entities → enemies → particles → player → slash → vignette. Reads the lerped player/camera (see fixed-timestep section). `drawPaused(ctx)` is the freeze-frame overlay.
- `sprites.ts` — `SPRITES` (image map, all `null` by default), `ASSET_SIZES` (sizing contract), `tryDrawSprite()`, `isReady()` type-predicate. Renderer falls back to procedural drawing when a sprite isn't loaded. **All character sprites must face right; the renderer mirrors automatically.**
- `audio.ts` — `playSnd(name)` / `setMuted()`. Procedural WebAudio by default; replace `SOUNDS[x]` with an `Audio()` element to use a file.
- `save.ts` — localStorage persistence under `drift:save:*` and `drift:save_manifest`. Per-save data is `{ character, hud, pos, collected[], defeatedEnemies[], delveCleared, delveSeed?, delveTier? }`; manifest is the index shown in the load menu. A reserved `"autosave"` slot is overwritten in place every 20s while playing (skipped while paused / in dialog / out of `play` scene).
- `data.ts` — static tables (`ZONES`, `ACHIEVEMENTS`, `SKINS`, `HAIRS`, `SHIRTS`, `PANTS`, `ACCENTS`, `PROPOSED_MODS`, `MODS`). Each table uses `as const satisfies readonly T[]` so the literal types survive, and `ZoneId` / `AchievementId` / `ModId` are derived via `(typeof TABLE)[number]["id"]` — adding a row widens the union automatically.
- `types/{physics,data,sprites,save}.ts` — type contracts shared across the engine.

**`src/ui/`** — React-only screens (`MainMenu`, `About`, `LoadMenu`, `CharacterCreator`, `InventoryPanel`, `DialogPanel`) and `CharacterPreview`. Styling is Tailwind utility classes; no CSS modules. `DialogPanel` is the Elder quest UI: gates the sword on quest accept, exposes the forge with `MODS` once the delve is cleared.

### Input convention

`inputRef` carries both held state (`left`, `right`, `jump`, `dash`, `interact`, `up`, `down`) and **edge flags** (`jumpEdge`, `dashEdge`, `interactEdge`) that fire once on key-down and are consumed inside `stepGame` (it sets them back to `false`). Use the edge flags for one-shot actions (interact, jump start), held flags for continuous movement.

The global keydown / keyup handler in `App.tsx` ignores events whose `target` is editable (`<input>`, `<textarea>`, `<select>`, `contentEditable`), so typing in the character-name field doesn't move the player.

### State shape (game)

```
state = { ow, dl, current, level, cam, prevCamX, prevCamY, p,
          enemies, defeatedEnemies: Set<number>, delveCleared, hitStop,
          collected: Set<string>, particles, bgPart, time,
          hasMoved, hasJumped, hasDashed }
p     = { x, y, vx, vy, onGround, wallDir, jumpsLeft, coyote, jbuf,
          dashFrames, dashCool, dashDx/Dy, facing, anim, squash, prevY, peakFall,
          renderPrevX, renderPrevY,
          airDashUsed, aimGlideUsed, aimGlideFrames, wallLatched,
          sliding, slideFrames, iframes,
          hp, maxHp, damageIframes, slashFrames, slashCool, dead }
```

`collected` keys are `"<scene>:<tx>,<ty>"`; cell pickups are erased from the live `level.map` plus added to this set so saves can restore. `defeatedEnemies` is a `Set<number>` of `EnemySpawn` indices and persists across overworld↔delve transitions within a run, so cleared ghosts stay cleared and `delveCleared` keeps the return portal unlocked.

### Save format compatibility

The save loader defaults missing fields forward (`hud.hasSword ?? true`, `questStage ?? "done"`, `mods ?? []`, `defeatedEnemies ?? []`, `delveCleared ?? false`). When extending `SaveData`, prefer the same pattern over a version bump so old saves stay playable.

## Conventions

- **ESM** (`"type": "module"`), TS strict mode + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`.
- **Indent: 2 spaces, LF, final newline** (`.editorconfig`).
- Lint with **oxlint** (correctness-only category) and format with **oxfmt** (`semi: false`) — do not introduce ESLint or Prettier configs.
- `@/*` path alias maps to `src/*` in both `tsconfig.json` and `vite.config.js`. Use it for cross-module imports.
- The codebase is fully TypeScript; `tsc --noEmit` runs as part of `npm run build`. Keep it clean.
- Tailwind `content` glob covers `.{js,jsx,ts,tsx}` — add new file types here if classes start getting purged in production.
- Canvas pixel buffer is sized to display CSS pixels × `devicePixelRatio`; `render.draw` calls `ctx.setTransform(scale, …)` so all engine code authors in world units (`VIEWPORT_WIDTH × VIEWPORT_HEIGHT`).
