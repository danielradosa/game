# Phase D — Asset & Polish

**Status:** Approved design. Implementation pending.
**Date:** 2026-05-09
**Predecessor phases:** A (portal visuals + Merchant), B (combat), C (progression). Phase E (backend / Postgres / Docker) follows after D.

## Goal

Player-facing polish before the backend pivot. Make the equipped weapon visible end-to-end (sword on hip, drawn during slash, per-tier blade). Improve the save load menu. Ship a settings screen with audio, fullscreen, and rebindable keys. First-run tutorial overlay.

## Non-goals

- Audio asset replacement (procedural WebAudio stays)
- Mobile / touch controls (deferred indefinitely)
- Build / hosting (Phase F after E)
- New gameplay features — D is pure polish

---

## D0 · Centered NPC dialogs (precursor fix)

The Merchant and Elder dialog overlays anchor to the bottom of the canvas (`flex items-end`). Rebalance both to `items-center` so the dialog modal sits in the visual middle of the screen, matching the InventoryPanel and PerkPicker conventions. Already applied in working tree; commits with D1.

---

## D1 · Sword visual + sprite pass

### Sword (Option C — sheathed + drawn)

New helper in `render.ts`:

```ts
function drawSword(
  ctx: Ctx,
  anchorX: number,
  anchorY: number,
  facing: -1 | 1,
  weaponLevel: 0 | 1 | 2,
  slashProgress: number, // 0..1, derived from p.slashFrames
)
```

Behavior:

- `slashProgress === 0` → sword is sheathed: short hilt + scabbard at `anchor` (player's right hip).
- `slashProgress > 0` → sword extends from hip → forward → back over the slash duration. Use a quadratic ease so the strike feels weighted: `eased = slashProgress * (2 - slashProgress)`.
- Blade angle sweeps from `+30°` (down-back) at start to `−45°` (forward-up) at peak. Blade length: 18 px (Worn) → 22 px (Forged) → 26 px (Honed).

Per-tier blade visual (`weaponLevel` indexes WEAPONS in data.ts):

- **Worn (lv 0)** — dark grey blade `#888`, single tone, no highlight
- **Forged (lv 1)** — steel `#c0c0d0`, central highlight stripe `#e8eef0`
- **Honed (lv 2)** — mirror `#e0eaf0`, central highlight, **cyan rim glow** while slashing (`rgba(160,220,255,0.5)` outer stroke during `slashProgress > 0`)

Hilt + pommel:

- Hilt grip: leather brown `#5a3a20`
- Crossguard: brass `#b89030` (Worn) → silver `#c8c8d0` (Forged) → polished gold `#e0c060` (Honed)
- Scabbard (sheathed only): dark leather `#3a2818`, peeks out `4×8 px` from the right hip

### Slash visual replacement

The current `drawSlash(ctx, s, ch)` renders a generic arc with mod auras. Refactor:

- Sword renders inline in `drawPlayer` (or just-after) when `p.slashFrames > 0`, using `slashProgress`.
- Mod auras (`searing`, `stormbound`) still render as a separate pass behind/around the sword — keep their existing visuals but center them on the sword's blade midpoint instead of the abstract slash arc center.

### Other sprite-pass items

- Audit SPRITES slots — confirm tile_platform, etc. are wired and others have null defaults
- Confirm the "all sprites face right; renderer mirrors" contract holds with the new sword (mirror via `ctx.scale(facing, 1)` block already used in drawPlayer)
- No sword sprite slot added — it's procedurally drawn so the per-tier visual is data-driven (not asset-dependent). If a custom sword sprite is desired later, a new `SPRITES.sword_lvN` slot can be added with the same `tryDrawSprite` fallback pattern.

---

## D2 · Save manifest UX

In `LoadMenu` (src/ui/screens.tsx):

### Sort dropdown

Toolbar above the rows. `<select>` with options: **Date (newest first)**, **Level (high→low)**, **Rebirths (high→low)**. Default: Date. The sort is client-side on the manifest array.

### Show world seed snippet

Each row gains a small `font-mono` text: `seed: a3f29c` (last 6 hex chars of `worldSeed`). Placed next to the date or under it. `SaveMeta.worldSeed: number` field added; default to `0` for legacy saves missing it.

### Delete confirmation

Wrap the existing delete onClick:

```ts
if (window.confirm(`Delete save "${meta.name}"? This cannot be undone.`)) onDelete(meta.id)
```

(Skipping a custom modal — `window.confirm` matches the Rebirth confirmation pattern from Phase C.)

### Skipped intentionally

- Name filter (low value at typical save count of 1-8)
- Save renaming
- Save metadata editing

---

## D3 · Settings

### New module: `src/game/settings.ts`

```ts
export interface KeyBindings {
  moveLeft: string
  moveRight: string
  moveUp: string
  moveDown: string
  jump: string
  dash: string
  interact: string
  heal: string
  storm: string
}

export interface Settings {
  volume: number      // 0..100, default 80
  muted: boolean      // default false
  fullscreen: boolean // user preference; honored on next entry into play
  keys: KeyBindings
  showTutorialNextStart: boolean
}

export const DEFAULT_KEYS: KeyBindings = {
  moveLeft: "ArrowLeft", moveRight: "ArrowRight",
  moveUp: "ArrowUp", moveDown: "ArrowDown",
  jump: " ",   // Space
  dash: "Shift",
  interact: "e",
  heal: "1",
  storm: "2",
}

export function loadSettings(): Settings { ... }   // localStorage["aw:settings"]
export function saveSettings(s: Settings): void { ... }
```

The default key map mirrors the current hardcoded bindings. Existing players see no change.

### New scene: `"settings"`

Reachable from:

- Main menu — new "Settings" button between "Continue" and "About"
- Pause overlay (drawPaused) — new "Settings" button below "Resume"

### `SettingsMenu` component (new file `src/ui/SettingsMenu.tsx`)

Three sections, each in its own panel:

**Audio**

- Volume slider (range 0-100, label shows current value)
- Mute checkbox
- Wires through new `setVolume(n)` in audio.ts (audio elements / WebAudio gain node)

**Display**

- Fullscreen toggle: clicking calls `document.documentElement.requestFullscreen()` or `document.exitFullscreen()`. Persists user preference; doesn't auto-enter on load (browsers restrict this).

**Controls**

- Grid of action → key. Each row: `[Move Left]   [ArrowLeft] (Rebind)`.
- Click "Rebind" → row enters listen mode → next keydown sets the new key → leave listen mode.
- Esc cancels listen mode. The captured key is the `e.key` value (not `code`), so it follows the user's keyboard layout.
- Conflict detection: if the new key is already bound to another action, show a warning and require confirmation to swap.

### Wiring

`App.tsx` keydown / keyup handlers currently use hardcoded keys (e.g. `"ArrowLeft"`, `"Shift"`). Refactor to read from a settings ref:

```ts
const settingsRef = useRef<Settings>(loadSettings())
// ...
const onKey = (e: KeyboardEvent, down: boolean) => {
  const k = e.key
  const b = settingsRef.current.keys
  if (k === b.moveLeft) inputRef.current.left = down
  else if (k === b.moveRight) inputRef.current.right = down
  // ...etc
}
```

When SettingsMenu commits a change, it updates `settingsRef.current` AND calls `saveSettings()`. No reload needed.

---

## D4 · First-run tutorial

### Detection

`localStorage["aw:hasPlayedBefore"]` flag. On first transition into `scene === "play"` per session AND the flag is missing, mount `<TutorialOverlay>`.

### `TutorialOverlay` (new file `src/ui/TutorialOverlay.tsx`)

Card centered on screen. Lists current key bindings (read from settings — so rebound keys are reflected):

```
Welcome to Aether & Wild

Move:        ← →       (or [moveLeft]/[moveRight])
Jump:        Space     (or [jump])
Dash:        Shift     (or [dash])
Interact:    E         (or [interact])
Heal Potion: 1         (or [heal])
Storm Vial:  2         (or [storm])

Press any key to continue.
```

On dismiss:

- Set `localStorage["aw:hasPlayedBefore"] = "1"`
- Unmount

### Re-trigger from settings

Settings has a checkbox "Show tutorial on next start." Checking it sets `settings.showTutorialNextStart = true`. If true, the tutorial mounts on next play even if the flag is set; mounting clears the field.

---

## Build sequence (5 commits)

| #   | Subject                                       | Files                                                                                                          |
| --- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | sword visual end-to-end + center NPC dialogs  | `render.ts`, `screens.tsx` (already-applied centering)                                                         |
| 2   | save manifest UX (sort + confirm + seed)      | `screens.tsx` LoadMenu, `types/save.ts` SaveMeta.worldSeed, `App.tsx` (worldSeed in saveCurrent/autosave)      |
| 3   | settings infrastructure + audio/fullscreen UI | new `src/game/settings.ts`, new `src/ui/SettingsMenu.tsx`, `audio.ts` setVolume, `App.tsx` scene routing + ref |
| 4   | key rebinding                                 | `App.tsx` keydown handler refactor, `SettingsMenu.tsx` keybind grid                                            |
| 5   | first-run tutorial overlay                    | new `src/ui/TutorialOverlay.tsx`, `App.tsx` first-play detection + mount, settings flag                        |

After commit 5, update CLAUDE.md to mark Phase D shipped and Phase E (backend) as the active next.

## Risks / open questions

- **Sword animation tuning.** Quadratic ease is a guess; may need a peak-and-recoil curve. Iterate during D1 with manual smoke testing.
- **Honed cyan glow** could clash with `stormbound` mod's blue aura. Test combined visually; if noisy, drop the rim glow on Honed when stormbound is active.
- **Key rebinding edge cases.** Modifier keys (Shift/Ctrl/Alt) are bindable but problematic — they only fire `e.key === "Shift"` on press, no character. Document this; allow but don't promote.
- **Settings load failure.** If `localStorage["aw:settings"]` JSON is corrupt, fall back to defaults silently rather than throwing.

## Out of scope

- Server-synced settings (Phase E adds user accounts; settings could become per-account later)
- Per-save settings overrides
- Audio assets (still procedural)
