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
  defeatedEnemies: number[] // delve spawn indices defeated this run
  delveCleared: boolean
  // Procedural delve identity. Optional for backwards compat with saves
  // created before procgen landed — those default to a fresh seed on load.
  delveSeed?: number
  delveTier?: number
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
