import { useEffect, useRef } from "react"
import type { Character } from "@/game/types/physics"

interface CharacterPreviewProps {
  ch: Character
}

export default function CharacterPreview({ ch }: CharacterPreviewProps) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext("2d")
    if (!ctx) return
    let raf = 0,
      t = 0
    const draw = (): void => {
      ctx.clearRect(0, 0, 200, 240)
      const cx = 100,
        by = 200
      const bob = Math.sin(t * 0.05) * 2
      ctx.save()
      ctx.translate(cx, by + bob)
      // Match the in-game body scale (1.3 height multiplier baked into the
      // base 2.2 scale) so the preview matches what the player sees.
      ctx.scale(2.2, 2.2 * 1.15)
      ctx.fillStyle = "rgba(0,0,0,0.3)"
      ctx.beginPath()
      ctx.ellipse(0, 2, 12, 3, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = ch.pants
      ctx.fillRect(-9, -13, 8, 13)
      ctx.fillRect(1, -13, 8, 13)
      ctx.fillStyle = "#1a1a1a"
      ctx.fillRect(-9, -1.5, 8, 2.5)
      ctx.fillRect(1, -1.5, 8, 2.5)
      ctx.fillStyle = ch.shirt
      ctx.fillRect(-10, -25, 20, 13)
      ctx.fillStyle = ch.accent
      ctx.fillRect(-10, -18, 20, 1.2)
      ctx.fillStyle = ch.shirt
      ctx.fillRect(-13, -24, 4, 11)
      ctx.fillRect(9, -24, 4, 11)
      ctx.fillStyle = ch.skin
      ctx.fillRect(-13, -14, 4, 3)
      ctx.fillRect(9, -14, 4, 3)
      // Neck — same fix as the in-game player render. Head pushed up so
      // there's a visible skin column between torso top (~-25) and head
      // bottom (~-29 with radius 7).
      ctx.fillStyle = ch.skin
      ctx.fillRect(-2.5, -29, 5, 5)
      ctx.beginPath()
      ctx.arc(0, -36, 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = ch.hair
      if (ch.hairStyle === "short") {
        ctx.beginPath()
        ctx.arc(0, -39, 7, Math.PI, 0)
        ctx.fill()
      } else if (ch.hairStyle === "med") {
        ctx.beginPath()
        ctx.arc(0, -39, 8, Math.PI, 0)
        ctx.fill()
        ctx.fillRect(-8, -39, 3, 7)
        ctx.fillRect(5, -39, 3, 5)
      } else {
        ctx.beginPath()
        ctx.arc(0, -39, 8, Math.PI, 0)
        ctx.fill()
        ctx.fillRect(-8, -40, 3, 16)
        ctx.fillRect(5, -40, 3, 16)
      }
      ctx.fillStyle = "#1a1a1a"
      ctx.fillRect(-3, -36, 1.5, 1.5)
      ctx.fillRect(2, -36, 1.5, 1.5)
      ctx.restore()
      t++
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [ch])
  return <canvas ref={ref} width={200} height={240} />
}
