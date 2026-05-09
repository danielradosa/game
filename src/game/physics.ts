import {
  TILE_SIZE,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  GRAVITY,
  JUMP_VELOCITY,
  DOUBLE_JUMP_VELOCITY,
  MOVE_ACCELERATION,
  MOVE_FRICTION,
  MAX_RUN_SPEED,
  DASH_VELOCITY,
  DASH_FRAMES,
  DASH_COOLDOWN,
  COYOTE_FRAMES,
  JUMP_BUFFER_FRAMES,
  WALL_SLIDE_SPEED,
  MAX_FALL_SPEED,
  JUMP_CUT_MULTIPLIER,
  DUST_COLOR,
  MAGNET_RADIUS,
  PLAYER_MAX_HP,
  DAMAGE_IFRAMES,
  DAMAGE_KNOCKBACK_VX,
  DAMAGE_KNOCKBACK_VY,
  SLASH_FRAMES,
  SLASH_COOLDOWN,
  SLASH_DAMAGE,
  SLASH_REACH,
  ENEMY_WIDTH,
  ENEMY_HEIGHT,
  ENEMY_HP,
  ENEMY_HIT_IFRAMES,
  ENEMY_KNOCKBACK,
  ENEMY_CHASE_SPEED,
  ENEMY_KILL_XP,
  ENEMY_KILL_MATERIALS,
} from "@/game/constants"
import { ZONES } from "@/game/data"
import { isSolid, isPlat } from "@/game/levels"
import { playSnd } from "@/game/audio"
import type {
  GameState,
  InputState,
  Character,
  PhysicsCallbacks,
  OverworldLevel,
  DelveLevel,
  SceneId,
  Enemy,
  EnemySpawn,
  PortalState,
} from "@/game/types/physics"

const BULLET_VX = 11.5 // bullet jump horizontal speed
const BULLET_VY = -11.5 // bullet jump vertical speed
const SLIDE_FRICTION = 0.965 // very low decay during slide
const SLIDE_BOOST = 1.35 // entry speed boost
const SLIDE_MIN_SPEED = 1.5 // below this, slide ends
const SLIDE_ENTER_SPEED = 2.5 // need this much speed to start sliding
const ROLL_FRAMES = 6
const ROLL_SPEED = 11
const ROLL_COOL = 18
const ROLL_IFRAMES = 8
const AIM_GLIDE_DUR = 60 // ~1 second @ 60fps
const AIM_GLIDE_GRAV = 0.1
const AIM_GLIDE_MAX = 1.5

export function addParticles(
  s: GameState,
  x: number,
  y: number,
  n: number,
  color: string,
  scale: number,
): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const sp = Math.random() * 3 * scale
    s.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 1,
      life: 18 + Math.random() * 18,
      max: 36,
      color,
      size: 1.5 + Math.random() * 2.5 * scale,
      g: 0.15,
    })
  }
}

// Shared collected-key formatter — physics WRITES, render READS. Keep both
// paths going through this helper or you get the bug where collected cells
// keep rendering forever (and can't be re-picked because they're already in
// the set). Delve cells namespace by activePortalId so two portals with cells
// at the same tile coords don't collide on a flat "delve:5,17" key.
export function cellKey(s: GameState, tx: number, ty: number): string {
  if (s.current === "delve" && s.activePortalId !== null) {
    return `delve:${s.activePortalId}:${tx},${ty}`
  }
  return `${s.current}:${tx},${ty}`
}

export function spawnEnemiesFrom(
  spawns: readonly EnemySpawn[],
  defeated: ReadonlySet<number>,
): Enemy[] {
  const out: Enemy[] = []
  spawns.forEach((sp, i) => {
    if (defeated.has(i)) return
    out.push({
      type: sp.type,
      spawnIndex: i,
      x: sp.x,
      y: sp.y,
      vx: 0,
      vy: 0,
      hp: ENEMY_HP,
      maxHp: ENEMY_HP,
      iframes: 0,
      alive: true,
      facing: 1,
      bob: Math.random() * Math.PI * 2,
    })
  })
  return out
}

