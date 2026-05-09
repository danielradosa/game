import { useEffect, useState } from "react"
import { playSnd } from "@/game/audio"
import type { KeyBindings, Settings } from "@/game/settings"

interface SettingsMenuProps {
  initial: Settings
  onApply: (next: Settings) => void
  onBack: () => void
}

// Action label shown next to each key row in the Controls preview. Keyed by
// KeyBindings field. Order is the array order in CONTROL_ROWS, not object
// declaration — we want movement first, then jump/dash, then utility.
const CONTROL_ROWS: ReadonlyArray<{ key: keyof KeyBindings; label: string }> = [
  { key: "moveLeft", label: "Move Left" },
  { key: "moveRight", label: "Move Right" },
  { key: "moveUp", label: "Move Up" },
  { key: "moveDown", label: "Move Down" },
  { key: "jump", label: "Jump" },
  { key: "dash", label: "Dash" },
  { key: "interact", label: "Interact" },
  { key: "heal", label: "Heal Potion" },
  { key: "storm", label: "Storm Vial" },
]

// Render a key value for display. Spaces and modifiers print better as their
// human-readable names than their raw e.key strings.
function formatKey(k: string): string {
  if (k === " ") return "Space"
  if (k.length === 1) return k.toUpperCase()
  return k
}

export function SettingsMenu({ initial, onApply, onBack }: SettingsMenuProps) {
  const [settings, setSettings] = useState<Settings>(initial)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    typeof document !== "undefined" && document.fullscreenElement !== null,
  )

  // Sync mute state when an external source (e.g. M-key handler in App)
  // toggles it while the menu is open. Without this, opening the menu
  // snapshots `initial.muted` and any subsequent external toggle would be
  // overwritten on Save.
  useEffect(() => {
    setSettings((s) => ({ ...s, muted: initial.muted }))
  }, [initial.muted])

  // Browser-native fullscreen exits (Esc, F11, alt-tab) bypass our toggle
  // callbacks. Listen for `fullscreenchange` so the button label stays in
  // sync with reality.
  useEffect(() => {
    const handler = () => setIsFullscreen(document.fullscreenElement !== null)
    document.addEventListener("fullscreenchange", handler)
    return () => document.removeEventListener("fullscreenchange", handler)
  }, [])

  const toggleFullscreen = (): void => {
    playSnd("click")
    if (document.fullscreenElement) {
      void document.exitFullscreen().then(() => {
        setIsFullscreen(false)
        setSettings((s) => ({ ...s, fullscreen: false }))
      })
    } else {
      void document.documentElement.requestFullscreen().then(
        () => {
          setIsFullscreen(true)
          setSettings((s) => ({ ...s, fullscreen: true }))
        },
        () => {
          // requestFullscreen rejects if not user-initiated or unsupported.
          // Silent — the toggle just doesn't take effect.
        },
      )
    }
  }

  const handleSave = (): void => {
    playSnd("click")
    onApply(settings)
    onBack()
  }

  return (
    <div
      className="w-full min-h-screen flex items-center justify-center p-8"
      style={{ background: "#1a0e2a" }}
    >
      <div className="max-w-xl w-full text-stone-200 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold text-orange-200">Settings</h2>
          <button
            onClick={() => {
              playSnd("click")
              onBack()
            }}
            className="text-orange-200 hover:text-white text-sm"
          >
            ← Back
          </button>
        </div>

        {/* Audio panel */}
        <div className="bg-stone-800/50 p-5 rounded space-y-4">
          <h3 className="text-lg font-semibold text-orange-200">Audio</h3>
          <div className="space-y-2">
            <label className="flex items-center justify-between text-sm">
              <span>Volume</span>
              <span className="text-stone-400 tabular-nums">{settings.volume}</span>
            </label>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={settings.volume}
              onChange={(e) =>
                setSettings((s) => ({ ...s, volume: Number(e.target.value) }))
              }
              className="w-full accent-orange-300"
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={settings.muted}
              onChange={(e) => setSettings((s) => ({ ...s, muted: e.target.checked }))}
              className="accent-orange-300"
            />
            <span>Mute all audio</span>
          </label>
        </div>

        {/* Display panel */}
        <div className="bg-stone-800/50 p-5 rounded space-y-3">
          <h3 className="text-lg font-semibold text-orange-200">Display</h3>
          <div className="flex items-center justify-between">
            <span className="text-sm">Fullscreen</span>
            <button
              onClick={toggleFullscreen}
              className="bg-stone-700 hover:bg-stone-600 text-stone-100 px-4 py-1.5 rounded text-sm"
            >
              {isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
            </button>
          </div>
          <p className="text-xs text-stone-400">
            Browsers don't allow auto-entering fullscreen on load — your preference is
            remembered, but you'll re-enter manually each session.
          </p>
        </div>

        {/* Controls panel — read-only preview. Rebinding lands in next update. */}
        <div className="bg-stone-800/50 p-5 rounded space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-lg font-semibold text-orange-200">Controls</h3>
            <span className="text-xs text-stone-400 italic">rebinding coming in next update</span>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            {CONTROL_ROWS.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-stone-300">{label}</span>
                <span className="font-mono text-orange-200 bg-stone-900/60 px-2 py-0.5 rounded">
                  {formatKey(settings.keys[key])}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            className="bg-orange-300 hover:bg-orange-200 text-stone-900 font-semibold px-8 py-2 rounded-full"
          >
            Save & Back
          </button>
        </div>
      </div>
    </div>
  )
}
