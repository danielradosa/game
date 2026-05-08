import {
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  TILE_SIZE,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
  ENEMY_WIDTH,
  ENEMY_HEIGHT,
  SLASH_FRAMES,
} from "@/game/constants"
import { ASSET_SIZES, SPRITES, isReady, tryDrawSprite } from "@/game/sprites"
import type { Character, GameState, Theme, TileChar } from "@/game/types/physics"

type Ctx = CanvasRenderingContext2D

export function draw(ctx: Ctx, s: GameState, ch: Character, alpha: number): void {
  // Reset to a transform that maps world units (VIEWPORT_WIDTH × VIEWPORT_HEIGHT)
  // onto the canvas's actual pixel buffer. App.tsx resizes the buffer to match
  // CSS pixels × devicePixelRatio, so this gives us native-resolution rendering.
  const cv = ctx.canvas
  const scale = cv.width / VIEWPORT_WIDTH
  ctx.setTransform(scale, 0, 0, scale, 0, 0)

  // Render-time interpolation: physics ticks at fixed 60 Hz, render at native
  // refresh. Lerp player + camera between pre-tick and post-tick state so the
  // 2/3/2/3 tick distribution on 144 Hz doesn't read as stutter. Mutate in
  // place across the draw, restore at the end so physics never sees the lerp.
  const realPx = s.p.x,
    realPy = s.p.y
  const realCx = s.cam.x,
    realCy = s.cam.y
  s.p.x = s.p.renderPrevX + (realPx - s.p.renderPrevX) * alpha
  s.p.y = s.p.renderPrevY + (realPy - s.p.renderPrevY) * alpha
  s.cam.x = s.prevCamX + (realCx - s.prevCamX) * alpha
  s.cam.y = s.prevCamY + (realCy - s.prevCamY) * alpha

  const lv = s.level
  ctx.save()
  ctx.clearRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
  drawSky(ctx, s)
  const sx = (Math.random() - 0.5) * s.cam.shake
  const sy = (Math.random() - 0.5) * s.cam.shake
  ctx.translate(-Math.round(s.cam.x + sx), -Math.round(s.cam.y + sy))
  drawParallax(ctx, s)
  for (const bp of s.bgPart) {
    ctx.globalAlpha = bp.o
    ctx.fillStyle = lv.theme === "delve" ? "#c4a8ff" : "#ffeec8"
    ctx.beginPath()
    ctx.arc(bp.x, bp.y, bp.s, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  drawTiles(ctx, s)
  drawEntities(ctx, s)
  drawEnemies(ctx, s)
  for (const pt of s.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.max)
    ctx.fillStyle = pt.color
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  drawPlayer(ctx, s, ch)
  drawSlash(ctx, s, ch)
  ctx.restore()
  const vg = ctx.createRadialGradient(
    VIEWPORT_WIDTH / 2,
    VIEWPORT_HEIGHT / 2,
    VIEWPORT_HEIGHT * 0.4,
    VIEWPORT_WIDTH / 2,
    VIEWPORT_HEIGHT / 2,
    VIEWPORT_HEIGHT * 0.85,
  )
  vg.addColorStop(0, "rgba(0,0,0,0)")
  vg.addColorStop(1, lv.theme === "delve" ? "rgba(20,5,40,0.55)" : "rgba(20,15,40,0.35)")
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT)

  s.p.x = realPx
  s.p.y = realPy
  s.cam.x = realCx
  s.cam.y = realCy
}

export function drawPaused(ctx: Ctx): void {
  const cv = ctx.canvas
  const scale = cv.width / VIEWPORT_WIDTH
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.fillStyle = "rgba(10,5,20,0.6)"
  ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
}

function drawSky(ctx: Ctx, s: GameState): void {
  const lv = s.level
  const grad = ctx.createLinearGradient(0, 0, 0, VIEWPORT_HEIGHT)
  if (lv.theme === "delve") {
    grad.addColorStop(0, "#1a0a2a")
    grad.addColorStop(0.5, "#2a1040")
    grad.addColorStop(1, "#0a0518")
  } else {
    grad.addColorStop(0, "#f4b58a")
    grad.addColorStop(0.4, "#e88c8a")
    grad.addColorStop(0.75, "#7a6ab0")
    grad.addColorStop(1, "#3a4078")
  }
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, VIEWPORT_WIDTH, VIEWPORT_HEIGHT)
  if (lv.theme === "over") {
    const sunY = VIEWPORT_HEIGHT * 0.32 - s.cam.y * 0.05
    const sunX = VIEWPORT_WIDTH * 0.7 - s.cam.x * 0.05
    const sg = ctx.createRadialGradient(sunX, sunY, 5, sunX, sunY, 80)
    sg.addColorStop(0, "rgba(255,240,200,1)")
    sg.addColorStop(0.4, "rgba(255,200,150,0.7)")
    sg.addColorStop(1, "rgba(255,180,140,0)")
    ctx.fillStyle = sg
    ctx.fillRect(sunX - 100, sunY - 100, 200, 200)
  }
}

