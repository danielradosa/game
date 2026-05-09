# Phase C — Progression & Meaning

**Status:** Approved design. Implementation pending.
**Date:** 2026-05-09
**Predecessor phases:** A (portal visuals + Merchant), B (combat depth: 4 enemy archetypes, weapon tiers, mods, consumables).

## Goal

Make individual runs _feel like progress_, not just XP-shaped time. Phase B added depth to combat; Phase C adds **stakes** (death penalty), **specialization** (perks), **rarity-driven economy** (essence/crystal), and **world refresh** (rebirth) so the macro-loop has reasons to keep playing past the first cleared delve.

## Non-goals

- New enemy archetypes (Phase B already shipped 4)
- New weapon tiers (existing 3-tier ladder is enough)
- New zones, NPCs, or scenes
- Sprite/audio art (Phase D)
- Mobile / touch controls (Phase D)
- Settings menu, key rebinding (Phase D)

---

## 1. Currency model

Replace `hud.materials: number` with `hud.materials: { basic: number; essence: number; crystal: number }`.

**Naming convention** (visible in HUD + dialog):

- **basic** — common, drops everywhere, color: stone (`#d4d4d4`)
- **essence** — uncommon, drops from mid+ enemies, color: pink (`#f0a0c0`)
- **crystal** — rare, only from burrowers + cleared-delve loot, color: cyan (`#80e0e8`)

**HUD display:** three pip rows in the existing materials slot. Pips render greyed when count is 0.

**Save migration** (in `save.ts` load path):

```ts
hud.materials =
  typeof data.hud.materials === "number"
    ? { basic: data.hud.materials, essence: 0, crystal: 0 }
    : (data.hud.materials ?? { basic: 0, essence: 0, crystal: 0 })
```

**Callback rewrite** in `PhysicsCallbacks`:

- `addMaterials: (delta: { basic?: number; essence?: number; crystal?: number }) => void`
- `getMaterials: () => { basic: number; essence: number; crystal: number }`

**Cost objects** (in `MODS`, `WEAPONS`, merchant prices):

```ts
type Cost = { basic?: number; essence?: number; crystal?: number }
```

`canAfford(cost, materials)` and `spend(cost, materials)` helpers in a small utility module (`src/game/economy.ts`) so React UI and physics share the same logic.

---

## 2. Drop policy (cumulative)

Every kill pays out at least `basic`. Tougher enemies pay all lower tiers too.

| Source       | basic | essence | crystal |
| ------------ | ----- | ------- | ------- |
| ghost        | +1    | —       | —       |
| slammer      | +1    | +1      | —       |
| spitter      | +1    | +1      | —       |
| burrower     | +1    | +1      | +1      |
| cell `c`     | +1    | —       | —       |
| big cell `C` | —     | +1      | —       |

Cells don't drop crystal — crystal is exclusively a combat reward, gating the late-game forge meaningfully.

**Repriced costs:**

| Item                                       | Cost                             |
| ------------------------------------------ | -------------------------------- |
| Tier-1 mods (quickfeet, lodestone)         | 5 basic                          |
| Tier-2 mods (searing, glacial, resilience) | 8 basic + 2 essence              |
| Tier-3 mods (sanguine, stormbound)         | 12 basic + 4 essence + 1 crystal |
| Forged Blade (level 1)                     | 10 basic + 2 essence             |
| Honed Blade (level 2)                      | 25 basic + 6 essence + 2 crystal |
| Heal Potion                                | 3 basic                          |
| Storm Vial                                 | 4 basic + 1 essence              |
| Max HP +1                                  | 5 basic                          |
| **Rebirth**                                | **5 crystal + 30 essence**       |

The Tier 1/2/3 split in `MODS` is implicit today (the `kind` field is "utility" vs "weapon", not a tier). To support the new pricing, **add a `tier: 1 | 2 | 3` field** to each entry in `MODS`. Forge UI doesn't need to display it; it's documentation + a place for cost lookups.

---

## 3. Death penalty + recovery cache

**On death** (inside `cb.onDeath` flow):

1. Compute `lost = floor(materials * 0.25)` for each rarity
2. Subtract from `hud.materials`
3. Stash on the active portal's `PortalState`:
   ```ts
   portal.lostCache = {
     x: p.x,
     y: p.y,
     basic: lostBasic,
     essence: lostEssence,
     crystal: lostCrystal,
   }
   ```
