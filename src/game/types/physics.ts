// Type contract for the imperative game loop.
// Used by physics.ts (mutates), render.ts (reads), App.tsx (bridges to React).

// ===== Tilemap chars =====
// Match the keys produced by levels.ts:
//   "#" solid  · "=" one-way platform  · "c" collectible  · "C" big collectible
//   "n" NPC    · "p" portal-to-delve   · "r" portal-to-overworld  · " " empty
// "X" is rubble — what a destroyed delve portal becomes after the coin flip
// seals it shut. Inert: no interact, not solid, just a visual marker.
// "M" is the Merchant NPC, distinct from "n" (Elder) so dialog can branch.
export type TileChar = "#" | "=" | "c" | "C" | "n" | "M" | "p" | "r" | "X" | " "

export type Theme = "over" | "delve"
export type SceneId = "over" | "delve"

// ===== Vectors / primitives =====
export interface Vec2 {
  x: number
  y: number
}

export interface Camera {
  x: number
  y: number
  shake: number
}

// ===== Particles =====
// Matches the shape pushed in physics.addParticles().
export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  color: string
  size: number
  g: number
}

export interface BgParticle {
  x: number
  y: number
  s: number // size
  o: number // opacity
  sp: number // vertical drift speed
}

// ===== Levels =====
export interface BaseLevel {
  map: TileChar[][]
  W: number
  H: number
  spawn: Vec2
  theme: Theme
}

export interface OverworldLevel extends BaseLevel {
  theme: "over"
  ground: number[]
}

export interface EnemySpawn {
  type: EnemyType
  x: number
  y: number
}

export interface DelveLevel extends BaseLevel {
  theme: "delve"
  enemySpawns: EnemySpawn[]
  // Seed and tier identify a procedural delve instance. Persisted in saves so
  // reloading a delve-mid-session reproduces the same layout. tier=0 is normal,
  // tier=1 is hardmode (more enemies, tougher spawns).
  seed: number
  tier: number
}

export type Level = OverworldLevel | DelveLevel

// ===== Input =====
// Held flags + edge flags. Edge flags fire once on keydown; physics.stepGame
// consumes (resets) them. Use edges for one-shot actions, held for movement.
export interface InputState {
  left: boolean
  right: boolean
  up: boolean
  down: boolean
  jump: boolean
  jumpEdge: boolean
  dash: boolean
  dashEdge: boolean
  interact: boolean
  interactEdge: boolean
  // Hotkey edges for active consumables. 1 = heal potion, 2 = storm vial.
  useHealEdge: boolean
  useStormEdge: boolean
}

// ===== Character (cosmetics) =====
export interface Character {
  name: string
  skin: string
  hair: string
  hairStyle: "short" | "med" | "long"
  shirt: string
  pants: string
  accent: string
}

// ===== Player =====
export interface PlayerState {
  // Position & velocity
  x: number
  y: number
  vx: number
  vy: number

  // Ground / wall contact
  onGround: boolean
  wallDir: -1 | 0 | 1 // -1 = wall on left, 1 = wall on right, 0 = no wall

  // Jump system
  jumpsLeft: number
  coyote: number // frames of grace after walking off a ledge
  jbuf: number // frames of jump-input buffering before landing

  // Dash system. dashFrames > 0 ⇒ mid-dash. dashDx/dashDy unit vector for 8-dir.
  dashFrames: number
  dashCool: number
  dashDx: number
  dashDy: number

  // Visual / animation
  facing: -1 | 1
  anim: number
  squash: number
  prevY: number
  peakFall: number

  // Render interpolation snapshot — position at the START of the current tick.
  // Render lerps between this and (x, y) by alpha = accumulator / TICK_MS so
  // motion stays smooth on displays whose refresh rate isn't a multiple of 60.
  renderPrevX: number
  renderPrevY: number

