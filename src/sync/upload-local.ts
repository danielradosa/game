import { api } from "@/net/api"
import { fetchManifest, getSave, deleteSave, persistManifest } from "@/game/save"

export async function uploadAllLocalSaves(): Promise<{ uploaded: number; failed: string[] }> {
  const manifest = fetchManifest()
  const failed: string[] = []
  let uploaded = 0
  for (const meta of manifest) {
    const data = getSave(meta.id)
    if (!data) continue
    try {
      await api.savePut(meta.id, {
        data: data as unknown as Record<string, unknown>,
        meta: meta as unknown as Record<string, unknown>,
      })
      uploaded += 1
    } catch {
      failed.push(meta.id)
    }
  }
  return { uploaded, failed }
}

export function discardAllLocalSaves(): void {
  const manifest = fetchManifest()
  for (const m of manifest) deleteSave(m.id)
  persistManifest([])
}
