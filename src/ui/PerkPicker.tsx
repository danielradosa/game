import { PERKS, type PerkId } from "@/game/data"

// Modal that mounts on level-up at hud.level 5 / 10 / 15. Pauses the game
// (App owns that side-effect) until the player picks a perk. Already-picked
// perks are filtered out so each milestone offers a non-empty unique pool.
// While Phase C ships only one entry, the UI is grid-shaped to scale to the
// full 9-perk pool in the next commit.
interface PerkPickerProps {
  milestone: 5 | 10 | 15
  alreadyPicked: string[]
  onPick: (id: PerkId) => void
}

export function PerkPicker({ milestone, alreadyPicked, onPick }: PerkPickerProps) {
  const available = PERKS.filter((p) => !alreadyPicked.includes(p.id))

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm rounded-lg p-4 overflow-auto">
      <div className="bg-stone-900 rounded-xl p-6 max-w-2xl w-full max-h-full overflow-auto border border-violet-700/40 shadow-[0_0_60px_rgba(160,80,255,0.2)]">
        <div className="text-xs text-violet-300 uppercase tracking-widest mb-1">
          Level {milestone} reached
        </div>
        <h2 className="text-2xl font-bold text-stone-100 mb-1">Choose a Perk</h2>
        <p className="text-sm text-stone-400 mb-4">
          Permanent. {alreadyPicked.length} / 3 chosen so far.
        </p>
        {available.length === 0 ? (
          <div className="text-stone-400 italic">
            No perks available — check back when more land in the next update.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {available.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPick(p.id as PerkId)}
                className="text-left p-3 bg-stone-800 hover:bg-stone-700 border border-stone-700 hover:border-violet-500 rounded transition-colors"
              >
                <div className="font-bold text-violet-200">{p.name}</div>
                <div className="text-xs text-stone-300 mt-1">{p.desc}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