export function snapRenderPrev(s: GameState): void {
  s.p.renderPrevX = s.p.x
  s.p.renderPrevY = s.p.y
  s.prevCamX = s.cam.x
  s.prevCamY = s.cam.y
}

export function stepGame(
  s: GameState,
  inp: InputState,
  ch: Character,
  cb: PhysicsCallbacks,
  dt: number,
): void {
  s.time += dt
  const p = s.p,
    lv = s.level,
    map = lv.map

  const mods = cb.getMods()
  const runMax = mods.includes("quickfeet") ? MAX_RUN_SPEED * 1.15 : MAX_RUN_SPEED
  const magnetR = mods.includes("lodestone") ? MAGNET_RADIUS * 1.6 : MAGNET_RADIUS

  // Snapshot pre-tick state so the renderer can lerp between this and the
  // post-tick state. Teleports below re-snap to avoid a smear across the cut.
  p.renderPrevX = p.x
  p.renderPrevY = p.y
  s.prevCamX = s.cam.x
  s.prevCamY = s.cam.y

  // Hit-stop: brief impact pause on slash hit. Snapshot already happened so
  // render lerps prev=curr (static frame) until the freeze ends.
  if (s.hitStop > 0) {
    s.hitStop--
    return
  }

  // ---- horizontal direction intent ----
  let dir = 0
  if (inp.left) dir -= 1
  if (inp.right) dir += 1
  if (dir !== 0) {
    p.facing = dir > 0 ? 1 : -1
    if (!s.hasMoved) {
      s.hasMoved = true
      cb.grantAch("a1")
    }
  }

  // ---- slide state (hold S while running on ground) ----
  const wantsSlide = inp.down && p.onGround && Math.abs(p.vx) > SLIDE_ENTER_SPEED
  if (wantsSlide && !p.sliding && p.dashFrames <= 0) {
    p.sliding = true
    p.slideFrames = 0
    p.vx *= SLIDE_BOOST
    addParticles(s, p.x + PLAYER_WIDTH / 2, p.y + PLAYER_HEIGHT, 8, DUST_COLOR, 1.2)
    playSnd("dash")
  }
  if (p.sliding) {
    p.slideFrames++
    if (!inp.down || !p.onGround || Math.abs(p.vx) < SLIDE_MIN_SPEED) {
      p.sliding = false
    }
  }

  // ---- horizontal acceleration ----
  if (p.dashFrames <= 0 && !p.wallLatched) {
    if (p.sliding) {
      p.vx *= SLIDE_FRICTION
      p.vx += dir * MOVE_ACCELERATION * 0.25 // tiny steering during slide
    } else {
      p.vx += dir * MOVE_ACCELERATION
      if (dir === 0) p.vx *= MOVE_FRICTION
      const overspeed = Math.abs(p.vx) > runMax && (dir === 0 || Math.sign(p.vx) !== dir)
      if (!overspeed) p.vx = Math.max(-runMax, Math.min(runMax, p.vx))
    }
  }

  // ---- jump / bullet jump (with coyote + buffer) ----
  if (inp.jumpEdge) {
    p.jbuf = JUMP_BUFFER_FRAMES
    inp.jumpEdge = false
  }
  p.jbuf = Math.max(0, p.jbuf - 1)
  p.coyote = Math.max(0, p.coyote - 1)

  let justBulletJumped = false
  const groundedish = p.onGround || p.coyote > 0

  if (p.jbuf > 0 && groundedish && (inp.down || p.sliding)) {
    // BULLET JUMP — explosive 45° launch in facing direction
    p.vx = Math.sign(p.vx || p.facing) * Math.max(BULLET_VX, Math.abs(p.vx))
    if (p.vx === 0) p.vx = BULLET_VX * p.facing
    p.vy = BULLET_VY
    p.jbuf = 0
    p.coyote = 0
    p.sliding = false
    p.jumpsLeft = 1 // can still double jump after
    p.airDashUsed = false
    p.aimGlideUsed = false
    p.wallLatched = false
    p.squash = 0.6
    justBulletJumped = true
    addParticles(s, p.x + PLAYER_WIDTH / 2, p.y + PLAYER_HEIGHT, 18, ch.accent, 2.6)
    playSnd("doublejump")
  } else if (p.jbuf > 0 && (p.coyote > 0 || p.jumpsLeft > 0 || p.wallDir !== 0 || p.wallLatched)) {
    if (p.coyote > 0) {
      p.vy = JUMP_VELOCITY
      p.coyote = 0
      p.jumpsLeft = 1
      playSnd("jump")
    } else if (p.wallDir !== 0 || p.wallLatched) {
      const wd = p.wallDir !== 0 ? p.wallDir : p.facing > 0 ? 1 : -1
      p.vy = JUMP_VELOCITY * 0.94
      p.vx = -wd * runMax * 1.15
      p.jumpsLeft = 1
      p.airDashUsed = false // wall jump refreshes air abilities
      p.aimGlideUsed = false
      p.wallLatched = false
      playSnd("jump")
    } else {
      p.vy = DOUBLE_JUMP_VELOCITY
      p.jumpsLeft -= 1
      addParticles(s, p.x + PLAYER_WIDTH / 2, p.y + PLAYER_HEIGHT, 12, ch.accent, 2)
      playSnd("doublejump")
      if (!s.hasJumped) {
        s.hasJumped = true
        cb.grantAch("a2")
      }
    }
    p.jbuf = 0
    p.squash = 0.7
  }

  // variable jump cut (skip for bullet jump — full commit)
  if (!justBulletJumped && !inp.jump && p.vy < -3) p.vy *= JUMP_CUT_MULTIPLIER

  // ---- dash (ROLL on ground / AIR DASH in air) ----
  if (inp.dashEdge) {
    inp.dashEdge = false
    if (p.dashCool <= 0 && p.dashFrames <= 0 && !p.wallLatched) {
      if (p.onGround) {
        // ROLL — short horizontal evasive hop with i-frames
        p.dashFrames = ROLL_FRAMES
        p.dashCool = ROLL_COOL
        p.dashDx = dir !== 0 ? dir : p.facing
        p.dashDy = 0
        p.iframes = ROLL_IFRAMES
        if (p.dashDx !== 0) p.facing = p.dashDx > 0 ? 1 : -1
        addParticles(s, p.x + PLAYER_WIDTH / 2, p.y + PLAYER_HEIGHT, 12, ch.accent, 1.8)
        playSnd("dash")
        if (!s.hasDashed) {
          s.hasDashed = true
          cb.grantAch("a3")
        }
      } else if (!p.airDashUsed) {
        // AIR DASH — 8-directional, 1 charge per airborne sequence
        let dx = 0,
          dy = 0
        if (inp.left) dx -= 1
        if (inp.right) dx += 1
        if (inp.up) dy -= 1
        if (inp.down) dy += 1
        if (dx === 0 && dy === 0) dx = p.facing
        const len = Math.hypot(dx, dy) || 1
        p.dashFrames = DASH_FRAMES
        p.dashCool = DASH_COOLDOWN
        p.dashDx = dx / len
        p.dashDy = dy / len
        p.airDashUsed = true
        if (dx !== 0) p.facing = dx > 0 ? 1 : -1
        addParticles(s, p.x + PLAYER_WIDTH / 2, p.y + PLAYER_HEIGHT / 2, 18, ch.accent, 2.4)
        playSnd("dash")
        if (!s.hasDashed) {
          s.hasDashed = true
          cb.grantAch("a3")
        }
        p.aimGlideFrames = 0 // dashing cancels active glide
      }
    }
  }
  if (p.dashCool > 0) p.dashCool--
  if (p.iframes > 0) p.iframes--

  // ---- dash physics ----
  if (p.dashFrames > 0) {
    if (p.onGround) {
      p.vx = p.dashDx * ROLL_SPEED
      p.vy = 0
    } else {
      p.vx = p.dashDx * DASH_VELOCITY
      p.vy = p.dashDy * DASH_VELOCITY
    }
    p.dashFrames--
    if (s.time % 2 < 1)
      addParticles(s, p.x + PLAYER_WIDTH / 2, p.y + PLAYER_HEIGHT / 2, 1, ch.accent, 1.5)
  }

  // ---- horizontal collision (sets wallDir) ----
  p.x += p.vx
  p.wallDir = 0
  {
    const left = Math.floor(p.x / TILE_SIZE),
      right = Math.floor((p.x + PLAYER_WIDTH - 1) / TILE_SIZE)
    const top = Math.floor(p.y / TILE_SIZE),
      bottom = Math.floor((p.y + PLAYER_HEIGHT - 1) / TILE_SIZE)
    for (let ty = top; ty <= bottom; ty++)
      for (let tx = left; tx <= right; tx++) {
        if (isSolid(map[ty]?.[tx])) {
          if (p.vx > 0) {
            p.x = tx * TILE_SIZE - PLAYER_WIDTH
            p.wallDir = 1
          } else if (p.vx < 0) {
            p.x = (tx + 1) * TILE_SIZE
            p.wallDir = -1
          }
          p.vx = 0
        }
      }
  }

  // ---- wall latch (hold X against wall in air) ----
  const pressingIntoWall = (p.wallDir > 0 && inp.right) || (p.wallDir < 0 && inp.left)
  const canLatch =
    p.wallDir !== 0 && !p.onGround && inp.dash && pressingIntoWall && p.dashFrames <= 0
  if (canLatch) {
    if (!p.wallLatched) {
      addParticles(
        s,
        p.x + (p.wallDir > 0 ? PLAYER_WIDTH : 0),
        p.y + PLAYER_HEIGHT / 2,
        6,
        DUST_COLOR,
        1.0,
      )
    }
    p.wallLatched = true
    p.vy = 0
    p.vx = 0
    p.airDashUsed = false // wall latch refreshes EVERYTHING
    p.aimGlideUsed = false
    p.aimGlideFrames = 0
    p.jumpsLeft = 2
    p.squash = 0.85
  } else {
    p.wallLatched = false
  }

  // ---- aim glide (hold X in air, once per airborne sequence) ----
  const canStartGlide =
    inp.dash &&
    !p.onGround &&
    p.dashFrames <= 0 &&
    !p.wallLatched &&
    !p.aimGlideUsed &&
    p.aimGlideFrames <= 0
  if (canStartGlide) {
    p.aimGlideFrames = AIM_GLIDE_DUR
    p.aimGlideUsed = true
    addParticles(s, p.x + PLAYER_WIDTH / 2, p.y + PLAYER_HEIGHT, 4, ch.accent, 0.8)
  }
  if (p.aimGlideFrames > 0) {
    if (!inp.dash || p.onGround || p.wallLatched || p.dashFrames > 0 || p.vy < -2) {
      p.aimGlideFrames = 0 // cancel on land/latch/dash/upward burst
    } else {
      p.aimGlideFrames--
      p.squash = 1.05 // slight stretch while gliding
    }
  }

  // ---- gravity (state-modulated) ----
  if (p.dashFrames > 0) {
    // dashing — vy controlled
  } else if (p.wallLatched) {
    // no gravity while latched
  } else if (p.aimGlideFrames > 0) {
    p.vy = Math.min(AIM_GLIDE_MAX, p.vy + AIM_GLIDE_GRAV)
  } else {
    p.vy = Math.min(MAX_FALL_SPEED, p.vy + GRAVITY)
  }

  // ---- wall slide (only when not latched and falling fast) ----
  if (
    p.wallDir !== 0 &&
    !p.onGround &&
    p.vy > WALL_SLIDE_SPEED &&
    p.dashFrames <= 0 &&
    !p.wallLatched
  ) {
    p.vy = WALL_SLIDE_SPEED
  }

  // ---- vertical collision ----
  p.prevY = p.y
  p.y += p.vy
  {
    const left = Math.floor(p.x / TILE_SIZE),
      right = Math.floor((p.x + PLAYER_WIDTH - 1) / TILE_SIZE)
    const top = Math.floor(p.y / TILE_SIZE),
      bottom = Math.floor((p.y + PLAYER_HEIGHT - 1) / TILE_SIZE)
    for (let ty = top; ty <= bottom; ty++)
      for (let tx = left; tx <= right; tx++) {
        const c = map[ty]?.[tx]
        if (isSolid(c)) {
          if (p.vy > 0) p.y = ty * TILE_SIZE - PLAYER_HEIGHT
          else if (p.vy < 0) p.y = (ty + 1) * TILE_SIZE
          p.vy = 0
        } else if (isPlat(c) && p.vy > 0 && !inp.down) {
          const platY = ty * TILE_SIZE
          if (p.prevY + PLAYER_HEIGHT <= platY + 1) {
            p.y = platY - PLAYER_HEIGHT
            p.vy = 0
          }
        }
      }
  }

  // ---- ground probe (single source of truth) ----
  const wasOnGround = p.onGround
  p.onGround = false
  {
    const left = Math.floor(p.x / TILE_SIZE),
      right = Math.floor((p.x + PLAYER_WIDTH - 1) / TILE_SIZE)
    const probeTy = Math.floor((p.y + PLAYER_HEIGHT + 1) / TILE_SIZE)
    const platTop = probeTy * TILE_SIZE
    for (let tx = left; tx <= right; tx++) {
      const c = map[probeTy]?.[tx]
      if (isSolid(c)) {
        p.onGround = true
        break
      }
      if (
        isPlat(c) &&
        !inp.down &&
        p.vy >= 0 &&
        p.y + PLAYER_HEIGHT >= platTop - 1 &&
        p.y + PLAYER_HEIGHT <= platTop + 1
      ) {
        p.onGround = true
        break
      }
    }
  }

  if (p.onGround) {
    if (!wasOnGround && p.peakFall > 1.5) {
      const fall = Math.min(20, p.peakFall)
      p.squash = Math.max(0.55, 1 - fall * 0.04)
      addParticles(
        s,
        p.x + PLAYER_WIDTH / 2,
        p.y + PLAYER_HEIGHT,
        3 + Math.floor(fall / 3),
        DUST_COLOR,
        1.0,
      )
      if (fall > 12) s.cam.shake = Math.min(8, fall * 0.4)
      playSnd("land")
    }
    // landing refreshes everything
    p.jumpsLeft = 2
    p.coyote = COYOTE_FRAMES
    p.peakFall = 0
    p.airDashUsed = false
    p.aimGlideUsed = false
    p.aimGlideFrames = 0
    if (p.vy >= 0) {
      const probeTy = Math.floor((p.y + PLAYER_HEIGHT + 1) / TILE_SIZE)
      p.y = probeTy * TILE_SIZE - PLAYER_HEIGHT
      p.vy = 0
    }
  } else {
    p.peakFall = Math.max(p.peakFall, p.vy)
  }
  if (p.sliding) p.squash = 0.55 // visual: stay flat during slide
  p.squash += (1 - p.squash) * 0.18

  // ---- collectibles (radius magnet) + portals (AABB) ----
  {
    const cxp = p.x + PLAYER_WIDTH / 2
    const cyp = p.y + PLAYER_HEIGHT / 2
    const radSq = magnetR * magnetR
    const r = magnetR + TILE_SIZE
    const left = Math.floor((p.x - r) / TILE_SIZE)
    const right = Math.floor((p.x + PLAYER_WIDTH + r) / TILE_SIZE)
    const top = Math.floor((p.y - r) / TILE_SIZE)
    const bottom = Math.floor((p.y + PLAYER_HEIGHT + r) / TILE_SIZE)
    for (let ty = top; ty <= bottom; ty++)
      for (let tx = left; tx <= right; tx++) {
        const c = map[ty]?.[tx]
        if (c !== "c" && c !== "C") continue
        const key = cellKey(s, tx, ty)
        if (s.collected.has(key)) continue
        const stx = tx * TILE_SIZE + TILE_SIZE / 2
        const sty = ty * TILE_SIZE + TILE_SIZE / 2
        const dx = stx - cxp
        const dy = sty - cyp
        if (dx * dx + dy * dy > radSq) continue
        s.collected.add(key)
        const big = c === "C"
        // Streak from star toward player so the magnet pull reads visually.
        const trail = big ? 14 : 6
        for (let i = 0; i < trail; i++) {
          const t = i / trail
          s.particles.push({
            x: stx + (cxp - stx) * t,
            y: sty + (cyp - sty) * t,
            vx: (cxp - stx) * 0.04,
            vy: (cyp - sty) * 0.04,
            life: 16,
            max: 16,
            color: ch.accent,
            size: 1.5 + Math.random() * 1.5,
            g: 0,
          })
        }
        addParticles(s, stx, sty, big ? 30 : 10, ch.accent, big ? 3 : 1.5)
        cb.addMaterials(big ? 5 : 1)
        playSnd(big ? "big_collect" : "collect")
        if (big) cb.grantAch("a8")
        if (cb.getMaterials() >= 5) cb.grantAch("a6")
      }
  }
  {
    const left = Math.floor(p.x / TILE_SIZE),
      right = Math.floor((p.x + PLAYER_WIDTH - 1) / TILE_SIZE)
    const top = Math.floor(p.y / TILE_SIZE),
      bottom = Math.floor((p.y + PLAYER_HEIGHT - 1) / TILE_SIZE)
    for (let ty = top; ty <= bottom; ty++)
      for (let tx = left; tx <= right; tx++) {
        const c = map[ty]?.[tx]
        if (c === "n" && inp.interactEdge) {
          inp.interactEdge = false
          cb.openDialog("elder")
        }
        if (c === "M" && inp.interactEdge) {
          inp.interactEdge = false
          cb.openDialog("merchant")
        }
        if (c === "p" && inp.interactEdge) {
          inp.interactEdge = false
          // The "p" tile's grid coords double as the portal's stable id —
          // App keys s.portals by this string and looks up the per-portal
          // state machine.
          if (s.current === "over") cb.transitionToDelve(`${tx},${ty}`)
        }
        if (c === "r" && inp.interactEdge) {
          inp.interactEdge = false
          if (s.current === "delve") {
            if (s.delveCleared) cb.transitionToOver()
            else {
              const left = s.dl.enemySpawns.length - s.defeatedEnemies.size
              cb.notify(`Portal sealed — ${left} ${left === 1 ? "guardian" : "guardians"} remain`, "xp")
            }
          }
        }
      }
  }
  inp.interactEdge = false

  if (s.current === "over") {
    const cx = p.x + PLAYER_WIDTH / 2,
      cy = p.y + PLAYER_HEIGHT / 2
    for (const z of ZONES) {
      if (cx >= z.x && cx < z.x + z.w && cy >= z.y && cy < z.y + z.h) cb.discover(z.id)
    }
  }

  inp.jumpEdge = false
  inp.dashEdge = false

  // ---- combat: enemies, sword slash, player damage ----
  if (p.damageIframes > 0) p.damageIframes--
  if (p.slashFrames > 0) p.slashFrames--
  if (p.slashCool > 0) p.slashCool--

  const pCx = p.x + PLAYER_WIDTH / 2
  const pCy = p.y + PLAYER_HEIGHT / 2
  const pHalfW = PLAYER_WIDTH / 2 + SLASH_REACH
  const pHalfH = PLAYER_HEIGHT / 2 + SLASH_REACH

  for (const e of s.enemies) {
    if (!e.alive) continue
    if (e.iframes > 0) {
      e.iframes--
      e.x += e.vx
      e.y += e.vy
      e.vx *= 0.82
      e.vy *= 0.82
    } else {
      // Chase: float in a straight line toward the player. Ghosts ignore
      // terrain by design — they pass through walls.
      const dxe = pCx - (e.x + ENEMY_WIDTH / 2)
      const dye = pCy - (e.y + ENEMY_HEIGHT / 2)
      const dlen = Math.hypot(dxe, dye) || 1
      e.vx = (dxe / dlen) * ENEMY_CHASE_SPEED
      e.vy = (dye / dlen) * ENEMY_CHASE_SPEED
      e.x += e.vx
      e.y += e.vy
      e.facing = dxe > 0 ? 1 : -1
    }
    e.bob += 0.07

    const eCx = e.x + ENEMY_WIDTH / 2
    const eCy = e.y + ENEMY_HEIGHT / 2
    const overlapX = Math.abs(eCx - pCx) < pHalfW + ENEMY_WIDTH / 2
    const overlapY = Math.abs(eCy - pCy) < pHalfH + ENEMY_HEIGHT / 2
    if (!overlapX || !overlapY) continue

    // Sword auto-slashes on overlap. Roll i-frames don't gate this — rolling
    // through is the canonical safe attack (no damage taken + slash lands).
    if (cb.hasSword() && p.slashCool <= 0) {
      p.slashFrames = SLASH_FRAMES
      p.slashCool = SLASH_COOLDOWN
      p.facing = eCx > pCx ? 1 : -1
      e.hp -= SLASH_DAMAGE
      e.iframes = ENEMY_HIT_IFRAMES
      e.vx = (eCx > pCx ? 1 : -1) * ENEMY_KNOCKBACK
      s.hitStop = Math.max(s.hitStop, e.hp <= 0 ? 5 : 3)
      s.cam.shake = Math.max(s.cam.shake, 2.5)
      addParticles(s, eCx, eCy, 10, ch.accent, 1.6)
      playSnd("dash")
      if (e.hp <= 0) {
        e.alive = false
        s.defeatedEnemies.add(e.spawnIndex)
        addParticles(s, eCx, eCy, 24, "#c08aff", 2.2)
        cb.addMaterials(ENEMY_KILL_MATERIALS)
        cb.grantXP(ENEMY_KILL_XP, "slain")
        playSnd("big_collect")
        if (
          s.current === "delve" &&
          !s.delveCleared &&
          s.defeatedEnemies.size >= s.dl.enemySpawns.length
        ) {
          s.delveCleared = true
          cb.notify("Delve cleared — portal unlocked", "discovery")
          playSnd("portal")
          cb.onDelveClear()
        }
      }
    }

    // Player takes damage if not already invulnerable. Roll iframes also
    // grant immunity so the sword/roll combo is the intended kill cycle.
    // Enemy iframes also gate the damage check — an enemy in hit-stun (i.e.
    // we just slashed them this frame) can't damage us, which prevents the
    // simultaneous slash-and-take-damage trade that would otherwise occur on
    // every overlap frame against multi-hp enemies.
    if (e.alive && e.iframes <= 0 && p.damageIframes <= 0 && p.iframes <= 0) {
      p.hp = Math.max(0, p.hp - 1)
      p.damageIframes = DAMAGE_IFRAMES
      p.vx = (pCx > eCx ? 1 : -1) * DAMAGE_KNOCKBACK_VX
      p.vy = DAMAGE_KNOCKBACK_VY
      p.wallLatched = false
      p.sliding = false
      s.cam.shake = Math.max(s.cam.shake, 6)
      addParticles(s, pCx, pCy, 14, "#ff5060", 1.8)
      playSnd("land")
      cb.setHp(p.hp)
      if (p.hp <= 0 && !p.dead) {
        p.dead = true
        cb.onDeath()
        p.x = lv.spawn.x
        p.y = lv.spawn.y
        p.vx = 0
        p.vy = 0
        p.hp = p.maxHp
        p.damageIframes = DAMAGE_IFRAMES * 2
        p.dead = false
        cb.setHp(p.hp)
        // Respawn the delve's still-alive enemies at their original spawn
        // points so the player isn't chain-killed by enemies that were right
        // next to them when they died. defeatedEnemies are preserved so the
        // run progress isn't lost — only positions reset.
        if (s.current === "delve") {
          s.enemies = spawnEnemiesFrom(s.dl.enemySpawns, s.defeatedEnemies)
        }
        snapRenderPrev(s)
        break
      }
    }
  }
  s.enemies = s.enemies.filter((e) => e.alive)

  // ---- camera ----
  const camTargetX = p.x + PLAYER_WIDTH / 2 - 880 / 2
  const camTargetY = p.y + PLAYER_HEIGHT / 2 - 520 / 2
  s.cam.x += (camTargetX - s.cam.x) * 0.12
  s.cam.y += (camTargetY - s.cam.y) * 0.12
  const lvW = lv.W * TILE_SIZE,
    lvH = lv.H * TILE_SIZE
  s.cam.x = Math.max(0, Math.min(lvW - 880, s.cam.x))
  s.cam.y = Math.max(0, Math.min(lvH - 520, s.cam.y))
  if (s.cam.shake > 0) s.cam.shake *= 0.85

  s.particles = s.particles.filter((pt) => pt.life > 0)
  for (const pt of s.particles) {
    pt.x += pt.vx
    pt.y += pt.vy
    pt.vy += pt.g || 0.1
    pt.life--
  }
  for (const bp of s.bgPart) {
    bp.y += bp.sp
    bp.x += Math.sin((s.time + bp.x) * 0.001) * 0.3
    if (bp.y > lvH) {
      bp.y = -10
      bp.x = Math.random() * lvW
    }
  }
  p.anim += Math.abs(p.vx) * 0.06 + 0.02

  if (p.y > (lv.H + 4) * TILE_SIZE) {
    p.x = lv.spawn.x
    p.y = lv.spawn.y
    p.vx = 0
    p.vy = 0
    snapRenderPrev(s)
  }
}

