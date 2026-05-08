import type { SaveData, SaveManifest } from "@/game/types/save"

const SAVE_PREFIX = "drift:save:"
const MANIFEST_KEY = "drift:save_manifest"

// Note on the type contract: localStorage hands us untrusted JSON. We're
// asserting the parsed shape with `as` here rather than runtime-validating
// it — if a save was hand-edited or written by an older version with a
// different schema, the load may produce a malformed object. Acceptable
// for a personal game; for shipping software, plug in a validator (zod,
// valibot) in the parse path below.

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
    return raw ? (JSON.parse(raw) as SaveData) : null
  } catch {
    return null
  }
}

export function setSave(id: string, data: SaveData): boolean {
  try {
    localStorage.setItem(SAVE_PREFIX + id, JSON.stringify(data))
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
