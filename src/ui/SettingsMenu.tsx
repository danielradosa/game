import { useEffect, useState } from "react"
import { playSnd } from "@/game/audio"
import { DEFAULT_KEYS, type KeyBindings, type Settings } from "@/game/settings"

interface SettingsMenuProps {
  initial: Settings
  onApply: (next: Settings) => void
  onBack: () => void
}

// Action label shown next to each key row in the Controls panel. Keyed by
// KeyBindings field. Order is the array order in CONTROL_ROWS, not object
// declaration — we want movement first, then jump/dash, then utility.
const CONTROL_ROWS: ReadonlyArray<{ key: keyof KeyBindings; label: string }> = [
  { key: "moveLeft", label: "Move Left" },
  { key: "moveRight", label: "Move Right" },
  { key: "moveUp", label: "Move Up" },
  { key: "moveDown", label: "Move Down / Drop" },
  { key: "jump", label: "Jump" },
  { key: "dash", label: "Dash / Roll" },
  { key: "interact", label: "Interact" },
  { key: "heal", label: "Heal Potion" },
  { key: "storm", label: "Storm Vial" },
]

// Render a key value for display. Spaces, arrows, and modifiers print better
// as their human-readable names than their raw e.key strings.
export function formatKey(k: string): string {
  if (k === " ") return "Space"
  if (k === "ArrowLeft") return "←"
  if (k === "ArrowRight") return "→"
  if (k === "ArrowUp") return "↑"
  if (k === "ArrowDown") return "↓"
  if (k.length === 1) return k.toUpperCase()
  return k
}

export function SettingsMenu({ initial, onApply, onBack }: SettingsMenuProps) {
  const [settings, setSettings] = useState<Settings>(initial)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    typeof document !== "undefined" && document.fullscreenElement !== null,
  )
  // Which action (if any) is currently waiting on a keypress. null = idle.
  const [listening, setListening] = useState<keyof KeyBindings | null>(null)

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

  // Listen-mode handler — only mounted while a row is awaiting a keypress.
  // Captures the next keydown (in capture phase, before App.tsx's gameplay
  // handler) and writes it back into settings.keys. Escape cancels without
  // binding so users always have an out.
  useEffect(() => {
    if (listening === null) return
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      const k = e.key
      if (k === "Escape") {
        setListening(null)
        return
      }
      // Conflict detection — find any OTHER action already bound to this key.
      // If found, prompt for swap; on accept, swap so neither slot is empty.
      const conflictAction = (Object.entries(settings.keys) as [keyof KeyBindings, string][]).find(
        ([action, key]) => action !== listening && key === k,
      )
      if (conflictAction) {
        const [otherAction] = conflictAction
        const otherLabel = CONTROL_ROWS.find((r) => r.key === otherAction)?.label ?? otherAction
        const ok = window.confirm(`"${formatKey(k)}" is already bound to "${otherLabel}". Swap?`)
        if (!ok) {
          setListening(null)
          return
        }
        setSettings((s) => {
          const oldKey = s.keys[listening]
          return { ...s, keys: { ...s.keys, [listening]: k, [otherAction]: oldKey } }
        })
      } else {
        setSettings((s) => ({ ...s, keys: { ...s.keys, [listening]: k } }))
      }
      setListening(null)
    }
    window.addEventListener("keydown", onKey, { capture: true })
    return () => window.removeEventListener("keydown", onKey, { capture: true })
  }, [listening, settings.keys])

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

  const resetKeys = (): void => {
    playSnd("click")
    setSettings((s) => ({ ...s, keys: { ...DEFAULT_KEYS } }))
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
              onChange={(e) => setSettings((s) => ({ ...s, volume: Number(e.target.value) }))}
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
            Browsers don't allow auto-entering fullscreen on load — your preference is remembered,
            but you'll re-enter manually each session.
          </p>
          {/* One-shot tutorial re-trigger. Checked here, the welcome overlay
              mounts on the next entry into "play" and the flag flips back to
              false on dismiss (so it doesn't fire repeatedly). */}
          <label className="flex items-center gap-2 text-sm cursor-pointer pt-2">
            <input
              type="checkbox"
              checked={settings.showTutorialNextStart}
              onChange={(e) =>
                setSettings((s) => ({ ...s, showTutorialNextStart: e.target.checked }))
              }
              className="accent-orange-300"
            />
            <span>Show tutorial on next start</span>
          </label>
        </div>

        {/* Controls panel — interactive rebinding. */}
        <div className="bg-stone-800/50 p-5 rounded space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-lg font-semibold text-orange-200">Controls</h3>
            <span className="text-xs text-stone-400 italic">
              Click Rebind, then press a key. Esc cancels.
            </span>
          </div>
          <div className="space-y-1.5 text-sm">
            {CONTROL_ROWS.map(({ key, label }) => {
              const isListening = listening === key
              return (
                <div
                  key={key}
                  className={`flex items-center justify-between gap-3 px-2 py-1 rounded ${
                    isListening ? "ring-2 ring-orange-300 bg-stone-900/40" : ""
                  }`}
                >
                  <span className="text-stone-300 flex-1">{label}</span>
                  <span className="font-mono text-orange-200 bg-stone-900/60 px-2 py-0.5 rounded min-w-[3rem] text-center">
                    {isListening ? "…" : formatKey(settings.keys[key])}
                  </span>
                  <button
                    onClick={() => {
                      playSnd("click")
                      setListening(isListening ? null : key)
                    }}
                    className={`px-3 py-0.5 rounded text-xs ${
                      isListening
                        ? "bg-orange-300 text-stone-900"
                        : "bg-stone-700 hover:bg-stone-600 text-stone-100"
                    }`}
                  >
                    {isListening ? "Press a key…" : "Rebind"}
                  </button>
                </div>
              )
            })}
          </div>
          <div className="flex justify-end pt-1">
            <button
              onClick={resetKeys}
              className="text-xs text-stone-400 hover:text-orange-200 underline"
            >
              Reset to Defaults
            </button>
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
