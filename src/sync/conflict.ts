import type { SaveManifestEntry } from "@/net/api"
import type { SaveMeta } from "@/shared/save"

export interface SyncConflict {
  slotKey: string
  serverMeta: SaveMeta
  serverUpdatedAt: string
  localMeta: SaveMeta
  localUpdatedAt: string
}

// Returns slots where server is strictly newer than local.
// Uses ISO string comparison — server timestamps are canonical.
export function findConflicts(
  serverList: SaveManifestEntry[],
  localManifest: ReadonlyArray<SaveMeta & { updatedAt?: string }>,
): SyncConflict[] {
  const out: SyncConflict[] = []
  for (const s of serverList) {
    const local = localManifest.find((m) => m.id === s.slotKey)
    if (!local) continue
    const localTs = local.updatedAt ?? local.date
    if (s.updatedAt > localTs) {
      out.push({
        slotKey: s.slotKey,
        serverMeta: s.meta,
        serverUpdatedAt: s.updatedAt,
        localMeta: local,
        localUpdatedAt: localTs,
      })
    }
  }
  return out
}