  // Warframe-style abilities. Booleans are gates; *Frames are countdowns.
  // airDashesUsed is a count (not a boolean) so perks like Quickfeet+ can
  // raise the cap above 1 — we compare against a per-frame maxAirDashes
  // computed from active perks.
  airDashesUsed: number
  aimGlideUsed: boolean
  aimGlideFrames: number
  wallLatched: boolean
  sliding: boolean
  slideFrames: number
  iframes: number

  // Combat
  hp: number
  maxHp: number
  damageIframes: number // post-hit invulnerability (separate from roll iframes)
  slashFrames: number // active slash window — sword is "out" when > 0
  slashCool: number // gap between auto-slashes so overlap doesn't multi-hit
  dead: boolean // set on hp<=0; cleared after respawn snap
}

// ===== Enemy =====
// ghost    — straight-line floater, low HP, fills the chase niche
// slammer  — bulkier, slower chase, telegraphed windup → lunge attack
// spitter  — light, kites at range, fires homing-less projectile orbs
// burrower — ground-locked; alternates above-ground chase with underground
//            tunneling (invulnerable while below) and emerges near the player
export type EnemyType = "ghost" | "slammer" | "spitter" | "burrower"

export interface Enemy {
  type: EnemyType
  spawnIndex: number // matches the index in DelveLevel.enemySpawns
  x: number
  y: number
  vx: number
  vy: number
  hp: number
  maxHp: number
  iframes: number
  alive: boolean
  facing: -1 | 1
  bob: number // visual oscillation phase
  // Per-archetype AI counters. Zero for types that don't use them.
  windup: number // slammer: ticks until lunge starts
  lunging: number // slammer: ticks remaining in active lunge
  fireCool: number // spitter: ticks until next projectile
  diveCool: number // burrower: ticks until next dive while above ground
  diveTime: number // burrower: ticks remaining underground (invulnerable)
  // Glacial Edge mod chill — non-zero halves AI speed and tints visual blue.
  chillTime: number
}

// Slow orbs fired by spitters. Damage on player overlap, decay on life-out
// or solid-tile contact.
export interface Projectile {
  x: number
  y: number
  vx: number
  vy: number
  life: number
}

// Floating damage number — spawns on every slash/storm hit, drifts upward
// and fades. Crits render larger + red so the burst reads visually.
export interface DamageNumber {
  x: number
  y: number
  vy: number // upward drift
  value: number
  crit: boolean
  life: number // ticks remaining
  max: number // initial life for fade calc
}

// ===== Portal state machine =====
// One per overworld portal tile. seed + tier identify the delve layout;
// defeatedEnemies + cleared remember per-portal progress so re-entering the
// same portal restores where you left off. status flips to "destroyed" on
// the coin-flip and the portal becomes inert (renders as "X" rubble).

// Death cache — when the player dies in a delve, 25% of each rarity is
// stashed at the death tile on the active portal. Re-entering the same
// portal renders a glowing pickup; player overlap reclaims it. Wiped if the
// portal seals before recovery.
export interface LostCache {
  x: number
  y: number
  basic: number
  essence: number
  crystal: number
}

export interface PortalState {
  seed: number
  tier: number
  status: "fresh" | "destroyed"
  defeatedEnemies: number[]
  cleared: boolean
  lostCache: LostCache | null
}