function drawParallax(ctx: Ctx, s: GameState): void {
  const lv = s.level
  if (lv.theme === "delve") {
    for (let i = 0; i < 6; i++) {
      const px = i * 200 + ((s.cam.x * 0.3) % 200)
      ctx.fillStyle = "rgba(80,40,120,0.4)"
      ctx.beginPath()
      ctx.moveTo(s.cam.x + px - 60, s.cam.y)
      ctx.lineTo(s.cam.x + px, s.cam.y + 200)
      ctx.lineTo(s.cam.x + px + 60, s.cam.y)
      ctx.fill()
    }
    return
  }
  const lvW = lv.W * TILE_SIZE
  const range = (offX: number, baseY: number, color: string, amp: number, freq: number): void => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(0, lv.H * TILE_SIZE)
    for (let x = 0; x <= lvW; x += 20) {
      const px = x + offX
      const y = baseY + Math.sin(px * freq) * amp + Math.cos(px * freq * 2.3) * amp * 0.5
      ctx.lineTo(x, y)
    }
    ctx.lineTo(lvW, lv.H * TILE_SIZE)
    ctx.closePath()
    ctx.fill()
  }
  range(s.cam.x * 0.85, 380, "#5a5a8a", 30, 0.005)
  range(s.cam.x * 0.7, 430, "#3e4070", 40, 0.008)
  range(s.cam.x * 0.5, 500, "#2a2a55", 30, 0.012)
}

function drawTiles(ctx: Ctx, s: GameState): void {
  const lv = s.level,
    map = lv.map
  const sX = Math.max(0, Math.floor(s.cam.x / TILE_SIZE) - 1)
  const eX = Math.min(lv.W - 1, Math.ceil((s.cam.x + VIEWPORT_WIDTH) / TILE_SIZE) + 1)
  const sY = Math.max(0, Math.floor(s.cam.y / TILE_SIZE) - 1)
  const eY = Math.min(lv.H - 1, Math.ceil((s.cam.y + VIEWPORT_HEIGHT) / TILE_SIZE) + 1)
  for (let ty = sY; ty <= eY; ty++)
    for (let tx = sX; tx <= eX; tx++) {
      const c = map[ty]?.[tx],
        x = tx * TILE_SIZE,
        y = ty * TILE_SIZE
      if (c === "#") drawSolid(ctx, x, y, map, tx, ty, lv.theme)
      else if (c === "=") drawPlatform(ctx, x, y, lv.theme)
    }
}

