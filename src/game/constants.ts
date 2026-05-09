import type { Cost } from "@/game/economy"
import type { EnemyType } from "@/game/types/physics"

interface EnemyStats {
  w: number
  h: number
  hp: number
  chaseSpeed: number
  killXp: number
  killDrops: Cost
  lungeSpeed?: number
  windupFrames?: number
  lungeFrames?: number
  kiteDistance?: number
  fireInterval?: number
  diveCooldown?: number
  diveDuration?: number
}

export const TILE_SIZE = 36

export const VIEWPORT_WIDTH = 880
export const VIEWPORT_HEIGHT = 520

export const GRAVITY = 0.46

export const JUMP_VELOCITY = -10.8
export const DOUBLE_JUMP_VELOCITY = -10.0

export const MOVE_ACCELERATION = 0.9
export const MOVE_FRICTION = 0.82
export const MAX_RUN_SPEED = 5.0

export const DASH_VELOCITY = 13.5
export const DASH_FRAMES = 10
export const DASH_COOLDOWN = 28

export const COYOTE_FRAMES = 7
export const JUMP_BUFFER_FRAMES = 6
export const WALL_SLIDE_SPEED = 2.6
export const MAX_FALL_SPEED = 13

export const JUMP_CUT_MULTIPLIER = 0.5

export const PLAYER_WIDTH = 22
export const PLAYER_HEIGHT = 32

export const xpForLevel = (level: number) => Math.floor(80 + level * 28)

export const DUST_COLOR = "#cfaf87"

export const MAGNET_RADIUS = 80

export const PLAYER_MAX_HP = 3
export const DAMAGE_IFRAMES = 60
export const DAMAGE_KNOCKBACK_VX = 5.5
export const DAMAGE_KNOCKBACK_VY = -6

export const SLASH_FRAMES = 12
export const SLASH_COOLDOWN = 18
export const SLASH_DAMAGE = 1
// Reach is added to PLAYER_WIDTH/2 to form the slash hitbox half-width. 32
// is roughly one player-width past the visual arc — biased towards "swing
// connects" feel. Pair with the e.iframes guard on contact damage so the
// extra reach doesn't double-hit.
export const SLASH_REACH = 32

// Per-archetype enemy stats. Width/height drive both the hitbox and the
// procedural drawing. chaseSpeed is the pixels-per-tick max in idle chase
// state. Slammer uses lungeSpeed during its lunge frames. Spitter mostly
// hovers; kiteDistance is the comfort radius from the player.
export const ENEMY_STATS = {
  ghost: {
    w: 26,
    h: 26,
    hp: 8,
    chaseSpeed: 1.5,
    killXp: 25,
    killDrops: { basic: 1 },
  },
  slammer: {
    w: 36,
    h: 36,
    hp: 30,
    chaseSpeed: 0.9,
    lungeSpeed: 6.5,
    windupFrames: 32,
    lungeFrames: 14,
    killXp: 60,
    killDrops: { basic: 1, essence: 1 },
  },
  spitter: {
    w: 22,
    h: 22,
    hp: 10,
    chaseSpeed: 0.5,
    kiteDistance: 240, // px; spitter drifts away when player gets closer
    fireInterval: 90, // frames between shots
    killXp: 40,
    killDrops: { basic: 1, essence: 1 },
  },
  burrower: {
    w: 32,
    h: 28,
    hp: 25,
    chaseSpeed: 1.1,
    diveCooldown: 180, // ticks above ground between dives
    diveDuration: 120, // ticks underground (invulnerable + tunneling toward player)
    killXp: 70,
    killDrops: { basic: 1, essence: 1, crystal: 1 },
  },
} as const satisfies Record<EnemyType, EnemyStats>

export const ENEMY_HIT_IFRAMES = 14
export const ENEMY_KNOCKBACK = 4
// Glacial Edge mod chill duration applied on slash hit, in physics ticks.
export const CHILL_DURATION = 120

export const PROJECTILE_SPEED = 4.2
export const PROJECTILE_LIFE = 90
export const PROJECTILE_RADIUS = 6

// Consumable tuning. STORM_RADIUS is the AoE damage radius around the player
// when a storm vial is uncorked; STORM_DAMAGE is per enemy hit.
export const HEAL_AMOUNT = 2
export const STORM_RADIUS = 140
export const STORM_DAMAGE = 25
export const STORM_IFRAMES = 30 // brief player invuln after the blast
