import {
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  TILE_SIZE,
  VIEWPORT_HEIGHT,
  VIEWPORT_WIDTH,
  ENEMY_STATS,
  PROJECTILE_RADIUS,
  SLASH_FRAMES,
} from "@/game/constants"
import { cellKey } from "@/game/physics"
import { ASSET_SIZES, SPRITES, isReady, tryDrawSprite } from "@/game/sprites"
import type { Character, GameState, PlayerState, Theme, TileChar } from "@/game/types/physics"

type Ctx = CanvasRenderingContext2D

// Normalized slash progress in [0, 1]: 0 = sheathed, →1 = fully through the
// swing animation. Centralized so drawPlayer (sprite + procedural paths) and
// drawSlash share one source of truth for the swing timeline.
function slashProgress(p: PlayerState): number {
  return p.slashFrames > 0 ? 1 - p.slashFrames / SLASH_FRAMES : 0
}

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
  drawProjectiles(ctx, s)
  drawLostCache(ctx, s)
  for (const pt of s.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.max)
    ctx.fillStyle = pt.color
    ctx.beginPath()
    ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
  drawAuras(ctx, s)
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
        key = cellKey(s, tx, ty)
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
        // Portal tier-aware visual. Tier 0 = purple/cool (current), tier 1+
        // = red/menacing hardmode glow + label change. portalId is "<tx>,<ty>"
        // (matching cb.transitionToDelve / s.portals key).
        const cx = x + TILE_SIZE / 2,
          by = y + TILE_SIZE
        const portalId = `${tx},${ty}`
        const portal = s.portals.get(portalId)
        const tier = portal?.tier ?? 0
        const cy = y + TILE_SIZE / 2
        if (tier === 0 && tryDrawSprite(ctx, "portal_delve", cx, by)) {
          // sprite path — fresh tier 0 only; hardmode skips sprite to read
          // visually distinct without needing custom art.
        } else {
          ctx.save()
          // Pick a glow palette per tier. Tier 0 = lavender, tier 1+ = blood.
          const glow = tier > 0 ? [255, 70, 70] : [160, 100, 220]
          const core = tier > 0 ? "#3a0a0a" : "#1a0a2a"
          for (let i = 3; i >= 0; i--) {
            const r = 20 + i * 6 + Math.sin(s.time * 0.005 + i) * 3
            ctx.fillStyle = `rgba(${glow[0]},${glow[1]},${glow[2]},${0.15 + i * 0.06})`
            ctx.beginPath()
            ctx.ellipse(cx, cy - 8, r * 0.7, r, 0, 0, Math.PI * 2)
            ctx.fill()
          }
          ctx.fillStyle = core
          ctx.beginPath()
          ctx.ellipse(cx, cy - 8, 14, 22, 0, 0, Math.PI * 2)
          ctx.fill()
          // Hardmode jitter — quick flickering motes orbit the rift.
          if (tier > 0) {
            for (let i = 0; i < 6; i++) {
              const ang = s.time * 0.02 + (i * Math.PI) / 3
              const mx = cx + Math.cos(ang) * 22
              const my = cy - 8 + Math.sin(ang) * 26
              ctx.fillStyle = "rgba(255,180,80,0.7)"
              ctx.beginPath()
              ctx.arc(mx, my, 1.6, 0, Math.PI * 2)
              ctx.fill()
            }
          }
          ctx.restore()
        }
        ctx.fillStyle = tier > 0 ? "rgba(255,160,160,0.95)" : "rgba(255,255,255,0.85)"
        ctx.font = "12px sans-serif"
        ctx.textAlign = "center"
        ctx.fillText(tier > 0 ? "[E] Hardmode Delve" : "[E] Enter Delve", cx, y - 8)
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
      } else if (c === "X") {
        // Sealed portal — visible rubble in the spot where the rift used to be.
        const cx = x + TILE_SIZE / 2,
          cy = y + TILE_SIZE / 2
        ctx.save()
        ctx.fillStyle = "#1a1015"
        ctx.beginPath()
        ctx.ellipse(cx, cy + 6, 16, 8, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = "#3a2530"
        ctx.fillRect(cx - 10, cy - 4, 7, 9)
        ctx.fillRect(cx - 1, cy - 8, 8, 11)
        ctx.fillRect(cx + 6, cy - 2, 5, 7)
        ctx.fillStyle = "rgba(120,60,160,0.4)"
        ctx.fillRect(cx - 2, cy - 4, 3, 5)
        ctx.restore()
        ctx.fillStyle = "rgba(180,140,180,0.5)"
        ctx.font = "10px sans-serif"
        ctx.textAlign = "center"
        ctx.fillText("sealed", cx, y - 4)
      } else if (c === "n") {
        // Elder NPC — taller robed figure with proper neck + hair on the
        // top of the head. Sprite slot npc_elder takes priority.
        const cx = x + TILE_SIZE / 2,
          by = y + TILE_SIZE - 4
        if (!tryDrawSprite(ctx, "npc_elder", cx, by)) {
          // Shadow
          ctx.fillStyle = "#3a2030"
          ctx.beginPath()
          ctx.ellipse(cx, by + 2, 10, 3, 0, 0, Math.PI * 2)
          ctx.fill()
          // Legs / boots peek under the robe so the figure has a base
          ctx.fillStyle = "#2a1a30"
          ctx.fillRect(cx - 6, by - 6, 4, 6)
          ctx.fillRect(cx + 2, by - 6, 4, 6)
          // Robe (taller torso)
          ctx.fillStyle = "#5a4480"
          ctx.fillRect(cx - 9, by - 32, 18, 28)
          // Sleeves — same robe color, hang at the sides
          ctx.fillRect(cx - 13, by - 28, 4, 17)
          ctx.fillRect(cx + 9, by - 28, 4, 17)
          // Hands at the cuff (skin)
          ctx.fillStyle = "#e8c1a0"
          ctx.fillRect(cx - 13, by - 12, 4, 4)
          ctx.fillRect(cx + 9, by - 12, 4, 4)
          // Sash detail across the middle of the robe
          ctx.fillStyle = "#3a2860"
          ctx.fillRect(cx - 9, by - 18, 18, 2)
          // Neck — skin column between robe top and head bottom
          ctx.fillStyle = "#e8c1a0"
          ctx.fillRect(cx - 3, by - 36, 6, 5)
          // Head sits above the neck so hair anchors correctly
          ctx.beginPath()
          ctx.arc(cx, by - 44, 7, 0, Math.PI * 2)
          ctx.fill()
          // Hair — sits on the top half of the head, not across the body
          ctx.fillStyle = "#3a2820"
          ctx.beginPath()
          ctx.arc(cx, by - 46, 8, Math.PI, 0)
          ctx.fill()
          ctx.fillRect(cx - 8, by - 46, 3, 6)
          ctx.fillRect(cx + 5, by - 46, 3, 6)
          // Eyes
          ctx.fillStyle = "#1a1a1a"
          ctx.fillRect(cx - 3, by - 44, 1.5, 1.5)
          ctx.fillRect(cx + 1.5, by - 44, 1.5, 1.5)
        }
        ctx.fillStyle = "rgba(255,255,255,0.85)"
        ctx.font = "12px sans-serif"
        ctx.textAlign = "center"
        ctx.fillText("[E] Talk", cx, y - 8)
      } else if (c === "M") {
        // Merchant — green-cloaked figure with bronze belt and dark hair.
        // Sprite slot npc_merchant for custom artwork.
        const cx = x + TILE_SIZE / 2,
          by = y + TILE_SIZE - 4
        if (!tryDrawSprite(ctx, "npc_merchant", cx, by)) {
          // Shadow
          ctx.fillStyle = "#202a30"
          ctx.beginPath()
          ctx.ellipse(cx, by + 2, 10, 3, 0, 0, Math.PI * 2)
          ctx.fill()
          // Boots peek below the cloak
          ctx.fillStyle = "#1a2018"
          ctx.fillRect(cx - 6, by - 6, 4, 6)
          ctx.fillRect(cx + 2, by - 6, 4, 6)
          // Cloak (taller torso to match Elder height)
          ctx.fillStyle = "#3a6a4a"
          ctx.fillRect(cx - 9, by - 32, 18, 28)
          // Sleeves
          ctx.fillRect(cx - 13, by - 28, 4, 17)
          ctx.fillRect(cx + 9, by - 28, 4, 17)
          // Hands (skin) at cuffs
          ctx.fillStyle = "#e8c1a0"
          ctx.fillRect(cx - 13, by - 12, 4, 4)
          ctx.fillRect(cx + 9, by - 12, 4, 4)
          // Bronze belt across the middle
          ctx.fillStyle = "#c8a050"
          ctx.fillRect(cx - 9, by - 18, 18, 2)
          // Neck
          ctx.fillStyle = "#e8c1a0"
          ctx.fillRect(cx - 3, by - 36, 6, 5)
          // Head
          ctx.beginPath()
          ctx.arc(cx, by - 44, 7, 0, Math.PI * 2)
          ctx.fill()
          // Short dark hair on top of the head
          ctx.fillStyle = "#1a1a1a"
          ctx.beginPath()
          ctx.arc(cx, by - 46, 7.5, Math.PI, 0)
          ctx.fill()
          // Eyes
          ctx.fillStyle = "#0a0a0a"
          ctx.fillRect(cx - 3, by - 44, 1.5, 1.5)
          ctx.fillRect(cx + 1.5, by - 44, 1.5, 1.5)
        }
        ctx.fillStyle = "rgba(255,255,255,0.85)"
        ctx.font = "12px sans-serif"
        ctx.textAlign = "center"
        ctx.fillText("[E] Trade", cx, y - 8)
      }
    }
}

