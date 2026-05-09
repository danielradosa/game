// Rarity currency utilities. The game has three rarity tiers — basic (common,
// drops from everything), essence (mid, from stronger enemies + big cells),
// crystal (rare, from burrowers + late-game forge gates). All cost objects
// in MODS / WEAPONS / merchant prices are partial Cost values.

export interface Materials {
  basic: number
  essence: number
  crystal: number
}

export type Cost = {
  basic?: number
  essence?: number
  crystal?: number
}

export const ZERO_MATS: Materials = { basic: 0, essence: 0, crystal: 0 }

export function canAfford(cost: Cost, mats: Materials): boolean {
  return (
    mats.basic >= (cost.basic ?? 0) &&
    mats.essence >= (cost.essence ?? 0) &&
    mats.crystal >= (cost.crystal ?? 0)
  )
}

export function spend(cost: Cost, mats: Materials): Materials {
  return {
    basic: mats.basic - (cost.basic ?? 0),
    essence: mats.essence - (cost.essence ?? 0),
    crystal: mats.crystal - (cost.crystal ?? 0),
  }
}

export function addDelta(mats: Materials, delta: Cost): Materials {
  return {
    basic: mats.basic + (delta.basic ?? 0),
    essence: mats.essence + (delta.essence ?? 0),
    crystal: mats.crystal + (delta.crystal ?? 0),
  }
}

// Like addDelta, but floors each rarity at 0. Use this when the delta may be
// negative (e.g. spending, or future death-penalty subtractions) and you don't
// want the balance to dip below zero on bookkeeping bugs.
export function clampedAddDelta(mats: Materials, delta: Cost): Materials {
  return {
    basic: Math.max(0, mats.basic + (delta.basic ?? 0)),
    essence: Math.max(0, mats.essence + (delta.essence ?? 0)),
    crystal: Math.max(0, mats.crystal + (delta.crystal ?? 0)),
  }
}

// Human-readable cost line like "5 basic · 2 essence". Used by dialog UI.
export function formatCost(cost: Cost): string {
  const parts: string[] = []
  if ((cost.basic ?? 0) > 0) parts.push(`${cost.basic} basic`)
  if ((cost.essence ?? 0) > 0) parts.push(`${cost.essence} essence`)
  if ((cost.crystal ?? 0) > 0) parts.push(`${cost.crystal} crystal`)
  return parts.length === 0 ? "free" : parts.join(" · ")
}

export function formatMissing(cost: Cost, mats: Materials): string {
  const need: string[] = []
  const b = (cost.basic ?? 0) - mats.basic
  const e = (cost.essence ?? 0) - mats.essence
  const c = (cost.crystal ?? 0) - mats.crystal
  if (b > 0) need.push(`${b} basic`)
  if (e > 0) need.push(`${e} essence`)
  if (c > 0) need.push(`${c} crystal`)
  return need.join(" + ")
}
