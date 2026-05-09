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

**`src/App.tsx`** is the React shell. It owns scene routing (`menu | about | loadmenu | creator | play`), HUD state (`level`, `xp`, `materials`, `discovered`, `achievements`, `hasSword`, `questStage`, `mods`, `inDelve`), HP, dialog target, the character record, save manifest, and notifications. While `scene === "play"` it mounts a single `<canvas>` and runs a `requestAnimationFrame` loop. **Per-frame mutations live in refs (`stateRef`, `inputRef`, `charRef`, `hudRef`, `pausedRef`, `dialogRef`), not React state** — re-rendering 60×/sec would be untenable. State only goes through `setHud` / `setHp` / `setNotifs` when the _outer_ world changes (XP, achievement, scene transition, HP delta, quest stage).

### Fixed-timestep loop (60 Hz) + render interpolation

Physics is authored against a fixed 60 Hz tick (per-tick velocities, frame counters, exponential frictions). To stay identical on 144 / 240 Hz monitors the loop in `App.tsx` uses a time accumulator:

```
TICK_MS = 1000/60, MAX_CATCHUP_TICKS = 5
accumulator += min(100, now - last)
while (accumulator >= TICK_MS) { stepGame(s, …, TICK_MS); accumulator -= TICK_MS }
draw(ctx, s, ch, alpha = accumulator / TICK_MS)
```

`stepGame` snapshots `p.x/y` → `p.renderPrevX/Y` and `cam.x/y` → `prevCamX/Y` at the _start_ of each tick. `draw` lerps the live `p.x/y` and `cam.x/y` between those snapshots by `alpha`, then restores them, so motion is smooth on any refresh rate without physics drift. **On any teleport (portal, respawn, load) call `snapRenderPrev(s)` after moving the player** to prevent a lerp smear across the cut.

### Physics → React callbacks

`stepGame` doesn't import React. `App.tsx` builds a `PhysicsCallbacks` object of closures so the loop can poke HUD-visible state when something noteworthy happens:

`grantAch`, `grantXP`, `discover`, `addMaterials`, `getMaterials`, `transitionToDelve`, `transitionToOver`, `hasSword`, `setHp`, `onDeath`, `notify`, `openDialog`, `onDelveClear`, `getMods`.

`getMods()` is read every tick — this is how mods like Quickfeet (+15% run speed) and Lodestone (+60% pickup magnet radius) take effect without recompiling state.

### `src/game/` — framework-agnostic engine (no React imports)

