// Shop pricing and caps for the Merchant + consumable inventory.
// Kept distinct from `economy.ts` (which is currency math) because these are
// product/balance constants that the UI and the buy callbacks both consume.
// Centralizing here prevents the dialog UI and App's onBuy* handlers from
// silently desyncing on a balance change.

import type { Cost } from "@/game/economy"

export const HEAL_COST: Cost = { basic: 3 }
export const STORM_COST: Cost = { basic: 4, essence: 1 }
export const MERCHANT_HP_COST: Cost = { basic: 5 }

// Max permanent +Max HP bonus the merchant will sell, total across all
// purchases. Caps growth so HP doesn't spiral.
export const MERCHANT_HP_MAX_BONUS = 2

// Per-slot inventory cap for stackable consumables (heal, storm).
export const CONSUMABLE_CAP = 5

// Cost of an Elder Rebirth — rerolls worldSeed and rebuilds portals. Visible
// only when every portal in s.portals has status "destroyed" (i.e. the run
// has hit a wall and needs a refresh). Pricing is intentionally steep so it
// gates behind a real burrower-grinding session.
export const REBIRTH_COST: Cost = { crystal: 5, essence: 30 }
