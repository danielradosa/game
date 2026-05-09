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

export const ENEMY_WIDTH = 26
export const ENEMY_HEIGHT = 26
export const ENEMY_HP = 2
export const ENEMY_HIT_IFRAMES = 14
export const ENEMY_KNOCKBACK = 4
export const ENEMY_CHASE_SPEED = 1.5
export const ENEMY_KILL_XP = 25
export const ENEMY_KILL_MATERIALS = 1