- `constants.ts` — tile size `TILE_SIZE=36`, viewport `VIEWPORT_WIDTH=880 × VIEWPORT_HEIGHT=520`, physics tuning (gravity, jump velocities, dash, coyote/jump-buffer frames), magnet radius, combat tuning (HP, iframes, slash frames/cooldown/reach, enemy stats), `xpForLevel(level)`.
- `levels.ts` — `generateOverworld(seed)` and `generateDelve(seed, tier)` are the procedural generators. Tilemaps are `TileChar[][]` where chars encode entities: `#` solid, `=` one-way platform, `c` collectible, `C` big collectible, `n` Elder NPC, `M` Merchant NPC, `p` portal-to-delve, `r` portal-to-overworld, `X` sealed-portal rubble (inert visual marker). `isSolid` / `isPlat` are the predicates. The overworld randomizes heightmap (two seeded sin layers + 2-4 mesa plateaus), Elder position (flat-3 spot in 8-30 band), Merchant position (flat-3 spot in 35-90 band), 4 portals across width-bands, floating platforms, and cells (some on platforms, some above ground). The delve is a horizontal sidescroll corridor: width (40-70 + tier·8), platform count (~W/9 to W/5), and enemy count (~W/14 to W/8 + tier·2) all roll per seed. `DelveLevel` carries `enemySpawns`, `seed`, `tier`. `buildOverworld` / `buildDelve` are kept as hand-authored fallbacks but unused. The world is reproduced from `s.worldSeed` (persisted in saves) so the same save always loads the same overworld.
- `rng.ts` — seeded mulberry32 PRNG (`seedRng`, `freshSeed`) + helpers (`randInt`, `randRange`, `pick`, `shuffle`, `chance`). All procgen flows through here; never call `Math.random()` from a generator.
- `physics.ts` — `stepGame(s, inp, ch, cb, dt)` mutates state in place. `makeInitialState(...)` builds the state tree. `spawnEnemiesFrom(spawns, defeated)` rebuilds the active enemy list filtered by the per-run defeated set, looking up stats per type from `ENEMY_STATS`. `snapRenderPrev(s)` zeros the interpolation snapshot. Implements Warframe-inspired parkour (bullet jump, slide, roll, aim glide, wall latch), pickup magnet, sword auto-slash on enemy overlap, hit-stop on hit. **Four enemy archetypes** with dispatched AI in the enemy step loop: `ghost` (straight-line chase), `slammer` (chase → 32-frame windup → 14-frame lunge, 3HP, bigger), `spitter` (kites at ~240px, fires `Projectile` orbs every 90 ticks), `burrower` (ground-locked surface chase, dives every 180 ticks for a 120-tick invulnerable underground tunnel toward the player, then emerges). Spitter projectiles are stepped + collided in their own loop. Glacial chill (mod) halves AI speed for 120 ticks; underground burrowers are immune to slash and contact damage but storm vials still hit them. **Active consumables** (heal potion / storm vial) fire on `useHealEdge` / `useStormEdge` input edges (keys 1/2); App owns the inventory and decrements via `cb.useHeal()` / `cb.useStorm()`. Storm AoE is `STORM_RADIUS` around the player and grants `STORM_IFRAMES` of player invuln during the blast.
- `render.ts` — `draw(ctx, s, ch, alpha)` renders sky → parallax → bg particles → tiles → entities → enemies → particles → player → slash → vignette. Reads the lerped player/camera (see fixed-timestep section). `drawPaused(ctx)` is the freeze-frame overlay.
- `sprites.ts` — `SPRITES` (image map, all `null` by default), `ASSET_SIZES` (sizing contract), `tryDrawSprite()`, `isReady()` type-predicate. Renderer falls back to procedural drawing when a sprite isn't loaded. **All character sprites must face right; the renderer mirrors automatically.**
- `audio.ts` — `playSnd(name)` / `setMuted()`. Procedural WebAudio by default; replace `SOUNDS[x]` with an `Audio()` element to use a file.
- `save.ts` — localStorage persistence under `drift:save:*` and `drift:save_manifest`. Per-save data is `{ character, hud, pos, collected[], defeatedEnemies[], delveCleared, delveSeed?, delveTier?, portals?: Record<portalId, PortalStateSerialized>, activePortalId?, portalDestroyed? (deprecated, migrated forward) }`; manifest is the index shown in the load menu. A reserved `"autosave"` slot is overwritten in place every 20s while playing (skipped while paused / in dialog / out of `play` scene).

### Portal state machine

Multiple delve portals are scattered across the overworld (currently hand-placed at x=30/60/85/105 in `buildOverworld()`). Each carries its own independent state machine, keyed by `"<tx>,<ty>"` derived from the `p` tile's grid coords. The state lives in `s.portals: Map<string, PortalState>`:

```ts
PortalState = { seed, tier, status: "fresh" | "destroyed", defeatedEnemies[], cleared }
```

`s.activePortalId` tracks which portal the player is currently inside. Physics passes the interacted tile's coords into `cb.transitionToDelve(portalId)`; App looks up the state, regenerates `s.dl` from `(seed, tier)`, and restores per-portal progress (defeats / cleared) into `s.defeatedEnemies` / `s.delveCleared`. On exit, the current session's progress is snapshotted back into the portal entry. The state transitions on **cleared exit**:

```
[fresh, tier=N] --(clear + exit)--> 50% [fresh, tier=N+1, new seed] (hardmode)
                                     50% [destroyed]                 (rubble)
[destroyed] --(entry attempt)-- "The rift is sealed", no transition
```

When a portal seals, only THAT portal's `"p"` tile mutates to `"X"`. On load, the saved `portals` Record rehydrates into a Map and every `status: "destroyed"` portal replays its tile mutation against the freshly-built `ow.map`. Old single-portal saves with `portalDestroyed: true` migrate forward by marking every `p` tile destroyed.

Delve `collected` keys are namespaced as `"delve:<portalId>:<tx>,<ty>"` so two portals can't collide on the same tile coords.

- `data.ts` — static tables (`ZONES`, `ACHIEVEMENTS`, `SKINS`, `HAIRS`, `SHIRTS`, `PANTS`, `ACCENTS`, `PROPOSED_MODS`, `MODS`, `WEAPONS`). Each table uses `as const satisfies readonly T[]` so the literal types survive, and `ZoneId` / `AchievementId` / `ModId` are derived via `(typeof TABLE)[number]["id"]` — adding a row widens the union automatically. `MODS` carry a `kind: "utility" | "weapon"` field that drives forge-UI grouping; physics special-cases each id (`searing` adds slash damage + flame particles, `stormbound` boosts reach + draws aura/crackles, `sanguine` heals on kill). `WEAPONS` is indexed by `hud.weaponLevel`; the Elder forge sells the next-tier upgrade.
- `types/{physics,data,sprites,save}.ts` — type contracts shared across the engine.

**`src/ui/`** — React-only screens (`MainMenu`, `About`, `LoadMenu`, `CharacterCreator`, `InventoryPanel`, `DialogPanel`) and `CharacterPreview`. Styling is Tailwind utility classes; no CSS modules. `DialogPanel` branches on `npc: NpcId`: Elder gates the sword on quest accept, sells the next-tier weapon upgrade from `WEAPONS`, and exposes `MODS` forge (grouped by `kind: "utility" | "weapon"`) once the delve is cleared. Merchant sells permanent +1 Max HP (cost 5, cap +2), Heal Potions (3 mat each, restores 2 HP, cap 5), and Storm Vials (6 mat each, electric AoE, cap 5). Max HP bonus lives in `hud.maxHpBonus`; consumable counts in `hud.consumables.heal` / `.storm`. All persisted in saves.

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

## Sprite slots (custom art workflow)

Every visual entity has a sprite slot in `src/game/sprites.ts` (`SPRITES` map). To use a custom image: `import src from "@/assets/<file>.webp"`, then `SPRITES.<name> = loadSprite(src)` at the bottom of that file. The renderer always tries the sprite first via `tryDrawSprite()` and falls back to the procedural draw if the slot is `null`. Slots cover: `player`, all four enemies (`enemy_ghost` / `_slammer` / `_spitter` / `_burrower`), both NPCs (`npc_elder` / `npc_merchant`), portals (`portal_delve` / `portal_delve_hard` / `portal_destroyed` / `portal_return`), tiles (`tile_ground` / `_grass` / `_platform` / `_ground_delve` / `_platform_delve`), pickups (`collectible` / `cache`), `projectile` (spitter orb), per-weapon slash visuals (`weapon_worn` / `weapon_forged` / `weapon_honed`), and mod auras (`aura_searing` / `aura_stormbound` / `aura_glacial` / `aura_sanguine`).

## Phase E — backend, accounts, progress sync (next, design draft)

Phases A-D are shipped + post-D polish (combat rebalance, health-bar resize, item-only-in-Wild gate, WASD defaults, Esc cascade, dialog scroll, discovered dedup, Aether/Wild rename). Phase E pivots toward a service-backed multiplayer-ready architecture so saves and progression travel between devices.

