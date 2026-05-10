// Animation selection + frame-index math. Pure functions of physics state —
// no I/O, no React, no canvas. Enables the renderer to pick the current
// animation for an entity without storing animation state on the entity.

import type { Enemy, PlayerState } from "@/game/types/physics"

// Frame index from world time (in physics ticks). For loop=true, wraps
// modulo frame count. For loop=false, clamps to the last frame so the
// renderer holds the final pose until the caller switches to a different
// animation (e.g. slashFrames hits 0 → selectPlayerAnim picks "idle").
export function frameIndex(frames: number, fps: number, loop: boolean, time: number): number {
  const tick = Math.floor((time * fps) / 60)
  return loop ? ((tick % frames) + frames) % frames : Math.max(0, Math.min(tick, frames - 1))
}

// Player animation priority order. Higher rules win — death freezes on
// "hurt", then iframe-recovery shows "hurt", then combat actions, then
// air state, then ground state.
export function selectPlayerAnim(p: PlayerState): string {
  if (p.dead) return "hurt"
  if (p.damageIframes > 30) return "hurt" // first half of post-hit window
  if (p.slashFrames > 0) return "slash"
  if (p.dashFrames > 0) return "dash"
  if (!p.onGround && p.vy < 0) return "jump"
  if (!p.onGround) return "fall"
  if (Math.abs(p.vx) > 0.3) return "run"
  return "idle"
}

// Per-archetype enemy animation. Each archetype's selector reads only the
// fields physics already maintains for that AI — windup/lunging for slammer,
// fireCool for spitter, diveTime for burrower, iframes for hit reaction.
export function selectEnemyAnim(e: Enemy): string {
  if (e.iframes > 0) return "hurt"
  switch (e.type) {
    case "ghost":
      return "idle"
    case "slammer":
      if (e.lunging > 0) return "lunge"
      if (e.windup > 0) return "windup"
      return "idle"
    case "spitter":
      // Spitter fireCool counts down from fireInterval (90) to 0; physics
      // fires + resets at 0. The last 12 ticks (fireCool 0..11) are the
      // visible wind-up; the first 12 ticks after firing (fireCool 79..90)
      // are the post-fire rest. Everything else is idle drift.
      if (e.fireCool < 12) return "fire"
      if (e.fireCool > 78) return "idle"
      return "idle"
    case "burrower":
      if (e.diveTime > 0) return "dive"
      return "idle"
  }
}
