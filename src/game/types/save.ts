// Persistence layer types for src/game/save.ts.
// Save data lives in localStorage; the manifest is the index that the
// load menu enumerates without loading every save body.

import type { Character, SceneId } from "@/game/types/physics"

// HUD state mirrored into a save. Defined here (rather than App.tsx) because
// save.ts is the consumer that needs the contract.
export type QuestStage = "intro" | "active" | "cleared" | "done"

export interface HudState {
  level: number
  xp: number
  materials: number
  discovered: string[] // ZoneId values (kept loose — see data.ts)
  achievements: string[] // AchievementId values (loose for the same reason)
  inDelve: boolean
  hasSword: boolean
  questStage: QuestStage
  mods: string[] // crafted mod ids (see data.ts MODS)
}

// What gets serialized into one save slot.
export interface SaveData {
  character: Character
  hud: HudState
  pos: {
    x: number
    y: number
    scene: SceneId
  }
  collected: string[] // "<scene>:<tx>,<ty>" keys; rehydrated into a Set on load
  defeatedEnemies: number[] // current delve session's defeats
  delveCleared: boolean // current delve session's cleared flag
  // Procedural delve identity for the CURRENT session. Optional for backwards
  // compat with saves created before procgen landed.
  delveSeed?: number
  delveTier?: number
  // Per-portal state machine, serialized as a Record (Maps don't JSON cleanly).
  portals?: Record<string, PortalStateSerialized>
  activePortalId?: string | null
  // DEPRECATED single-portal flag from before multi-portal landed. Old saves
  // with this set get migrated forward on load.
  portalDestroyed?: boolean
}

// Mirror of PortalState with the Set serialized as an array. Stays in sync
// with the runtime shape in src/game/types/physics.ts.
export interface PortalStateSerialized {
  seed: number
  tier: number
  status: "fresh" | "destroyed"
  defeatedEnemies: number[]
  cleared: boolean
}

// One row in the load-menu list. Cheap to enumerate.
export interface SaveMeta {
  id: string
  name: string
  level: number
  materials: number
  discovered: number // count, not list — keeps the manifest small
  date: string // ISO string from new Date().toISOString()
  where: string // human-readable: "In the Delve" | "Surface"
}

export type SaveManifest = SaveMeta[]