function drawSolid(
  ctx: Ctx,
  x: number,
  y: number,
  map: TileChar[][],
  tx: number,
  ty: number,
  theme: Theme,
): void {
  const above = map[ty - 1]?.[tx]
  const isTop = !above || above === " " || above === "c" || above === "="
  if (theme === "delve") {
    if (tryDrawSprite(ctx, "tile_ground_delve", x, y)) return
  } else {
    if (isTop && tryDrawSprite(ctx, "tile_grass", x, y)) return
    if (!isTop && tryDrawSprite(ctx, "tile_ground", x, y)) return
  }
  if (theme === "delve") {
    ctx.fillStyle = "#3a2a55"
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE)
    ctx.fillStyle = "#2a1a40"
    ctx.fillRect(x, y, 2, TILE_SIZE)
    ctx.fillRect(x, y + TILE_SIZE - 2, TILE_SIZE, 2)
    if (isTop) {
      ctx.fillStyle = "#5a3a8a"
      ctx.fillRect(x, y, TILE_SIZE, 4)
    }
    if ((tx * 7 + ty * 13) % 11 === 0) {
      ctx.fillStyle = "rgba(200,150,255,0.6)"
      ctx.fillRect(x + 6 + (tx % 3) * 8, y + 12 + (ty % 3) * 6, 2, 2)
    }
  } else {
    const earth = ctx.createLinearGradient(x, y, x, y + TILE_SIZE)
    earth.addColorStop(0, "#6b4a32")
    earth.addColorStop(1, "#3a2818")
    ctx.fillStyle = earth
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE)
    ctx.fillStyle = "rgba(0,0,0,0.15)"
    ctx.fillRect(x + ((tx * 7) % TILE_SIZE), y + 8 + ((ty * 5) % (TILE_SIZE - 12)), 3, 3)
    ctx.fillRect(x + ((tx * 13 + 5) % TILE_SIZE), y + 16 + ((ty * 11) % (TILE_SIZE - 20)), 2, 2)
    if (isTop) {
      const grass = ctx.createLinearGradient(x, y, x, y + 10)
      grass.addColorStop(0, "#a8d05a")
      grass.addColorStop(1, "#5a8030")
      ctx.fillStyle = grass
      ctx.fillRect(x, y, TILE_SIZE, 8)
      ctx.fillStyle = "#c4e070"
      for (let i = 0; i < 3; i++) ctx.fillRect(x + 4 + i * 12 + ((tx * 3) % 4), y + 2, 2, 5)
    }
  }
}

function drawPlatform(ctx: Ctx, x: number, y: number, theme: Theme): void {
  if (theme === "delve") {
    if (tryDrawSprite(ctx, "tile_platform_delve", x, y)) return
  } else {
    if (tryDrawSprite(ctx, "tile_platform", x, y)) return
  }
  if (theme === "delve") {
    ctx.fillStyle = "#5a3a8a"
    ctx.fillRect(x, y, TILE_SIZE, 6)
    ctx.fillStyle = "#3a2a55"
    ctx.fillRect(x, y + 6, TILE_SIZE, 4)
    ctx.fillStyle = "rgba(200,150,255,0.5)"
    ctx.fillRect(x, y, TILE_SIZE, 1)
  } else {
    const g = ctx.createLinearGradient(x, y, x, y + 12)
    g.addColorStop(0, "#9a6f48")
    g.addColorStop(0.5, "#7a4f30")
    g.addColorStop(1, "#4a2818")
    ctx.fillStyle = g
    ctx.fillRect(x, y, TILE_SIZE, 12)
    ctx.fillStyle = "rgba(0,0,0,0.2)"
    ctx.fillRect(x, y + 11, TILE_SIZE, 1)
    ctx.fillStyle = "rgba(255,220,170,0.3)"
    ctx.fillRect(x + 2, y + 1, TILE_SIZE - 4, 1)
  }
}

