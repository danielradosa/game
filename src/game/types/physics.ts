// Type contract for the imperative game loop.
// Used by physics.ts (mutates), render.ts (reads), App.tsx (bridges to React).

// ===== Tilemap chars =====
// Match the keys produced by levels.ts:
//   "#" solid  · "=" one-way platform  · "c" collectible  · "C" big collectible
//   "n" NPC    · "p" portal-to-delve   · "r" portal-to-overworld  · " " empty
export type TileChar = "#" | "=" | "c" | "C" | "n" | "p" | "r" | " "

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
  airDashUsed: boolean
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
export type EnemyType = "ghost"

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
  defeatedEnemies: Set<number> // delve spawnIndex values, persistent for the run
  delveCleared: boolean // true once every delve enemy has been defeated
  hitStop: number // when > 0, physics ticks freeze for this many frames (impact pause)
  collected: Set<string> // "<scene>:<tx>,<ty>" keys of pickups already grabbed
  particles: Particle[]
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
export type AppScene = "menu" | "about" | "loadmenu" | "creator" | "play"

// ===== Callbacks (physics → React) =====
// ID unions are derived from the data tables in src/game/data.ts so adding
// or removing an entry there propagates here automatically.
import type { AchievementId, ZoneId } from "@/game/data"

// physics.stepGame doesn't import React. App.tsx hands it these closures so
// the loop can poke HUD-visible state when something achievement-worthy happens.
export interface PhysicsCallbacks {
  grantAch: (id: AchievementId) => void
  grantXP: (amount: number, label?: string) => void
  discover: (zoneId: ZoneId) => void
  addMaterials: (n: number) => void
  getMaterials: () => number
  transitionToDelve: () => void
  transitionToOver: () => void
  hasSword: () => boolean
  setHp: (hp: number) => void
  onDeath: () => void
  notify: (text: string, kind: NotifKind) => void
  openDialog: (npc: NpcId) => void
  onDelveClear: () => void
  getMods: () => readonly string[]
}

export type NpcId = "elder"
