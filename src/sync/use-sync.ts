import { useCallback, useEffect, useState } from "react"
import { useAccount } from "@/auth/account-context"
import { api, ApiError } from "@/net/api"
import { fetchManifest, getSave, persistManifest, setSave } from "@/game/save"
import { findConflicts, type SyncConflict } from "./conflict"
import type { SaveData, SaveMeta } from "@/shared/save"
import type { Settings } from "@/shared/settings"

export interface SyncState {
  conflicts: SyncConflict[]
  /** server slots not present locally — pulled on next manifest sync */
  newRemoteSlots: string[]
  pulling: boolean
  pushing: boolean
  lastPullAt: string | null
  lastError: string | null
}

export interface SyncActions {
  pullManifest: () => Promise<void>
  resolveConflict: (slotKey: string, choice: "cloud" | "local") => Promise<void>
  pushSave: (slotKey: string, data: SaveData, meta: SaveMeta) => Promise<void>
  deleteRemote: (slotKey: string) => Promise<void>
  pushSettings: (data: Settings) => Promise<void>
  pullSettings: () => Promise<Settings | null>
}

export function useSync(): { state: SyncState; actions: SyncActions } {
  const { state: account } = useAccount()
  const [state, setState] = useState<SyncState>({
    conflicts: [],
    newRemoteSlots: [],
    pulling: false,
    pushing: false,
    lastPullAt: null,
    lastError: null,
  })

  const pullManifest = useCallback(async () => {
    if (account.status !== "signed-in") return
    setState((s) => ({ ...s, pulling: true, lastError: null }))
    try {
      const serverList = await api.savesList()
      const localManifest = fetchManifest()
      const conflicts = findConflicts(
        serverList,
        localManifest as ReadonlyArray<SaveMeta & { updatedAt?: string }>,
      )
      const localIds = new Set(localManifest.map((m) => m.id))
      const newRemote = serverList.filter((s) => !localIds.has(s.slotKey)).map((s) => s.slotKey)

      // Pull any new remote slots wholesale into local (no conflict — local doesn't have them).
      for (const slotKey of newRemote) {
        try {
          const got = await api.saveGet(slotKey)
          setSave(slotKey, got.data)
          // Append meta to manifest if not present.
          const fresh = fetchManifest()
          if (!fresh.find((m) => m.id === slotKey)) {
            persistManifest([...fresh, got.meta])
          }
        } catch {
          // best-effort; if a single slot fails just leave it for next pull
        }
      }

      setState((s) => ({
        ...s,
        pulling: false,
        conflicts,
        newRemoteSlots: newRemote,
        lastPullAt: new Date().toISOString(),
      }))
    } catch (e) {
      setState((s) => ({
        ...s,
        pulling: false,
        lastError: e instanceof ApiError ? e.message : "Pull failed",
      }))
    }
  }, [account.status])

  const resolveConflict = useCallback(
    async (slotKey: string, choice: "cloud" | "local") => {
      if (account.status !== "signed-in") return
      if (choice === "cloud") {
        try {
          const got = await api.saveGet(slotKey)
          setSave(slotKey, got.data)
          const m = fetchManifest()
          const next = m.filter((x) => x.id !== slotKey).concat(got.meta)
          persistManifest(next)
        } catch (e) {
          setState((s) => ({ ...s, lastError: e instanceof ApiError ? e.message : "Pull failed" }))
          return
        }
      } else {
        // push local to server
        const data = getSave(slotKey)
        const meta = fetchManifest().find((m) => m.id === slotKey)
        if (data && meta) {
          try {
            await api.savePut(slotKey, {
              data: data as unknown as Record<string, unknown>,
              meta: meta as unknown as Record<string, unknown>,
            })
          } catch (e) {
            setState((s) => ({
              ...s,
              lastError: e instanceof ApiError ? e.message : "Push failed",
            }))
            return
          }
        }
      }
      setState((s) => ({ ...s, conflicts: s.conflicts.filter((c) => c.slotKey !== slotKey) }))
    },
    [account.status],
  )

  const pushSave = useCallback(
    async (slotKey: string, data: SaveData, meta: SaveMeta) => {
      if (account.status !== "signed-in") return
      setState((s) => ({ ...s, pushing: true }))
      try {
        await api.savePut(slotKey, {
          data: data as unknown as Record<string, unknown>,
          meta: meta as unknown as Record<string, unknown>,
        })
        setState((s) => ({ ...s, pushing: false }))
      } catch (e) {
        setState((s) => ({
          ...s,
          pushing: false,
          lastError: e instanceof ApiError ? e.message : "Push failed",
        }))
      }
    },
    [account.status],
  )

  const deleteRemote = useCallback(
    async (slotKey: string) => {
      if (account.status !== "signed-in") return
      try {
        await api.saveDelete(slotKey)
      } catch {
        // best-effort
      }
    },
    [account.status],
  )

  const pushSettings = useCallback(
    async (data: Settings): Promise<void> => {
      if (account.status !== "signed-in") return
      if (!data.syncToAccount) return
      try {
        await api.settingsPut({ data: data as unknown as Record<string, unknown> })
      } catch {
        // best-effort
      }
    },
    [account.status],
  )

  const pullSettings = useCallback(async (): Promise<Settings | null> => {
    if (account.status !== "signed-in") return null
    try {
      const r = await api.settingsGet()
      return r.data as Settings
    } catch (e) {
      if (e instanceof ApiError && e.code === "SETTINGS_NOT_FOUND") return null
      return null
    }
  }, [account.status])

  // Pull manifest on transition to signed-in.
  useEffect(() => {
    if (account.status === "signed-in") {
      void pullManifest()
    }
  }, [account.status, pullManifest])

  return { state, actions: { pullManifest, resolveConflict, pushSave, deleteRemote, pushSettings, pullSettings } }
}