function drawEntities(ctx: Ctx, s: GameState): void {
  const lv = s.level,
    map = lv.map
  for (let ty = 0; ty < lv.H; ty++)
    for (let tx = 0; tx < lv.W; tx++) {
      const c = map[ty]?.[tx],
        x = tx * TILE_SIZE,
        y = ty * TILE_SIZE,
        key = s.current + ":" + tx + "," + ty
      if (c === "c" && !s.collected.has(key)) {
        const bob = Math.sin(s.time * 0.005 + tx) * 4
        const cx = x + TILE_SIZE / 2,
          cy = y + TILE_SIZE / 2 + bob
        if (tryDrawSprite(ctx, "collectible", cx, cy)) continue
        ctx.save()
        ctx.translate(cx, cy)
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 22)
        g.addColorStop(0, "rgba(255,200,120,0.6)")
        g.addColorStop(1, "rgba(255,200,120,0)")
        ctx.fillStyle = g
        ctx.fillRect(-22, -22, 44, 44)
        ctx.fillStyle = "#f8d070"
        ctx.beginPath()
        ctx.moveTo(0, -8)
        ctx.lineTo(6, -2)
        ctx.lineTo(4, 7)
        ctx.lineTo(-4, 7)
        ctx.lineTo(-6, -2)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = "#fff8c0"
        ctx.beginPath()
        ctx.moveTo(0, -8)
        ctx.lineTo(6, -2)
        ctx.lineTo(2, 0)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      } else if (c === "C" && !s.collected.has(key)) {
        const bob = Math.sin(s.time * 0.004) * 3
        const cx = x + TILE_SIZE / 2,
          cy = y + TILE_SIZE / 2 + bob
        if (tryDrawSprite(ctx, "cache", cx, cy)) continue
        ctx.save()
        ctx.translate(cx, cy)
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 50)
        g.addColorStop(0, "rgba(200,150,255,0.7)")
        g.addColorStop(1, "rgba(200,150,255,0)")
        ctx.fillStyle = g
        ctx.fillRect(-50, -50, 100, 100)
        ctx.fillStyle = "#c4a0e8"
        ctx.beginPath()
        ctx.moveTo(0, -16)
        ctx.lineTo(12, -4)
        ctx.lineTo(8, 14)
        ctx.lineTo(-8, 14)
        ctx.lineTo(-12, -4)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = "#fff"
        ctx.beginPath()
        ctx.moveTo(0, -16)
        ctx.lineTo(12, -4)
        ctx.lineTo(4, 0)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      } else if (c === "p") {
        const cx = x + TILE_SIZE / 2,
          by = y + TILE_SIZE
        if (!tryDrawSprite(ctx, "portal_delve", cx, by)) {
          const cy = y + TILE_SIZE / 2
          ctx.save()
          for (let i = 3; i >= 0; i--) {
            const r = 20 + i * 6 + Math.sin(s.time * 0.005 + i) * 3
            ctx.fillStyle = "rgba(160,100,220," + (0.15 + i * 0.05) + ")"
            ctx.beginPath()
            ctx.ellipse(cx, cy - 8, r * 0.7, r, 0, 0, Math.PI * 2)
            ctx.fill()
          }
          ctx.fillStyle = "#1a0a2a"
          ctx.beginPath()
          ctx.ellipse(cx, cy - 8, 14, 22, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }
        ctx.fillStyle = "rgba(255,255,255,0.85)"
        ctx.font = "12px sans-serif"
        ctx.textAlign = "center"
        ctx.fillText("[E] Enter Delve", cx, y - 8)
      } else if (c === "r") {
        const cx = x + TILE_SIZE / 2,
          by = y + TILE_SIZE
        if (!tryDrawSprite(ctx, "portal_return", cx, by)) {
          const cy = y + TILE_SIZE / 2
          ctx.save()
          for (let i = 3; i >= 0; i--) {
            const r = 18 + i * 5 + Math.sin(s.time * 0.005 + i) * 2
            ctx.fillStyle = "rgba(255,200,120," + (0.15 + i * 0.05) + ")"
            ctx.beginPath()
            ctx.ellipse(cx, cy - 6, r * 0.7, r, 0, 0, Math.PI * 2)
            ctx.fill()
          }
          ctx.fillStyle = "#3a1a0a"
          ctx.beginPath()
          ctx.ellipse(cx, cy - 6, 12, 18, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.restore()
        }
        ctx.fillStyle = "rgba(255,255,255,0.85)"
        ctx.font = "12px sans-serif"
        ctx.textAlign = "center"
        ctx.fillText("[E] Surface", cx, y - 8)
      } else if (c === "n") {
        const cx = x + TILE_SIZE / 2,
          by = y + TILE_SIZE - 4
        if (!tryDrawSprite(ctx, "npc", cx, by)) {
          ctx.fillStyle = "#3a2030"
          ctx.beginPath()
          ctx.ellipse(cx, by + 2, 10, 3, 0, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = "#5a4480"
          ctx.fillRect(cx - 8, by - 22, 16, 18)
          ctx.fillStyle = "#e8c1a0"
          ctx.beginPath()
          ctx.arc(cx, by - 28, 7, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = "#3a2820"
          ctx.fillRect(cx - 7, by - 33, 14, 6)
        }
        ctx.fillStyle = "rgba(255,255,255,0.85)"
        ctx.font = "12px sans-serif"
        ctx.textAlign = "center"
        ctx.fillText("[E] Talk", cx, y - 8)
      }
    }
}

function drawEnemies(ctx: Ctx, s: GameState): void {
  for (const e of s.enemies) {
    if (!e.alive) continue
    const cx = e.x + ENEMY_WIDTH / 2
    const cy = e.y + ENEMY_HEIGHT / 2 + Math.sin(e.bob) * 3
    const flash = e.iframes > 0 && (e.iframes & 2) === 0
    // Trailing wisp
    ctx.globalAlpha = 0.25
    ctx.fillStyle = "#5a3a8a"
    ctx.beginPath()
    ctx.ellipse(cx, cy + 8, ENEMY_WIDTH * 0.6, 5, 0, 0, Math.PI * 2)
    ctx.fill()
    // Body
    ctx.globalAlpha = 0.92
    ctx.fillStyle = flash ? "#ffffff" : "#9a6ad8"
    ctx.beginPath()
    ctx.arc(cx, cy, ENEMY_WIDTH / 2, 0, Math.PI * 2)
    ctx.fill()
    // Eyes
    ctx.globalAlpha = 1
    ctx.fillStyle = flash ? "#9a6ad8" : "#1a0a2a"
    const ex = e.facing > 0 ? 3 : -3
    ctx.beginPath()
    ctx.arc(cx - 4 + ex, cy - 2, 2, 0, Math.PI * 2)
    ctx.arc(cx + 4 + ex, cy - 2, 2, 0, Math.PI * 2)
    ctx.fill()
    // HP pip row above
    if (e.hp < e.maxHp) {
      for (let i = 0; i < e.maxHp; i++) {
        ctx.fillStyle = i < e.hp ? "#ff6080" : "#3a2050"
        ctx.fillRect(cx - e.maxHp * 3 + i * 6, cy - ENEMY_HEIGHT / 2 - 6, 4, 3)
      }
    }
  }
  ctx.globalAlpha = 1
}

function drawSlash(ctx: Ctx, s: GameState, ch: Character): void {
  const p = s.p
  if (p.slashFrames <= 0) return
  const t = 1 - p.slashFrames / SLASH_FRAMES // 0 → 1 progress
  const cx = p.x + PLAYER_WIDTH / 2 + p.facing * 14
  const cy = p.y + PLAYER_HEIGHT / 2
  const radius = 18 + t * 14
  const sweep = Math.PI * 0.9
  const start = p.facing > 0 ? -sweep / 2 : Math.PI - sweep / 2
  ctx.save()
  ctx.globalAlpha = 1 - t
  ctx.strokeStyle = ch.accent
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(cx, cy, radius, start, start + sweep)
  ctx.stroke()
  ctx.globalAlpha = (1 - t) * 0.4
  ctx.lineWidth = 9
  ctx.stroke()
  ctx.restore()
}

function drawPlayer(ctx: Ctx, s: GameState, ch: Character): void {
  const p = s.p
  const cx = p.x + PLAYER_WIDTH / 2,
    by = p.y + PLAYER_HEIGHT
  if (isReady(SPRITES.player)) {
    ctx.save()
    ctx.translate(Math.round(cx), Math.round(by))
    ctx.scale(p.facing, 1)
    const spec = ASSET_SIZES.player
    ctx.drawImage(SPRITES.player, -spec.w / 2, -spec.h, spec.w, spec.h)
    ctx.restore()
    return
  }
  const sq = p.squash
  const bodyH = PLAYER_HEIGHT * sq,
    bodyW = PLAYER_WIDTH * (2 - sq)
  const moving = Math.abs(p.vx) > 0.5 && p.onGround
  const swing = Math.sin(p.anim * 4) * (moving ? 1 : 0)
  const inAir = !p.onGround
  ctx.save()
  ctx.translate(Math.round(cx), Math.round(by))
  ctx.scale(p.facing, 1)
  ctx.fillStyle = "rgba(0,0,0,0.3)"
  ctx.beginPath()
  ctx.ellipse(0, 2, 12 * (p.onGround ? 1 : 0.6), 3, 0, 0, Math.PI * 2)
  ctx.fill()
  if (p.dashFrames > 0) {
    ctx.fillStyle = ch.accent
    ctx.globalAlpha = 0.4
    for (let i = 1; i <= 3; i++) ctx.fillRect(-bodyW / 2 - i * 6, -bodyH * 0.7, bodyW, bodyH * 0.7)
    ctx.globalAlpha = 1
  }
  const legSwing = inAir ? -2 : swing * 4
  ctx.fillStyle = ch.pants
  ctx.fillRect(-bodyW / 2 + 2, -bodyH * 0.4, bodyW / 2 - 3, bodyH * 0.4 - legSwing)
  ctx.fillRect(0, -bodyH * 0.4, bodyW / 2 - 3, bodyH * 0.4 + legSwing)
  ctx.fillStyle = "#1a1a1a"
  ctx.fillRect(-bodyW / 2 + 2, -bodyH * 0.04 - legSwing, bodyW / 2 - 3, 4)
  ctx.fillRect(0, -bodyH * 0.04 + legSwing, bodyW / 2 - 3, 4)
  const tg = ctx.createLinearGradient(-bodyW / 2, -bodyH, bodyW / 2, -bodyH * 0.4)
  tg.addColorStop(0, shade(ch.shirt, -20))
  tg.addColorStop(0.5, ch.shirt)
  tg.addColorStop(1, shade(ch.shirt, -10))
  ctx.fillStyle = tg
  ctx.fillRect(-bodyW / 2, -bodyH * 0.78, bodyW, bodyH * 0.4)
  ctx.fillStyle = ch.accent
  ctx.fillRect(-bodyW / 2, -bodyH * 0.55, bodyW, 2)
  const armSwing = inAir ? -3 : -swing * 4
  ctx.fillStyle = ch.shirt
  ctx.fillRect(-bodyW / 2 - 4, -bodyH * 0.74, 5, bodyH * 0.32 + armSwing)
  ctx.fillRect(bodyW / 2 - 1, -bodyH * 0.74, 5, bodyH * 0.32 - armSwing)
  ctx.fillStyle = ch.skin
  ctx.fillRect(-bodyW / 2 - 4, -bodyH * 0.42 + armSwing, 5, 4)
  ctx.fillRect(bodyW / 2 - 1, -bodyH * 0.42 - armSwing, 5, 4)
  ctx.fillStyle = ch.skin
  ctx.beginPath()
  ctx.arc(0, -bodyH * 0.86, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = ch.hair
  if (ch.hairStyle === "short") {
    ctx.beginPath()
    ctx.arc(0, -bodyH * 0.92, 8, Math.PI, 0)
    ctx.fill()
  } else if (ch.hairStyle === "med") {
    ctx.beginPath()
    ctx.arc(0, -bodyH * 0.92, 9, Math.PI, 0)
    ctx.fill()
    ctx.fillRect(-9, -bodyH * 0.92, 4, 8)
    ctx.fillRect(5, -bodyH * 0.92, 4, 6)
  } else {
    ctx.beginPath()
    ctx.arc(0, -bodyH * 0.92, 9, Math.PI, 0)
    ctx.fill()
    ctx.fillRect(-9, -bodyH * 0.93, 4, 18)
    ctx.fillRect(5, -bodyH * 0.93, 4, 18)
  }
  ctx.fillStyle = "#1a1a1a"
  ctx.fillRect(-3, -bodyH * 0.87, 1.5, 1.5)
  ctx.fillRect(2, -bodyH * 0.87, 1.5, 1.5)
  ctx.restore()
}

function shade(hex: string, amt: number): string {
  const h = hex.replace("#", "")
  const r = parseInt(h.slice(0, 2), 16),
    g = parseInt(h.slice(2, 4), 16),
    b = parseInt(h.slice(4, 6), 16)
  const c = (v: number): number => Math.max(0, Math.min(255, v + amt))
  return "rgb(" + c(r) + "," + c(g) + "," + c(b) + ")"
}
