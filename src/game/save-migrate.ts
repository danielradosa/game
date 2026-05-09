import { SAVE_VERSION } from "@/shared/save-version"
import type { SaveData } from "@/shared/save"

// Client-side migration chain. Each entry takes data at version N and
// returns data at version N+1. Add a new entry whenever SAVE_VERSION
// bumps; never delete an entry (older saves still need it).
//
// Convention: write each migrator as `(data: any) => any` so the function
// body can mutate freely without re-typing. The chain returns SaveData
// only at the very end, after all upgrades have run.
const MIGRATIONS: Record<number, (data: any) => any> = {
  // v0 -> v1: pre-version saves get the version field stamped on. Older
  // forward-compat defaults already live in toSaveData() below.
  0: (data) => ({ ...data, version: 1 }),
}

export function migrate(rawData: unknown): SaveData {
  let data = rawData as { version?: number } & Record<string, unknown>
  let v = typeof data.version === "number" ? data.version : 0
  while (v < SAVE_VERSION) {
    const fn = MIGRATIONS[v]
    if (!fn) {
      throw new Error(`No migration registered from save version ${v}`)
    }
    data = fn(data)
    v += 1
  }
  return data as unknown as SaveData
}