4. Notify: "Lost cache: N materials"
5. Player respawns at overworld spawn (existing behavior)

**Cache rendering:** when re-entering the same portal, if `portal.lostCache !== null`, render a glowing pickup at `(x, y)` in the delve. Not a tilemap entity — drawn directly in `render.ts` as a special case (small particle aura + shimmer). Drawn between the entities pass and the player pass so the player visually overlaps it. This avoids regenerating the tilemap.

**Cache pickup:** in physics, after the existing pickup-magnet block, check distance from `p` to `portal.lostCache`. If within ~32px (one tile):

- Add the rarities back to `hud.materials` via `cb.addMaterials(...)`
- Set `portal.lostCache = null`
- Notify: "Cache reclaimed"
- Particle burst

**Cache loss:** when a portal status flips to `"destroyed"` (cleared exit coin-flip), if `portal.lostCache` is set, clear it (lost forever). Notify: "A sealed rift swallowed your cache."

**`PortalState` extension:**

```ts
interface PortalState {
  // ...existing fields
  lostCache: {
    x: number
    y: number
    basic: number
    essence: number
    crystal: number
  } | null
}
```

**Save serialization:** mirror in `PortalStateSerialized`. Backfill missing field as `null` on load.

---

## 4. Level-up perks

### Data

9 perks in a shared pool. Player picks 1 at hud.level 5, 10, 15. No repeats.

```ts
// src/game/data.ts
export const PERKS = [
  { id: "<id>", name: "<name>", desc: "<one-line>" },
  // ...9 total
] as const satisfies readonly Perk[]

export type PerkId = (typeof PERKS)[number]["id"]
```

**Authoring note** (in-file comment): "Aim for **lateral** balance — perks should reshape playstyle, not strictly stack power. ≥6 of 9 should change _how_ the player plays, not just _how strong_. Strict power perks (Phoenix, +max HP) are fine but should be the minority."

The 9 perk definitions are **deferred to implementation phase** — user fills them in (see Build sequence step 6).

### State

```ts
// HudState
perks: PerkId[]                   // up to 3, in pick order
pendingPerkChoice: 5 | 10 | 15 | null
```

### Trigger

After XP grant, if `hud.level` crosses a milestone _and_ `hud.perks.length < milestoneIndex` _and_ `pendingPerkChoice === null`, set `pendingPerkChoice` to that milestone.

### UI

Modal `<PerkPicker>` mounts when `pendingPerkChoice !== null`. Behaves like the dialog modal — pauses gameplay (set `pausedRef = true` while open). Shows all 9 perks minus already-picked, ordered by id. Click → adds to `hud.perks`, clears `pendingPerkChoice`, unpauses.

### Effect dispatch

- New callback: `cb.hasPerk: (id: PerkId) => boolean`
- Most perks read in `stepGame` exactly like mods (`if (cb.hasPerk("quickfeet_plus")) speed *= 1.15`)
- "One-shot on pick" perks (e.g. permanent +max HP): handled in App when the picker resolves, not in physics

### Save

Persist `hud.perks` and `hud.pendingPerkChoice`. Backfill missing fields as `[]` and `null`.

---

## 5. Wider portal economy + rebirth

### Portal count

`generateOverworld` bumped from 4 portals to **6**. Width-band distribution stays seeded; just one more band.

### Rebirth

Elder dialog gets a fourth option: **Rebirth** — visible only when every portal in `s.portals` has `status === "destroyed"`.

**Cost:** 5 crystal + 30 essence.

**Effect** (atomic, with confirmation prompt):

1. `s.worldSeed = freshSeed()`
2. Regenerate `s.ow = generateOverworld(s.worldSeed)`
3. Clear `s.portals`; rebuild fresh entries from new portal tile positions
4. Clear `s.collected` entries with `over:` prefix (delve keys are portalId-namespaced, naturally gone)
5. `hud.rebirths += 1`
6. Player position = `s.ow.spawn`, then `snapRenderPrev(s)` (no lerp smear)
7. `hud.materials` decremented by cost

**Persists:** level, xp, perks, weapon, mods, maxHpBonus, consumables, achievements, character cosmetics, hp.

