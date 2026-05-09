import { migrate } from "@/game/save-migrate"
import { SAVE_VERSION } from "@/shared/save-version"
import type { SaveData, SaveManifest } from "@/shared/save"

const SAVE_PREFIX = "drift:save:"
const MANIFEST_KEY = "drift:save_manifest"

export function fetchManifest(): SaveManifest {
  try {
    const raw = localStorage.getItem(MANIFEST_KEY)
    return raw ? (JSON.parse(raw) as SaveManifest) : []
  } catch {
    return []
  }
}

export function persistManifest(m: SaveManifest): boolean {
  try {
    localStorage.setItem(MANIFEST_KEY, JSON.stringify(m))
    return true
  } catch {
    return false
  }
}

export function getSave(id: string): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_PREFIX + id)
    if (!raw) return null
    return migrate(JSON.parse(raw))
  } catch {
    return null
  }
}

export function setSave(id: string, data: SaveData): boolean {
  try {
    const stamped: SaveData = { ...data, version: SAVE_VERSION }
    localStorage.setItem(SAVE_PREFIX + id, JSON.stringify(stamped))
    return true
  } catch {
    return false
  }
}

export function deleteSave(id: string): boolean {
  try {
    localStorage.removeItem(SAVE_PREFIX + id)
    return true
  } catch {
    return false
  }
}
