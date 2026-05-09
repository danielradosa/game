import type { Materials } from "@/game/economy"
import type { Character, LostCache, SceneId } from "@/game/types/physics"

export type QuestStage = "intro" | "active" | "cleared" | "done"

export interface HudState {
  level: number
  xp: number
  materials: Materials
  discovered: string[]
  achievements: string[]
  inDelve: boolean
  hasSword: boolean
  questStage: QuestStage
  mods: string[]
  maxHpBonus: number
  weaponLevel: number
  consumables: { heal: number; storm: number }
  rebirths: number
  perks: string[]
  pendingPerkChoice: 5 | 10 | 15 | null
}

export interface SaveData {
  // Bump via SAVE_VERSION whenever shape changes; client migrate() runs on load.
  version: number
  character: Character
  hud: HudState
  pos: { x: number; y: number; scene: SceneId }
  collected: string[]
  defeatedEnemies: number[]
  delveCleared: boolean
  delveSeed?: number
  delveTier?: number
  portals?: Record<string, PortalStateSerialized>
  activePortalId?: string | null
  worldSeed?: number
  portalDestroyed?: boolean
}

export interface PortalStateSerialized {
  seed: number
  tier: number
  status: "fresh" | "destroyed"
  defeatedEnemies: number[]
  cleared: boolean
  lostCache: LostCache | null
}

export interface SaveMeta {
  id: string
  name: string
  level: number
  materials: number
  discovered: number
  date: string
  where: string
  rebirths: number
  worldSeed: number
}

export type SaveManifest = SaveMeta[]