**Resets:** worldSeed, portals, collected (overworld only), camera position.

### Save manifest

Add `rebirths: number` to `SaveMeta`. Show as a small badge "♻ ×N" on save rows where `rebirths > 0`.

`hud.rebirths` defaults to 0 on missing.

---

## 6. Achievements pass

### Audit

Walk the existing `ACHIEVEMENTS` table and confirm each fires:

- `a1` First Steps — first run start ✓ (presumed)
- `a2` Air Time — double jump ✓
- `a3` Phase Shift — dash ✓
- `a4` Wayfarer — 3 zones discovered ✓ (CLAUDE.md confirms)
- `a5` Cartographer — all zones ✓
- `a6` Magpie — 5 materials — **VERIFY** (counts what — basic only? sum?)
- `a7` Threshold — Riftgate zone — **VERIFY** triggers
- `a8` Summit — Delve summit — **VERIFY** what counts
- `a9` Climbing the Ladder — Level 5 ✓

For `a6` post-rarity-split: trigger when `basic + essence + crystal >= 5`.

### New (Phase C)

- `a10` **Stash Reclaimed** — recover a death cache for the first time
- `a11` **World Reborn** — first rebirth
- `a12` **Crystal Heart** — earn first crystal
- `a13` **Specialist** — pick all 3 perks (one-time, fires when `hud.perks.length === 3`)

---

## Build sequence (atomic commits)

| #   | Subject                                                | Files                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | feat(phase C): rarity currency model + save migration  | save.ts, save types, App.tsx HUD, types/save.ts, types/physics.ts callback contract, all addMaterials call sites, render.ts (HUD pips)                                                                                                        |
| 2   | feat(phase C): cumulative drop policy + repriced forge | physics.ts (enemy death + cell pickup), data.ts (MODS costs + tier field, WEAPONS costs), DialogPanel.tsx, InventoryPanel.tsx (cost rendering), economy.ts (new utility module)                                                               |
| 3   | feat(phase C): death cache + recovery                  | physics.ts (onDeath, pickup overlap), types/physics.ts (PortalState.lostCache), types/save.ts (PortalStateSerialized.lostCache), save.ts (default), render.ts (cache marker), App.tsx (portal seal cleanup notify)                            |
| 4   | feat(phase C): 6 portals + Rebirth dialog              | levels.ts (portal count), DialogPanel.tsx (Rebirth branch), App.tsx (rebirth handler), save.ts + manifest (rebirths field + badge)                                                                                                            |
| 5   | feat(phase C): perks scaffolding                       | data.ts (PERKS table + 1 example perk wired), types/data.ts, types/save.ts (perks/pendingPerkChoice), types/physics.ts (hasPerk callback), App.tsx (level-up trigger + modal mount), new ui/PerkPicker.tsx, physics.ts (one example dispatch) |
| 6   | feat(phase C): perk pool — _user-authored_             | data.ts (8 more perks), physics.ts (effect dispatches), App.tsx (one-shot pick handlers if any)                                                                                                                                               |
| 7   | feat(phase C): achievements pass                       | physics.ts (audit existing, wire new), data.ts (4 new achievement rows), DialogPanel/notify wiring as needed                                                                                                                                  |

After step 7, update CLAUDE.md "Phase C" section to past tense and add Phase D as the next-up section.

## Risks / open questions

- **Perk balance** is the biggest risk in step 6. The user is authoring this; I'll recommend testing each perk mid-run with `hud.level` debug-set to the milestone before committing.
- **Cumulative drops + 6 portals** could over-inflate currency. After step 4, run a quick playtest pass: clear 2 portals, count materials, sanity-check Rebirth feels expensive but reachable.
- **Cache loss on portal seal** is a hard punishment. If playtesting feels too harsh, soften to "cache transfers to a sibling portal" — but defer that decision until felt.
- **`a6 Magpie` semantics** — current code may count only basic. Decide: sum all rarities, or scale to "5 of any rarity"? Picking sum-all for simplicity.

## Out of scope (deferred to Phase D)

- Sprite art for cache marker, perk icons, rebirth visual
- Audio: rebirth stinger, perk-pick chime
- Tutorial/first-run overlay teaching the rarity system
- Settings (would naturally surface the "rebirths: N" stat)
