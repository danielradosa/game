interface Props {
  count: number
  onUpload: () => void
  onKeepLocalOnly: () => void
  onDiscardLocal: () => void
  busy: boolean
}

export function UploadLocalPrompt({ count, onUpload, onKeepLocalOnly, onDiscardLocal, busy }: Props) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 backdrop-blur-sm">
      <div className="max-w-md w-full rounded-lg border border-zinc-700 bg-zinc-900 p-6 space-y-4">
        <div className="text-lg font-semibold">Upload local saves?</div>
        <div className="text-sm text-zinc-400">
          You have <span className="text-zinc-200 font-semibold">{count}</span> save
          {count === 1 ? "" : "s"} on this device. Upload them to your account so they sync across devices?
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={onUpload}
            disabled={busy}
            className="px-3 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 rounded text-sm font-semibold"
          >
            {busy ? "Uploading…" : "Upload to account"}
          </button>
          <button
            onClick={onKeepLocalOnly}
            disabled={busy}
            className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded text-sm"
          >
            Keep local-only (don&apos;t upload)
          </button>
          <button
            onClick={onDiscardLocal}
            disabled={busy}
            className="px-3 py-2 bg-rose-900 hover:bg-rose-800 disabled:opacity-50 rounded text-sm"
          >
            Discard local saves
          </button>
        </div>
      </div>
    </div>
  )
}
