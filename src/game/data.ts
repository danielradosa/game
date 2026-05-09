import { TILE_SIZE } from "@/game/constants"
import type { Achievement, Mod, Palette, Perk, ProposedMod, Weapon, Zone } from "@/game/types/data"

// `as const satisfies readonly Zone[]` is the trick: `as const` preserves the
// literal types ("z1", "Sunrise Clearing", etc.) so we can derive ZoneId
// below; `satisfies` validates the shape without widening it.
export const ZONES = [
  { id: "z1", name: "Sunrise Clearing", x: 0, y: 0, w: 14 * TILE_SIZE, h: 22 * TILE_SIZE, xp: 90 },
  {
    id: "z2",
    name: "Mossback Bridge",
    x: 14 * TILE_SIZE,
    y: 0,
    w: 18 * TILE_SIZE,
    h: 22 * TILE_SIZE,
    xp: 120,
  },
  {
    id: "z3",
    name: "Whisper Hollow",
    x: 32 * TILE_SIZE,
    y: 0,
    w: 18 * TILE_SIZE,
    h: 22 * TILE_SIZE,
    xp: 140,
  },
  {
    id: "z4",
    name: "The Vista",
    x: 50 * TILE_SIZE,
    y: 0,
    w: 22 * TILE_SIZE,
    h: 22 * TILE_SIZE,
    xp: 200,
  },
  {
    id: "z5",
    name: "Cliffside Way",
    x: 72 * TILE_SIZE,
    y: 0,
    w: 18 * TILE_SIZE,
    h: 22 * TILE_SIZE,
    xp: 160,
  },
  {
    id: "z6",
    name: "Riftgate",
    x: 90 * TILE_SIZE,
    y: 0,
    w: 20 * TILE_SIZE,
    h: 22 * TILE_SIZE,
    xp: 220,
  },
] as const satisfies readonly Zone[]

export const ACHIEVEMENTS = [
  { id: "a1", name: "First Steps", desc: "Take your first run" },
  { id: "a2", name: "Air Time", desc: "Use your double jump" },
  { id: "a3", name: "Phase Shift", desc: "Use your dash" },
  { id: "a4", name: "Wayfarer", desc: "Discover three areas" },
  { id: "a5", name: "Cartographer", desc: "Discover every area" },
  { id: "a6", name: "Magpie", desc: "Collect 5 materials" },
  { id: "a7", name: "Threshold", desc: "Step through the Riftgate" },
  { id: "a8", name: "Summit", desc: "Reach the Delve summit" },
  { id: "a9", name: "Climbing the Ladder", desc: "Reach Level 5" },
  { id: "a10", name: "Stash Reclaimed", desc: "Recover a death cache" },
  { id: "a11", name: "World Reborn", desc: "Rebirth the world for the first time" },
  { id: "a12", name: "Crystal Heart", desc: "Earn your first crystal" },
  { id: "a13", name: "Specialist", desc: "Pick all 3 perks" },
] as const satisfies readonly Achievement[]

// Derived ID unions — single source of truth is the data tables above.
// Add a new achievement and the union widens automatically; remove one and
// every stale reference becomes a build error.
export type ZoneId = (typeof ZONES)[number]["id"]
export type AchievementId = (typeof ACHIEVEMENTS)[number]["id"]

export const SKINS = [
  "#f4d4b8",
  "#e8c1a0",
  "#d4a07e",
  "#a87154",
  "#7a4d3a",
  "#523829",
] as const satisfies Palette

export const HAIRS = [
  "#1a1410",
  "#3a2a20",
  "#7a4d2a",
  "#c08040",
  "#d4b070",
  "#e8d8a0",
  "#5a3a8a",
  "#c84080",
] as const satisfies Palette

export const SHIRTS = [
  "#5e7c8e",
  "#8e5e6e",
  "#5e8e6c",
  "#a86040",
  "#6a6a8e",
  "#3a3a3a",
  "#d4a050",
  "#7a4080",
] as const satisfies Palette

export const PANTS = [
  "#3a4250",
  "#2a2a35",
  "#4a3a2a",
  "#5a4030",
  "#3a3a4a",
  "#252525",
  "#5a5050",
  "#3a2a4a",
] as const satisfies Palette

export const ACCENTS = [
  "#e8a04a",
  "#4ae8b0",
  "#e84a8a",
  "#4aa8e8",
  "#e8e84a",
  "#a04ae8",
  "#ffffff",
  "#1a1a1a",
] as const satisfies Palette

