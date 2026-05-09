// User-facing settings — persisted to localStorage["aw:settings"], loaded
// once at app boot, and committed back whenever the SettingsMenu commits.
//
// Defaults mirror the current hardcoded keybindings so existing players see
// no change. The keydown handler in App.tsx still uses hardcoded keys at this
// point; key rebinding is the follow-up task and will swap the handler over
// to read from this settings ref.

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
  volume: number // 0..100, default 80
  muted: boolean // default false
  fullscreen: boolean // user preference; not auto-applied on load
  keys: KeyBindings
  showTutorialNextStart: boolean
}

export const DEFAULT_KEYS: KeyBindings = {
  // WASD-style platformer defaults. W is moveUp (used for aim-glide direction
  // in air), Space is jump. Players who prefer arrows or W=jump can rebind
  // through the Settings menu.
  moveLeft: "a",
  moveRight: "d",
  moveUp: "w",
  moveDown: "s",
  jump: " ", // Space
  dash: "Shift",
  interact: "e",
  heal: "1",
  storm: "2",
}

const DEFAULT_SETTINGS: Settings = {
  volume: 80,
  muted: false,
  fullscreen: false,
  keys: DEFAULT_KEYS,
  showTutorialNextStart: false,
}

const KEY = "aw:settings"

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_SETTINGS, keys: { ...DEFAULT_KEYS } }
    const parsed = JSON.parse(raw) as Partial<Settings>
    // Defensive merge — accept partial saved data and fall through to
    // defaults for any missing field. Never throw on corrupt input.
    // `keys` is validated separately because non-string values would
    // TypeError downstream (e.g. `(99).toUpperCase()` in formatKey).
    const rawKeys =
      typeof parsed.keys === "object" && parsed.keys !== null
        ? (parsed.keys as unknown as Record<string, unknown>)
        : {}
    const safeKeys = Object.fromEntries(
      Object.entries(rawKeys).filter(([, v]) => typeof v === "string"),
    ) as Partial<KeyBindings>
    return {
      volume: typeof parsed.volume === "number" ? parsed.volume : DEFAULT_SETTINGS.volume,
      muted: parsed.muted ?? DEFAULT_SETTINGS.muted,
      fullscreen: parsed.fullscreen ?? DEFAULT_SETTINGS.fullscreen,
      keys: { ...DEFAULT_KEYS, ...safeKeys },
      showTutorialNextStart: parsed.showTutorialNextStart ?? false,
    }
  } catch {
    return { ...DEFAULT_SETTINGS, keys: { ...DEFAULT_KEYS } }
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // Quota / privacy mode — silent fall-through. Settings still apply
    // for the current session; just won't persist.
  }
}
