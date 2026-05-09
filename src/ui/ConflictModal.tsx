import type { SyncConflict } from "@/sync/conflict"

interface Props {
  conflict: SyncConflict
  onResolve: (choice: "cloud" | "local") => void
}

export function ConflictModal({ conflict, onResolve }: Props) {
  const fmt = (iso: string) => new Date(iso).toLocaleString()
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 backdrop-blur-sm">
      <div className="max-w-md w-full rounded-lg border border-zinc-700 bg-zinc-900 p-6 space-y-4">
        <div className="text-lg font-semibold">Save conflict</div>
        <div className="text-sm text-zinc-400">
          The cloud copy of <span className="font-mono text-zinc-200">{conflict.serverMeta.name}</span> is newer
          than your local copy. Which do you want to keep?
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded border border-zinc-700 p-3 space-y-1">
            <div className="text-emerald-400 font-semibold">Cloud</div>
            <div>Level {conflict.serverMeta.level}</div>
            <div className="text-zinc-500">{fmt(conflict.serverUpdatedAt)}</div>
          </div>
          <div className="rounded border border-zinc-700 p-3 space-y-1">
            <div className="text-amber-400 font-semibold">Local</div>
            <div>Level {conflict.localMeta.level}</div>
            <div className="text-zinc-500">{fmt(conflict.localUpdatedAt)}</div>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={() => onResolve("local")}
            className="px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-sm"
          >
            Keep local
          </button>
          <button
            onClick={() => onResolve("cloud")}
            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 rounded text-sm"
          >
            Use cloud
          </button>
        </div>
      </div>
    </div>
  )
}