export const PROPOSED_MODS = [
  { n: "Phase Dash", d: "Pass through enemies" },
  { n: "Updraft", d: "Jumps create wind gusts" },
  { n: "Soft Land", d: "No fall stagger" },
  { n: "Echo", d: "Dash leaves a damaging trail" },
] as const satisfies readonly ProposedMod[]

// Active mods. Each id is special-cased in physics.ts where its effect lives.
// Two flavors here: "utility" (movement, magnet) and "weapon" (combat
// modifiers / slash visuals). The split is informal — the kind field just
// drives which forge column the mod renders into. tier (1/2/3) gates which
// rarities are required: t1 = basic only, t2 = +essence, t3 = +crystal.
export const MODS = [
  {
    id: "quickfeet",
    name: "Quickfeet",
    desc: "+15% movement speed",
    cost: { basic: 5 },
    kind: "utility",
    tier: 1,
  },
  {
    id: "lodestone",
    name: "Lodestone",
    desc: "Greatly extends pickup magnet radius",
    cost: { basic: 5 },
    kind: "utility",
    tier: 1,
  },
  {
    id: "searing",
    name: "Searing Edge",
    desc: "Slash leaves a fire trail · +1 damage",
    cost: { basic: 8, essence: 2 },
    kind: "weapon",
    tier: 2,
  },
  {
    id: "stormbound",
    name: "Stormbound",
    desc: "Crackling aura · slash reach +50%",
    cost: { basic: 12, essence: 4, crystal: 1 },
    kind: "weapon",
    tier: 3,
  },
  {
    id: "sanguine",
    name: "Sanguine",
    desc: "Heal 1 HP per enemy slain",
    cost: { basic: 12, essence: 4, crystal: 1 },
    kind: "weapon",
    tier: 3,
  },
  {
    id: "glacial",
    name: "Glacial Edge",
    desc: "Slash chills · 50% slower enemies for 2s",
    cost: { basic: 8, essence: 2 },
    kind: "weapon",
    tier: 2,
  },
  {
    id: "resilience",
    name: "Resilience",
    desc: "Damage iframes +50% — survive longer",
    cost: { basic: 8, essence: 2 },
    kind: "utility",
    tier: 2,
  },
] as const satisfies readonly Mod[]

export type ModId = (typeof MODS)[number]["id"]

// Tiered weapons. weaponLevel in HudState indexes this array. Only the Elder
// forge sells upgrades; cost is a rarity bundle. Damage is the slash base —
// mods stack on top via additive bonuses inside physics.ts.
export const WEAPONS = [
  {
    level: 0,
    name: "Worn Blade",
    desc: "A nicked, balanced edge",
    damage: 6,
    cost: {},
  },
  {
    level: 1,
    name: "Forged Blade",
    desc: "Hammered true · sharper bite",
    damage: 10,
    cost: { basic: 10, essence: 2 },
  },
  {
    level: 2,
    name: "Honed Blade",
    desc: "Mirror-polished · cuts the air",
    damage: 15,
    cost: { basic: 25, essence: 6, crystal: 2 },
  },
] as const satisfies readonly Weapon[]

// Level-up perks. One picked at hud.level 5, 10, 15 (no repeats).
// Aim for LATERAL balance — perks should reshape playstyle, not strictly
// stack power. ≥6 of 9 should change *how* the player plays. Strict power
// perks (Phoenix-style revives, +max HP) are fine but should be the minority.
export const PERKS = [
  {
    id: "quickfeet_plus",
    name: "Quickfeet+",
    desc: "+1 dash charge — chain a second air dash before landing",
  },
  // Lateral (reshape playstyle):
  { id: "lodestone_plus", name: "Lodestone+", desc: "Greatly extends pickup magnet radius" },
  { id: "scholar", name: "Scholar", desc: "+50% XP from kills" },
  { id: "greed", name: "Greed", desc: "+1 basic per kill" },
  { id: "ironclad", name: "Ironclad", desc: "Hit-iframes last 50% longer" },
  { id: "swift_strike", name: "Swift Strike", desc: "Slash cooldown -15%" },
  { id: "long_arm", name: "Long Arm", desc: "Slash reach +25%" },

  // Strict power (use sparingly):
  { id: "vigor", name: "Vigor", desc: "+1 max HP permanently" },
  { id: "phoenix", name: "Phoenix", desc: "Revive once per session at 2 HP" },
] as const satisfies readonly Perk[]

export type PerkId = (typeof PERKS)[number]["id"]