export function makeInitialState(
  ow: OverworldLevel,
  dl: DelveLevel,
  x: number,
  y: number,
  current: SceneId,
  collected: Set<string>,
  defeated: ReadonlySet<number> = new Set<number>(),
  delveCleared = false,
  portals: Map<string, PortalState> = new Map(),
  activePortalId: string | null = null,
  worldSeed = 0,
): GameState {
  const lv = current === "delve" ? dl : ow
  const st: GameState = {
    ow,
    dl,
    current,
    level: lv,
    cam: { x: 0, y: 0, shake: 0 },
    prevCamX: 0,
    prevCamY: 0,
    p: {
      x,
      y,
      vx: 0,
      vy: 0,
      onGround: false,
      wallDir: 0,
      jumpsLeft: 2,
      coyote: 0,
      jbuf: 0,
      dashFrames: 0,
      dashCool: 0,
      dashDx: 1,
      dashDy: 0,
      facing: 1,
      anim: 0,
      squash: 1,
      prevY: y,
      peakFall: 0,
      renderPrevX: x,
      renderPrevY: y,
      // Warframe-style state
      airDashUsed: false,
      aimGlideUsed: false,
      aimGlideFrames: 0,
      wallLatched: false,
      sliding: false,
      slideFrames: 0,
      iframes: 0,
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      damageIframes: 0,
      slashFrames: 0,
      slashCool: 0,
      dead: false,
    },
    enemies: current === "delve" ? spawnEnemiesFrom(dl.enemySpawns, defeated) : [],
    defeatedEnemies: new Set<number>(defeated),
    delveCleared,
    portals,
    activePortalId,
    worldSeed,
    hitStop: 0,
    collected,
    particles: [],
    bgPart: [],
    time: 0,
    hasJumped: false,
    hasDashed: false,
    hasMoved: false,
  }
  for (let i = 0; i < 18; i++) {
    st.bgPart.push({
      x: Math.random() * (lv.W * TILE_SIZE),
      y: Math.random() * (lv.H * TILE_SIZE),
      s: 0.3 + Math.random() * 1.0,
      o: 0.15 + Math.random() * 0.25,
      sp: 0.15 + Math.random() * 0.3,
    })
  }
  return st
}
