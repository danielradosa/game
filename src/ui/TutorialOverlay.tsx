import { formatKey } from "@/ui/SettingsMenu"
import type { Settings } from "@/game/settings"

interface TutorialOverlayProps {
  settings: Settings
  onDismiss: () => void
}

// First-run welcome card. Mounts once on the player's first transition into
// the play scene (gated by localStorage["aw:hasPlayedBefore"]) and can be
// re-triggered from SettingsMenu via showTutorialNextStart (one-shot).
//
// While mounted, App.tsx pauses the game loop AND short-circuits the global
// keydown handler so the user's dismissal keypress doesn't bleed into
// gameplay (see tutorialRef gate in App.tsx). Click the button, click the
// backdrop, or press any key to dismiss.
export function TutorialOverlay({ settings, onDismiss }: TutorialOverlayProps) {
  const k = settings.keys
  return (
    <div
      className="absolute inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onDismiss}
    >
      <div
        className="bg-stone-900 border border-orange-700 rounded-2xl p-8 max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-3xl font-bold text-orange-200 mb-2">Welcome to Aether & Wild</h2>
        <p className="text-stone-300 mb-6">
          A quick reference. You can change any of these in Settings.
        </p>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-6">
          <div className="text-stone-400">Move</div>
          <div className="text-orange-200 font-mono">
            {formatKey(k.moveLeft)} {formatKey(k.moveRight)}
          </div>
          <div className="text-stone-400">Jump (double in air)</div>
          <div className="text-orange-200 font-mono">{formatKey(k.jump)}</div>
          <div className="text-stone-400">Dash / Roll</div>
          <div className="text-orange-200 font-mono">{formatKey(k.dash)}</div>
          <div className="text-stone-400">Interact</div>
          <div className="text-orange-200 font-mono">{formatKey(k.interact)}</div>
          <div className="text-stone-400">Drop / Down</div>
          <div className="text-orange-200 font-mono">{formatKey(k.moveDown)}</div>
          <div className="text-stone-400">Heal Potion</div>
          <div className="text-orange-200 font-mono">{formatKey(k.heal)}</div>
          <div className="text-stone-400">Storm Vial</div>
          <div className="text-orange-200 font-mono">{formatKey(k.storm)}</div>
        </div>
        <p className="text-stone-400 text-xs italic mb-2">
          Tab — Inventory · Esc — Pause · M — Mute
        </p>
        <button
          onClick={onDismiss}
          className="w-full mt-2 bg-orange-300 hover:bg-orange-200 text-stone-900 font-semibold py-2 rounded-lg transition"
        >
          Continue (any key)
        </button>
      </div>
    </div>
  )
}