// ===== Game state =====
// The big mutable blob. physics.stepGame mutates it; render.draw reads it.
export interface GameState {
  ow: OverworldLevel
  dl: DelveLevel
  current: SceneId
  level: Level
  cam: Camera
  prevCamX: number
  prevCamY: number
  p: PlayerState
  enemies: Enemy[] // active for the current scene; rebuilt on transition
  projectiles: Projectile[] // active spitter orbs, cleared on scene transition
  // Cached HUD-derived combat state — physics writes at the top of each
  // tick so render can read mods/weaponLevel/hasSword without a callback.
  activeMods: readonly string[]
  activeWeaponLevel: number
  activeHasSword: boolean
  // Cached rebirths count — used to scale enemy HP modestly each rebirth so
  // late-game runs don't trivialize fresh portals. Read via cb.getRebirths().
  activeRebirths: number
  // CURRENT delve session's progress. On portal entry these are restored from
  // the active portal's PortalState; on exit they're snapshotted back. Each
  // portal has its own independent delve persistence.
  defeatedEnemies: Set<number>
  delveCleared: boolean
  // Per-portal state machine. Key = "<tx>,<ty>" of the portal tile in the
  // overworld map. activePortalId is set when inside a delve and used as the
  // target of the coin-flip on cleared exit.
  portals: Map<string, PortalState>
  activePortalId: string | null
  // Seed for the procedural overworld. Persisted in saves so the world is
  // reproducible across sessions. Portal coords (and therefore portal ids)
  // are determined by this seed, so it must be stable per save.
  worldSeed: number
  hitStop: number // when > 0, physics ticks freeze for this many frames (impact pause)
  // Phoenix perk session state. True once the perk has been consumed this
  // session. Not serialized — reloading a save resets this so the player
  // gets one revive per "play session" rather than per save-file.
  phoenixUsed: boolean
  collected: Set<string> // "<scene>:<tx>,<ty>" keys of pickups already grabbed
  particles: Particle[]
  // Floating damage numbers — spawned on every slash/storm hit. Stepped each
  // tick (drift upward + decay) and rendered above enemies.
  damageNumbers: DamageNumber[]
  bgPart: BgParticle[]
  time: number
  hasMoved: boolean
  hasJumped: boolean
  hasDashed: boolean
}

// ===== HUD overlay state =====
// Toast notifications shown in the top-right while playing.
export type NotifKind = "ach" | "level" | "discovery" | "xp"

export interface AppNotification {
  id: string
  text: string
  kind: NotifKind
  born: number
}

// "Discovered: Sunrise Clearing" banner that flashes when entering a new zone.
export interface ZoneBanner {
  name: string
  t: number
}

// ===== Scene routing =====
// Which top-level screen App.tsx is rendering. Distinct from SceneId (which
// describes the in-game level — overworld vs delve).
export type AppScene = "menu" | "about" | "loadmenu" | "creator" | "play" | "settings"

// ===== Callbacks (physics → React) =====
// ID unions are derived from the data tables in src/game/data.ts so adding
// or removing an entry there propagates here automatically.
import type { Cost, Materials } from "@/game/economy"
import type { AchievementId, PerkId, ZoneId } from "@/game/data"

// physics.stepGame doesn't import React. App.tsx hands it these closures so
// the loop can poke HUD-visible state when something achievement-worthy happens.
export interface PhysicsCallbacks {
  grantAch: (id: AchievementId) => void
  grantXP: (amount: number, label?: string) => void
  discover: (zoneId: ZoneId) => void
  addMaterials: (delta: Cost) => void
  getMaterials: () => Materials
  // portalId is "<tx>,<ty>" of the interacted "p" tile. App uses it as the key
  // into s.portals to look up / mutate the per-portal state.
  transitionToDelve: (portalId: string) => void
  transitionToOver: () => void
  hasSword: () => boolean
  // Currently equipped weapon tier — physics reads this to compute slash
  // damage. Index into WEAPONS in data.ts.
  getWeaponLevel: () => number
  // Active consumable inventory + use functions. Physics fires use* on the
  // input edge; App returns true if a stack was consumed (and decrements).
  getConsumables: () => { heal: number; storm: number }
  useHeal: () => boolean
  useStorm: () => boolean
  setHp: (hp: number) => void
  onDeath: () => void
  notify: (text: string, kind: NotifKind) => void
  openDialog: (npc: NpcId) => void
  onDelveClear: () => void
  getMods: () => readonly string[]
  // Perk lookup — read every tick like getMods. Effects keyed off PerkId in
  // physics.ts (e.g. quickfeet_plus → maxAirDashes = 2).
  hasPerk: (id: PerkId) => boolean
  // Rebirths count — physics caches this each tick to scale enemy HP. Also
  // used by spawnEnemiesFrom callers to compute the spawn-time hp multiplier.
  getRebirths: () => number
}

export type NpcId = "elder" | "merchant"