function drawEnemies(ctx: Ctx, s: GameState): void {
  for (const e of s.enemies) {
    if (!e.alive) continue
    const stats = ENEMY_STATS[e.type]
    const eW = stats.w
    const eH = stats.h
    const cx = e.x + eW / 2
    const cy = e.y + eH / 2 + Math.sin(e.bob) * 3
    const flash = e.iframes > 0 && (e.iframes & 2) === 0

    // Sprite path for each archetype — sprite takes priority over the
    // procedural body draw. Skip for diving burrowers (mound view below).
    if (
      !(e.type === "burrower" && e.diveTime > 0) &&
      tryDrawSprite(
        ctx,
        e.type === "ghost"
          ? "enemy_ghost"
          : e.type === "slammer"
            ? "enemy_slammer"
            : e.type === "spitter"
              ? "enemy_spitter"
              : "enemy_burrower",
        cx,
        cy,
      )
    ) {
      // Sprite handled the body. Continue past procedural bodies, but still
      // run chill overlay + HP pip below.
    } else if (e.type === "ghost") {
      ctx.globalAlpha = 0.25
      ctx.fillStyle = "#5a3a8a"
      ctx.beginPath()
      ctx.ellipse(cx, cy + 8, eW * 0.6, 5, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 0.92
      ctx.fillStyle = flash ? "#ffffff" : "#9a6ad8"
      ctx.beginPath()
      ctx.arc(cx, cy, eW / 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.fillStyle = flash ? "#9a6ad8" : "#1a0a2a"
      const ex = e.facing > 0 ? 3 : -3
      ctx.beginPath()
      ctx.arc(cx - 4 + ex, cy - 2, 2, 0, Math.PI * 2)
      ctx.arc(cx + 4 + ex, cy - 2, 2, 0, Math.PI * 2)
      ctx.fill()
    } else if (e.type === "slammer") {
      // Stout, armored body. Windup turns the body red as a tell; lunge
      // streaks the silhouette. Eye row is angry.
      const winduping = e.windup > 0
      const lunging = e.lunging > 0
      ctx.globalAlpha = 0.3
      ctx.fillStyle = "#3a1a1a"
      ctx.beginPath()
      ctx.ellipse(cx, cy + 12, eW * 0.55, 6, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 0.95
      const baseColor = flash ? "#ffffff" : winduping ? "#e84040" : "#a83030"
      ctx.fillStyle = baseColor
      // Slightly hexagonal body
      ctx.beginPath()
      ctx.moveTo(cx - eW * 0.45, cy)
      ctx.lineTo(cx - eW * 0.3, cy - eH * 0.42)
      ctx.lineTo(cx + eW * 0.3, cy - eH * 0.42)
      ctx.lineTo(cx + eW * 0.45, cy)
      ctx.lineTo(cx + eW * 0.3, cy + eH * 0.42)
      ctx.lineTo(cx - eW * 0.3, cy + eH * 0.42)
      ctx.closePath()
      ctx.fill()
      // Plate seam
      ctx.fillStyle = "#5a1010"
      ctx.fillRect(cx - eW * 0.4, cy - 1, eW * 0.8, 2)
      // Eyes
      ctx.fillStyle = winduping || lunging ? "#fff200" : "#ffe060"
      ctx.fillRect(cx - 8, cy - 6, 4, 3)
      ctx.fillRect(cx + 4, cy - 6, 4, 3)
      // Windup tell — a circle pulse around the body
      if (winduping) {
        const stats2 = ENEMY_STATS.slammer
        const t = 1 - e.windup / stats2.windupFrames
        ctx.globalAlpha = 0.5 * (1 - t)
        ctx.strokeStyle = "#ff5040"
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(cx, cy, eW * 0.5 + t * 28, 0, Math.PI * 2)
        ctx.stroke()
      }
    } else if (e.type === "burrower") {
      // Two visual modes: above-ground claw beast, or moving dirt mound at
      // floor level when diveTime > 0.
      if (e.diveTime > 0) {
        // Mound — y reads the spawn surface (we kept e.y at surface even
        // while burrowing, since gameplay only needs the x to follow).
        const mx = cx
        const my = e.y + eH - 4
        ctx.globalAlpha = 0.95
        ctx.fillStyle = "#5a3820"
        ctx.beginPath()
        ctx.ellipse(mx, my + 2, 18, 9, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = "#7a5030"
        ctx.beginPath()
        ctx.ellipse(mx, my, 14, 6, 0, 0, Math.PI * 2)
        ctx.fill()
        // Tail of dust trailing behind motion direction.
        ctx.fillStyle = "rgba(140,90,50,0.5)"
        ctx.beginPath()
        ctx.ellipse(mx - e.facing * 14, my + 4, 6, 3, 0, 0, Math.PI * 2)
        ctx.fill()
      } else {
        // Above-ground: claw beast — wider stance, prominent tusks.
        ctx.globalAlpha = 0.3
        ctx.fillStyle = "#3a2a1a"
        ctx.beginPath()
        ctx.ellipse(cx, cy + 10, eW * 0.6, 5, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 0.95
        ctx.fillStyle = flash ? "#ffffff" : "#8a5a30"
        // Trapezoidal body
        ctx.beginPath()
        ctx.moveTo(cx - eW * 0.45, cy + eH * 0.42)
        ctx.lineTo(cx - eW * 0.32, cy - eH * 0.4)
        ctx.lineTo(cx + eW * 0.32, cy - eH * 0.4)
        ctx.lineTo(cx + eW * 0.45, cy + eH * 0.42)
        ctx.closePath()
        ctx.fill()
        // Tusks
        ctx.fillStyle = "#e0d0a0"
        ctx.fillRect(cx - 8, cy + 2, 3, 7)
        ctx.fillRect(cx + 5, cy + 2, 3, 7)
        // Eyes — beady red
        ctx.fillStyle = flash ? "#3a2a1a" : "#ff4040"
        ctx.fillRect(cx - 7, cy - 6, 3, 3)
        ctx.fillRect(cx + 4, cy - 6, 3, 3)
      }
    } else if (e.type === "spitter") {
      // Small floating orb-like creature with a single glowing eye that
      // brightens as it's about to fire.
      const stats3 = ENEMY_STATS.spitter
      const charging = e.fireCool < 20
      ctx.globalAlpha = 0.25
      ctx.fillStyle = "#2a1a3a"
      ctx.beginPath()
      ctx.ellipse(cx, cy + 6, eW * 0.45, 4, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 0.95
      ctx.fillStyle = flash ? "#ffffff" : "#5a30a0"
      ctx.beginPath()
      ctx.arc(cx, cy, eW / 2, 0, Math.PI * 2)
      ctx.fill()
      // Single big eye, color shifts as fire approaches
      const eyeColor = charging
        ? "#ff80ff"
        : e.fireCool < stats3.fireInterval / 2
          ? "#c060ff"
          : "#a060e0"
      ctx.fillStyle = eyeColor
      ctx.beginPath()
      ctx.arc(cx + e.facing * 2, cy - 2, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#1a0a2a"
      ctx.beginPath()
      ctx.arc(cx + e.facing * 3, cy - 2, 1.5, 0, Math.PI * 2)
      ctx.fill()
    }

    // Glacial chill overlay — sprite slot first, then procedural blue tint.
    if (e.chillTime > 0 && !tryDrawSprite(ctx, "aura_glacial", cx, cy)) {
      ctx.globalAlpha = 0.35
      ctx.fillStyle = "#80c0ff"
      ctx.beginPath()
      ctx.arc(cx, cy, eW / 2 + 3, 0, Math.PI * 2)
      ctx.fill()
    }
    // HP pip row — only show when damaged so chase enemies don't read busy.
    // Suppress while burrower is underground (no body to display under).
    ctx.globalAlpha = 1
    if (e.hp < e.maxHp && !(e.type === "burrower" && e.diveTime > 0)) {
      for (let i = 0; i < e.maxHp; i++) {
        ctx.fillStyle = i < e.hp ? "#ff6080" : "#3a2050"
        ctx.fillRect(cx - e.maxHp * 3 + i * 6, cy - eH / 2 - 6, 4, 3)
      }
    }
  }
  ctx.globalAlpha = 1
}

function drawProjectiles(ctx: Ctx, s: GameState): void {
  for (const pr of s.projectiles) {
    // Sprite slot first — drawn at center anchor.
    if (tryDrawSprite(ctx, "projectile", pr.x, pr.y)) continue
    // Soft outer glow
    ctx.globalAlpha = 0.4
    ctx.fillStyle = "#c060ff"
    ctx.beginPath()
    ctx.arc(pr.x, pr.y, PROJECTILE_RADIUS + 3, 0, Math.PI * 2)
    ctx.fill()
    // Hard core
    ctx.globalAlpha = 0.95
    ctx.fillStyle = "#7a30c0"
    ctx.beginPath()
    ctx.arc(pr.x, pr.y, PROJECTILE_RADIUS, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = "#ffffff"
    ctx.beginPath()
    ctx.arc(pr.x - 1.5, pr.y - 1.5, 1.5, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

// Death-cache marker — the active portal's lostCache, if any. Drawn after
// entities/enemies/projectiles so it sits in front of the world but behind
// the player. Pulses cyan; the player walks over it to reclaim.
function drawLostCache(ctx: Ctx, s: GameState): void {
  if (s.current !== "delve" || s.activePortalId === null) return
  const portal = s.portals.get(s.activePortalId)
  if (!portal || !portal.lostCache) return
  const lc = portal.lostCache
  const t = Math.sin(s.time * 0.005) * 0.5 + 0.5
  ctx.save()
  ctx.translate(lc.x, lc.y - 8)
  // Outer pulsing halo
  const radius = 22 + 6 * t
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius)
  g.addColorStop(0, "rgba(160,232,255,0.55)")
  g.addColorStop(1, "rgba(160,232,255,0)")
  ctx.fillStyle = g
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2)
  // Inner crystal shape
  ctx.globalAlpha = 0.7 + 0.3 * t
  ctx.fillStyle = "#a0e8ff"
  ctx.beginPath()
  ctx.moveTo(0, -10)
  ctx.lineTo(7, -2)
  ctx.lineTo(5, 8)
  ctx.lineTo(-5, 8)
  ctx.lineTo(-7, -2)
  ctx.closePath()
  ctx.fill()
  // Bright highlight
  ctx.globalAlpha = 1
  ctx.fillStyle = "#e8faff"
  ctx.beginPath()
  ctx.moveTo(0, -10)
  ctx.lineTo(7, -2)
  ctx.lineTo(2, 0)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  ctx.globalAlpha = 1
}

// Per-weapon blade tuning. Index by s.activeWeaponLevel (0|1|2).
// Picked to give a clear visual delta tier-to-tier so a forge purchase reads
// instantly: blade gets longer, brighter, and (Honed) gains a cyan rim glow.
const SWORD_TIERS = [
  { len: 18, blade: "#888888", highlight: null, cross: "#b89030", glow: null },
  { len: 22, blade: "#c0c0d0", highlight: "#e8eef0", cross: "#c8c8d0", glow: null },
  {
    len: 26,
    blade: "#e0eaf0",
    highlight: "#ffffff",
    cross: "#e0c060",
    glow: "rgba(160,220,255,0.6)",
  },
] as const

const HILT_GRIP = "#5a3a20"
const SCABBARD = "#3a2818"

// drawSword is called from inside drawPlayer's already-translated /
// already-mirrored coordinate space. (anchorX, anchorY) is the hip in
// player-local pixels. Caller has applied ctx.scale(facing, 1), so +x is
// "forward" regardless of the actual screen direction — we don't need
// `facing` here.
//
//   slashProgress === 0 → sheathed: scabbard + hilt sit on the right hip.
//   slashProgress  > 0 → drawn: blade swings from down-back (+30°) to
//                         forward-up (-45°) on a quadratic-ease curve so the
//                         strike has weight (slow start → snap → recovery).
function drawSword(
  ctx: Ctx,
  anchorX: number,
  anchorY: number,
  weaponLevel: number,
  slashProgress: number,
): void {
  const tierIdx = Math.max(0, Math.min(2, weaponLevel)) as 0 | 1 | 2
  const tier = SWORD_TIERS[tierIdx]
  if (slashProgress <= 0) {
    // Sheathed: scabbard hangs from the right hip; hilt + crossguard +
    // pommel poke up just above it. All offsets are in player-local px.
    ctx.save()
    ctx.translate(anchorX, anchorY)
    // Scabbard (rectangle, slightly tilted by drawing it as a parallelogram).
    ctx.fillStyle = SCABBARD
    ctx.fillRect(-1, 0, 4, 11)
    ctx.fillStyle = "rgba(0,0,0,0.35)"
    ctx.fillRect(2, 0, 1, 11)
    // Hilt grip
    ctx.fillStyle = HILT_GRIP
    ctx.fillRect(0, -5, 2, 5)
    // Crossguard
    ctx.fillStyle = tier.cross
    ctx.fillRect(-2, -6, 6, 1.5)
    // Pommel
    ctx.fillRect(0, -7, 2, 1.5)
    ctx.restore()
    return
  }

  // Quadratic ease — slashProgress * (2 - slashProgress). Front-loaded
  // velocity: fast early, settles late. Reads as a snap on the strike.
  const eased = slashProgress * (2 - slashProgress)
  const startAng = (30 * Math.PI) / 180 // +30° (down-back)
  const endAng = (-45 * Math.PI) / 180 // -45° (forward-up)
  const ang = startAng + (endAng - startAng) * eased
  const len = tier.len
  // Hand grip extends ~5px out from the hip toward the blade direction; the
  // blade then continues for `len` more pixels.
  const gripLen = 5

  ctx.save()
  ctx.translate(anchorX, anchorY)
  ctx.rotate(ang)
  // Grip
  ctx.fillStyle = HILT_GRIP
  ctx.fillRect(0, -1.5, gripLen, 3)
  // Crossguard — perpendicular to blade
  ctx.fillStyle = tier.cross
  ctx.fillRect(gripLen - 1, -4, 2, 8)
  // Pommel
  ctx.fillRect(-2, -2, 2, 4)
  // Honed: cyan rim glow during the swing. Drawn before the blade fill
  // so the blade sits on top crisply. Reset shadow afterward to avoid
  // bleeding into other primitives.
  if (tier.glow !== null) {
    ctx.shadowBlur = 10
    ctx.shadowColor = tier.glow
  }
  // Blade body
  ctx.fillStyle = tier.blade
  ctx.fillRect(gripLen, -2, len, 4)
  // Blade tip (triangular end)
  ctx.beginPath()
  ctx.moveTo(gripLen + len, -2)
  ctx.lineTo(gripLen + len + 3, 0)
  ctx.lineTo(gripLen + len, 2)
  ctx.closePath()
  ctx.fill()
  if (tier.glow !== null) {
    ctx.shadowBlur = 0
    ctx.shadowColor = "transparent"
  }
  // Center highlight stripe — Forged + Honed only
  if (tier.highlight !== null) {
    ctx.fillStyle = tier.highlight
    ctx.fillRect(gripLen, -0.5, len, 1)
  }
  ctx.restore()
}

// Mod auras during slash. The sword itself is the slash visual (drawn
// inside drawPlayer); this pass adds elemental garnish on top, centered on
// the moving blade midpoint so the auras track the swing instead of
// floating at a static arc anchor.
function drawSlash(ctx: Ctx, s: GameState, _ch: Character): void {
  const p = s.p
  if (p.slashFrames <= 0) return
  const mods = s.activeMods
  const hasSearing = mods.includes("searing")
  const hasStormbound = mods.includes("stormbound")
  if (!hasSearing && !hasStormbound) return

  const t = slashProgress(p) // 0 → 1 progress
  // Compute the blade midpoint in WORLD coords using the same eased angle
  // as drawSword. Hip anchor is the player's right hip; mirror x by facing.
  const eased = t * (2 - t)
  const startAng = (30 * Math.PI) / 180
  const endAng = (-45 * Math.PI) / 180
  const ang = startAng + (endAng - startAng) * eased
  const tierIdx = Math.max(0, Math.min(2, s.activeWeaponLevel)) as 0 | 1 | 2
  const tier = SWORD_TIERS[tierIdx]
  const bladeLen = tier.len
  // Match drawPlayer's hip anchor in world space (see drawPlayer below).
  const bodyW = PLAYER_WIDTH * (2 - p.squash)
  const bodyH = PLAYER_HEIGHT * p.squash * 1.3
  const hipLocalX = bodyW / 2 - 2
  const hipLocalY = -bodyH * 0.5
  const hipWorldX = p.x + PLAYER_WIDTH / 2 + p.facing * hipLocalX
  const hipWorldY = p.y + PLAYER_HEIGHT + hipLocalY
  // Blade midpoint = hip + grip + half-blade along the rotated forward vector.
  const gripLen = 5
  const midDist = gripLen + bladeLen / 2
  // In player-local space, the rotation rotates +x. To convert to world,
  // multiply x-component by facing (since drawPlayer applies scale(facing,1)).
  const localDX = Math.cos(ang) * midDist
  const localDY = Math.sin(ang) * midDist
  const cx = hipWorldX + p.facing * localDX
  const cy = hipWorldY + localDY
  // Approximate radius around the blade midpoint for the procedural overlays.
  const radius = bladeLen * 0.55 * (hasStormbound ? 1.4 : 1)

  // Searing overlay — sprite first, then procedural flame motes around the
  // blade midpoint.
  if (hasSearing && !tryDrawSprite(ctx, "aura_searing", cx, cy)) {
    ctx.save()
    const sampleCount = 6
    for (let i = 0; i < sampleCount; i++) {
      const a = (Math.PI * 2 * i) / sampleCount
      const ax = cx + Math.cos(a) * radius
      const ay = cy + Math.sin(a) * radius
      const jitter = 4
      const fx = ax + (Math.random() - 0.5) * jitter
      const fy = ay + (Math.random() - 0.5) * jitter
      ctx.globalAlpha = (1 - t) * 0.85
      ctx.fillStyle = i % 2 === 0 ? "#ffcc40" : "#ff5020"
      ctx.beginPath()
      ctx.arc(fx, fy, 2.5 + (1 - t) * 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
  // Stormbound overlay — sprite first, then procedural lightning bolts that
  // forks outward from the blade midpoint.
  if (hasStormbound && !tryDrawSprite(ctx, "aura_stormbound", cx, cy)) {
    ctx.save()
    ctx.globalAlpha = (1 - t) * 0.7
    ctx.strokeStyle = "#a0e0ff"
    ctx.lineWidth = 1.5
    for (let i = 0; i < 3; i++) {
      const a = (Math.PI * 2 * (i + 0.5)) / 3
      const ex = cx + Math.cos(a) * radius
      const ey = cy + Math.sin(a) * radius
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.lineTo(
        cx + (ex - cx) * 0.4 + (Math.random() - 0.5) * 6,
        cy + (ey - cy) * 0.4 + (Math.random() - 0.5) * 6,
      )
      ctx.lineTo(
        cx + (ex - cx) * 0.75 + (Math.random() - 0.5) * 6,
        cy + (ey - cy) * 0.75 + (Math.random() - 0.5) * 6,
      )
      ctx.lineTo(ex, ey)
      ctx.stroke()
    }
    ctx.restore()
  }
}

// Passive aura — drawn under the player so it reads as ambient. Only
// stormbound has a passive ring right now. Sprite slot aura_stormbound
// takes priority.
function drawAuras(ctx: Ctx, s: GameState): void {
  const mods = s.activeMods
  if (!mods.includes("stormbound")) return
  const p = s.p
  const cx = p.x + PLAYER_WIDTH / 2
  const cy = p.y + PLAYER_HEIGHT / 2
  if (tryDrawSprite(ctx, "aura_stormbound", cx, cy)) return
  const pulse = 0.5 + Math.sin(s.time * 0.01) * 0.1
  ctx.save()
  ctx.globalAlpha = 0.18 * pulse
  const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 32)
  grad.addColorStop(0, "rgba(160,220,255,0.6)")
  grad.addColorStop(1, "rgba(80,120,200,0)")
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.arc(cx, cy, 32, 0, Math.PI * 2)
  ctx.fill()
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
    // Sword sits on top of the sprite so the slash visual remains data-driven
    // even when a custom player sprite is loaded.
    if (s.activeHasSword) {
      // Approximate hip position relative to ASSET_SIZES.player (drawn from
      // bottom-center). spec.h/2 ≈ belt height, spec.w/2 - 2 = right hip.
      // Sprite-path anchor uses ASSET_SIZES dimensions (no squash). When a
      // player sprite is wired, the sword's hip placement will be static
      // rather than tracking the body's squash anim — by design, since the
      // sprite frame itself shouldn't be re-deformed by squash. Procedural
      // path below uses bodyW/bodyH so the sword bobs with the body.
      const hipX = spec.w / 2 - 2
      const hipY = -spec.h * 0.5
      drawSword(ctx, hipX, hipY, s.activeWeaponLevel, slashProgress(p))
    }
    ctx.restore()
    return
  }
  const sq = p.squash
  // Visual scale decoupled from hitbox — bodyH drives all body part offsets,
  // so a single multiplier here lengthens the silhouette without changing
  // collision. 1.3 reads "stocky humanoid" instead of the previous "stubby".
  const bodyH = PLAYER_HEIGHT * sq * 1.3,
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
  // Torso uses a vertical gradient (top → bottom) so the LEFT/RIGHT edges
  // stay the solid shirt color — that way the arms (also solid shirt) sit
  // flush against the torso instead of reading as detached strips.
  const tg = ctx.createLinearGradient(0, -bodyH * 0.78, 0, -bodyH * 0.4)
  tg.addColorStop(0, shade(ch.shirt, -12))
  tg.addColorStop(1, ch.shirt)
  ctx.fillStyle = tg
  ctx.fillRect(-bodyW / 2, -bodyH * 0.78, bodyW, bodyH * 0.4)
  ctx.fillStyle = ch.accent
  ctx.fillRect(-bodyW / 2, -bodyH * 0.55, bodyW, 2)
  const armSwing = inAir ? -3 : -swing * 4
  // Arms overlap the torso edges by 1 px so there is no visible seam at the
  // shoulder — both pieces are now drawn in solid `ch.shirt`.
  ctx.fillStyle = ch.shirt
  ctx.fillRect(-bodyW / 2 - 3, -bodyH * 0.74, 5, bodyH * 0.32 + armSwing)
  ctx.fillRect(bodyW / 2 - 2, -bodyH * 0.74, 5, bodyH * 0.32 - armSwing)
  ctx.fillStyle = ch.skin
  ctx.fillRect(-bodyW / 2 - 4, -bodyH * 0.42 + armSwing, 5, 4)
  ctx.fillRect(bodyW / 2 - 1, -bodyH * 0.42 - armSwing, 5, 4)
  // Sword on the right hip — sheathed at rest, drawn forward during slash.
  // Drawn after legs+torso+arms but before head/hair so it never occludes
  // the face. Hip anchor sits just past the right edge of the torso, at
  // belt height. drawPlayer is already inside scale(facing, 1), so +x in
  // local coords maps to "forward" regardless of which way the player faces.
  if (s.activeHasSword) {
    const hipX = bodyW / 2 - 2
    const hipY = -bodyH * 0.5
    drawSword(ctx, hipX, hipY, s.activeWeaponLevel, slashProgress(p))
  }
  // Neck — small skin column between the torso top (~-0.78·bodyH) and the
  // head's lifted bottom (~-1.07·bodyH). Without this the head rests directly
  // on the shoulder line and reads as a balaclava.
  ctx.fillStyle = ch.skin
  ctx.fillRect(-3, -bodyH * 0.91, 6, bodyH * 0.13)
  ctx.beginPath()
  ctx.arc(0, -bodyH * 1.15, 8, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = ch.hair
  if (ch.hairStyle === "short") {
    ctx.beginPath()
    ctx.arc(0, -bodyH * 1.21, 8, Math.PI, 0)
    ctx.fill()
  } else if (ch.hairStyle === "med") {
    ctx.beginPath()
    ctx.arc(0, -bodyH * 1.21, 9, Math.PI, 0)
    ctx.fill()
    ctx.fillRect(-9, -bodyH * 1.21, 4, 8)
    ctx.fillRect(5, -bodyH * 1.21, 4, 6)
  } else {
    ctx.beginPath()
    ctx.arc(0, -bodyH * 1.21, 9, Math.PI, 0)
    ctx.fill()
    ctx.fillRect(-9, -bodyH * 1.22, 4, 18)
    ctx.fillRect(5, -bodyH * 1.22, 4, 18)
  }
  ctx.fillStyle = "#1a1a1a"
  ctx.fillRect(-3, -bodyH * 1.16, 1.5, 1.5)
  ctx.fillRect(2, -bodyH * 1.16, 1.5, 1.5)
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