**Design draft lives at `docs/superpowers/specs/2026-05-09-phase-e-design.md`** — read that BEFORE starting any implementation. It calls out 10 open questions (Q1–Q10) with provisional recommendations, plus risks / gotchas / out-of-scope items. The user is starting a fresh conversation specifically to walk through the questions one by one before approving the final shape.

Quick summary of provisional recommendations (subject to change in the next session):

- **Stack**: Fastify + Drizzle ORM + Postgres
- **Auth**: Magic-link email (Resend) — guest-first, with optional sign-in for cloud sync
- **Sync**: Last-write-wins per save slot, with a "cloud is newer" prompt on conflict
- **Schema**: 4 tables (`users`, `email_links`, `saves` with `data jsonb`, `user_settings`)
- **Hosting**: Railway for API + managed Postgres; frontend as static
- **Repo**: Monorepo-lite — new `/server` folder for the API, frontend stays at root
- **Auth tokens**: JWT (1d) + refresh (30d), both HTTP-only SameSite=Lax cookies
- **Local dev**: docker-compose orchestrates Postgres + API; magic-link send mocked to stdout

The local-first browser-only behavior stays intact — accounts are opt-in, anonymous play continues to work via localStorage exactly as today.

**For the next conversation:** start with `gsd-resume-work` or just say "let's brainstorm Phase E" and we'll walk the spec's open questions. After alignment, write the implementation plan, then dispatch subagents per task.

## Completed phases

### Phase D — asset & polish (shipped)

- **Sword visual + per-tier blade**: visible sheathed sword on the player's hip; draws on slash, sweeps via quadratic ease; per-tier styling (Worn grey → Forged steel → Honed mirror w/ cyan rim glow).
- **Save manifest UX**: sort dropdown (Date / Level / Rebirths), world-seed snippet on each row, `window.confirm` delete guard.
- **Settings**: new `src/game/settings.ts` (`aw:settings` localStorage), `SettingsMenu` with audio volume slider, mute, fullscreen toggle, and rebindable keys (capture-phase listener, conflict swap, reset-to-defaults). Master volume + mute wired through `audio.ts`. `App.tsx` keydown handler reads bindings live from `settingsRef`.
- **First-run tutorial**: `TutorialOverlay` welcome card mounts on first transition into play (`localStorage["aw:hasPlayedBefore"]`); reads bindings from settings so rebound keys reflect. Re-trigger from SettingsMenu via "Show tutorial on next start" (one-shot — flips back to false on dismiss). Loop is frozen via `tutorialRef`; the dismissal keypress is swallowed so it doesn't bleed into gameplay.

### Phase C — progression & meaning (shipped)

- **Material rarities**: drops differentiated into `{ basic, essence, crystal }` (`src/game/economy.ts`). Cumulative drop policy — every kill pays out at least basic, tougher enemies stack essence/crystal on top.
- **Death cache**: 25% of each rarity stays on the active portal at the death tile. Re-enter the same portal to reclaim it; portal seal wipes any unrecovered cache.
- **Level-up perks**: 9-perk pool (`PERKS` table); player picks 1 at hud.level 5 / 10 / 15 via blocking modal (`src/ui/PerkPicker.tsx`). Effects dispatched in physics via `cb.hasPerk(id)` for runtime perks; one-shot perks (e.g. Vigor +1 maxHp) handled in App's onPick.
- **Wider portal economy + Rebirth**: 6 portals per overworld (was 4). When every portal is destroyed, Elder offers Rebirth (`5 crystal + 30 essence`) which rerolls `worldSeed` while preserving level / perks / weapon / mods / cosmetics. `hud.rebirths` tracked; ♻ ×N badge shown on save manifest rows.
- **Achievements pass**: 13 total (was 9). All a1-a9 audited; a8 Summit scoped to delve scene only. New a10-a13 cover the new systems (Stash Reclaimed, World Reborn, Crystal Heart, Specialist).
