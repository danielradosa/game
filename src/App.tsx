import { useState, useRef, useEffect, useCallback } from "react"
import { TILE_SIZE, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, xpForLevel } from "@/game/constants"
import { ZONES, ACHIEVEMENTS, SKINS, HAIRS, SHIRTS, PANTS, ACCENTS, MODS } from "@/game/data"
import type { AchievementId, ZoneId } from "@/game/data"
import { buildOverworld, generateDelve } from "@/game/levels"
import { freshSeed } from "@/game/rng"
import {
  stepGame,
  makeInitialState,
  snapRenderPrev,
  spawnEnemiesFrom,
} from "@/game/physics"
import { PLAYER_MAX_HP } from "@/game/constants"
import { draw, drawPaused } from "@/game/render"
import { playSnd, setMuted as setMutedAudio } from "@/game/audio"
import { fetchManifest, persistManifest, getSave, setSave, deleteSave } from "@/game/save"
import {
  MainMenu,
  About,
  LoadMenu,
  CharacterCreator,
  InventoryPanel,
  DialogPanel,
} from "@/ui/screens"
import type {
  AppNotification,
  AppScene,
  Character,
  GameState,
  InputState,
  NotifKind,
  NpcId,
  PhysicsCallbacks,
  ZoneBanner,
} from "@/game/types/physics"
import type { HudState, SaveManifest } from "@/game/types/save"

export default function App() {
  const [scene, setScene] = useState<AppScene>("menu")
  const [showInv, setShowInv] = useState(false)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)
  const [character, setCharacter] = useState<Character>({
    name: "Wren",
    skin: SKINS[1],
    hair: HAIRS[1],
    hairStyle: "med",
    shirt: SHIRTS[0],
    pants: PANTS[0],
    accent: ACCENTS[0],
  })
  const [hud, setHud] = useState<HudState>({
    level: 1,
    xp: 0,
    materials: 0,
    discovered: [],
    achievements: [],
    inDelve: false,
    hasSword: false,
    questStage: "intro",
    mods: [],
  })
  const [hp, setHp] = useState<number>(PLAYER_MAX_HP)
  const [dialogNpc, setDialogNpc] = useState<NpcId | null>(null)
  const dialogRef = useRef<NpcId | null>(null)
  dialogRef.current = dialogNpc
  const [notifs, setNotifs] = useState<AppNotification[]>([])
  const [zoneBanner, setZoneBanner] = useState<ZoneBanner | null>(null)
  const [manifest, setManifest] = useState<SaveManifest>([])

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stateRef = useRef<GameState | null>(null)
  const inputRef = useRef<InputState>({
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    jumpEdge: false,
    dash: false,
    dashEdge: false,
    interact: false,
    interactEdge: false,
  })
  const charRef = useRef<Character>(character)
  charRef.current = character
  const hudRef = useRef<HudState>(hud)
  hudRef.current = hud
  const pausedRef = useRef<boolean>(paused)
  pausedRef.current = paused

  useEffect(() => {
    setMutedAudio(muted)
  }, [muted])
  useEffect(() => {
    setManifest(fetchManifest())
  }, [])

  const pushNotif = useCallback((text: string, kind: NotifKind): void => {
    const id = Math.random().toString(36).slice(2)
    setNotifs((n) => [...n, { id, text, kind, born: performance.now() }])
    setTimeout(() => setNotifs((n) => n.filter((x) => x.id !== id)), 3500)
  }, [])

  const grantAch = useCallback(
    (id: AchievementId): void => {
      if (hudRef.current.achievements.includes(id)) return
      // Find can't actually return undefined here — id is constrained to the
      // achievement table's own keys. The non-null assertion documents that.
      const a = ACHIEVEMENTS.find((x) => x.id === id)!
      setHud((h) => ({ ...h, achievements: [...h.achievements, id] }))
      pushNotif("Achievement — " + a.name, "ach")
      playSnd("achievement")
    },
    [pushNotif],
  )

  const grantXP = useCallback(
    (amt: number, label?: string): void => {
      setHud((h) => {
        let xp = h.xp + amt,
          lvl = h.level
        const ups: number[] = []
        while (xp >= xpForLevel(lvl)) {
          xp -= xpForLevel(lvl)
          lvl++
          ups.push(lvl)
        }
        if (label) pushNotif("+" + amt + " XP · " + label, "xp")
        ups.forEach((u) => {
          pushNotif("Level " + u, "level")
          playSnd("level_up")
        })
        return { ...h, xp, level: lvl }
      })
    },
    [pushNotif],
  )

  const discover = useCallback(
    (zoneId: ZoneId): void => {
      if (hudRef.current.discovered.includes(zoneId)) return
      const z = ZONES.find((x) => x.id === zoneId)!
      setHud((h) => ({ ...h, discovered: [...h.discovered, zoneId] }))
      setZoneBanner({ name: z.name, t: performance.now() })
      grantXP(z.xp, "discovery")
      playSnd("discover")
    },
    [grantXP],
  )

  const transitionToDelve = useCallback((): void => {
    const s = stateRef.current
    if (!s) return
    // Sealed portals refuse entry. They only become sealed via the coin flip
    // on a cleared exit (see transitionToOver).
    if (s.portalDestroyed) {
      pushNotif("The rift is sealed", "xp")
      return
    }
    // Use the existing s.dl as-is — the delve persists across visits until the
    // player clears it AND exits, at which point the coin flip fires.
    s.current = "delve"
    s.level = s.dl
    s.p.x = s.dl.spawn.x
    s.p.y = s.dl.spawn.y
    s.p.vx = 0
    s.p.vy = 0
    s.p.dashFrames = 0
    s.p.dashCool = 0
    s.enemies = spawnEnemiesFrom(s.dl.enemySpawns, s.defeatedEnemies)
    s.p.hp = s.p.maxHp
    setHp(s.p.hp)
    snapRenderPrev(s)
    setHud((h) => ({ ...h, inDelve: true }))
    grantAch("a7")
    pushNotif("Entered the Delve", "discovery")
    playSnd("portal")
  }, [grantAch, pushNotif])

  const transitionToOver = useCallback((): void => {
    const s = stateRef.current
    if (!s) return
    s.current = "over"
    s.level = s.ow
    s.p.x = 100 * TILE_SIZE
    // Heightmap was built with W=110 entries; index 100 is provably populated.
    s.p.y = (s.ow.ground[100]! - 3) * TILE_SIZE
    s.p.vx = 0
    s.p.vy = 0
    s.p.dashFrames = 0
    s.p.dashCool = 0
    s.enemies = []
    s.p.hp = s.p.maxHp
    setHp(s.p.hp)
    snapRenderPrev(s)
    setHud((h) => ({ ...h, inDelve: false }))

    // Coin flip — only fires on a cleared exit. 50/50: the rift either
    // reopens as hardmode (regenerate with tier+1, fresh seed, fresh enemies
    // and cells) or seals shut forever (overworld portal becomes rubble).
    if (s.delveCleared) {
      const sealForever = Math.random() < 0.5
      // Either way the current delve session is over, so wipe its scoped state.
      s.defeatedEnemies = new Set<number>()
      s.delveCleared = false
      for (const k of Array.from(s.collected)) {
        if (k.startsWith("delve:")) s.collected.delete(k)
      }
      if (sealForever) {
        s.portalDestroyed = true
        // Mutate every "p" tile in the overworld to "X" (rubble) so the world
        // state matches the flag and the player sees the visual cue.
        for (let y = 0; y < s.ow.H; y++) {
          for (let x = 0; x < s.ow.W; x++) {
            if (s.ow.map[y]![x] === "p") s.ow.map[y]![x] = "X"
          }
        }
        pushNotif("The rift collapses behind you", "discovery")
      } else {
        s.dl = generateDelve(freshSeed(), s.dl.tier + 1)
        pushNotif("The rift pulses with malice — it returns harder", "discovery")
      }
    } else {
      pushNotif("Returned to the surface", "discovery")
    }
    playSnd("portal")
  }, [pushNotif])

  const saveCurrent = useCallback((): void => {
    const s = stateRef.current
    if (!s) return
    const id = "s_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6)
    const data = {
      character: charRef.current,
      hud: hudRef.current,
      pos: { x: s.p.x, y: s.p.y, scene: s.current },
      collected: Array.from(s.collected),
      defeatedEnemies: Array.from(s.defeatedEnemies),
      delveCleared: s.delveCleared,
      delveSeed: s.dl.seed,
      delveTier: s.dl.tier,
      portalDestroyed: s.portalDestroyed,
    }
    const meta = {
      id,
      name: charRef.current.name,
      level: hudRef.current.level,
      materials: hudRef.current.materials,
      discovered: hudRef.current.discovered.length,
      date: new Date().toISOString(),
      where: s.current === "delve" ? "In the Delve" : "Surface",
    }
    if (setSave(id, data)) {
      const next = [meta, ...manifest]
      persistManifest(next)
      setManifest(next)
      pushNotif("Saved", "discovery")
    } else pushNotif("Save failed", "xp")
  }, [manifest, pushNotif])

  // Autosave: writes to a reserved "autosave" slot every 20s while playing.
  // Replaces the existing autosave manifest entry in place so the load menu
  // shows exactly one autosave row, not 180/hr. Skipped while paused, in a
  // dialog, or out of the play scene. Silent — no toast, since 20s notifs
  // would be obnoxious.
  const autosave = useCallback((): void => {
    const s = stateRef.current
    if (!s) return
    const id = "autosave"
    const data = {
      character: charRef.current,
      hud: hudRef.current,
      pos: { x: s.p.x, y: s.p.y, scene: s.current },
      collected: Array.from(s.collected),
      defeatedEnemies: Array.from(s.defeatedEnemies),
      delveCleared: s.delveCleared,
      delveSeed: s.dl.seed,
      delveTier: s.dl.tier,
      portalDestroyed: s.portalDestroyed,
    }
    const meta = {
      id,
      name: charRef.current.name + " — autosave",
      level: hudRef.current.level,
      materials: hudRef.current.materials,
      discovered: hudRef.current.discovered.length,
      date: new Date().toISOString(),
      where: s.current === "delve" ? "In the Delve" : "Surface",
    }
    if (!setSave(id, data)) return
    setManifest((m) => {
      const next = [meta, ...m.filter((e) => e.id !== id)]
      persistManifest(next)
      return next
    })
  }, [])

  useEffect(() => {
    if (scene !== "play") return
    const tick = (): void => {
      if (pausedRef.current) return
      if (dialogRef.current !== null) return
      autosave()
    }
    const handle = window.setInterval(tick, 20_000)
    return () => window.clearInterval(handle)
  }, [scene, autosave])

  const startGameFresh = useCallback((): void => {
    // Initial delve is generated fresh; transitionToDelve regenerates it on
    // every portal entry, so this layout is only seen if the player saves
    // and loads before ever entering a portal.
    const ow = buildOverworld(),
      dl = generateDelve(freshSeed(), 0)
    stateRef.current = makeInitialState(ow, dl, ow.spawn.x, ow.spawn.y, "over", new Set<string>())
    setHud({
      level: 1,
      xp: 0,
      materials: 0,
      discovered: [],
      achievements: [],
      inDelve: false,
      hasSword: false,
      questStage: "intro",
      mods: [],
    })
    setHp(PLAYER_MAX_HP)
    setNotifs([])
    setPaused(false)
    setShowInv(false)
    setScene("play")
  }, [])

  const loadGameById = useCallback(
    (id: string): void => {
      const data = getSave(id)
      if (!data) {
        pushNotif("Load failed", "xp")
        return
      }
      // Reproduce the saved delve from its seed/tier when present. Old saves
      // predate procgen — fall back to a fresh seed; if the player was inside
      // the delve when saving, snap them to the new layout's spawn so they
      // don't end up clipped inside walls.
      const hasDelveSeed = typeof data.delveSeed === "number"
      const ow = buildOverworld()
      const dl = generateDelve(
        hasDelveSeed ? (data.delveSeed as number) : freshSeed(),
        data.delveTier ?? 0,
      )
      const inDelve = data.pos.scene === "delve"
      const startX = inDelve && !hasDelveSeed ? dl.spawn.x : data.pos.x
      const startY = inDelve && !hasDelveSeed ? dl.spawn.y : data.pos.y
      // Reapply portal destruction to the freshly-built overworld map. The map
      // is rebuilt every load (we don't serialize it), so saved rubble-state
      // has to be replayed by mutating "p" → "X" before makeInitialState.
      const portalDestroyed = data.portalDestroyed ?? false
      if (portalDestroyed) {
        for (let y = 0; y < ow.H; y++) {
          for (let x = 0; x < ow.W; x++) {
            if (ow.map[y]![x] === "p") ow.map[y]![x] = "X"
          }
        }
      }
      stateRef.current = makeInitialState(
        ow,
        dl,
        startX,
        startY,
        data.pos.scene,
        new Set<string>(data.collected || []),
        new Set<number>(data.defeatedEnemies || []),
        data.delveCleared ?? false,
        portalDestroyed,
      )
      setCharacter(data.character)
      // Older saves predate the quest/mods/sword fields — default forward
      // (sword granted, quest pre-completed, no mods) so the run remains
      // playable without forcing a re-do.
      setHud({
        ...data.hud,
        hasSword: data.hud.hasSword ?? true,
        questStage: data.hud.questStage ?? "done",
        mods: data.hud.mods ?? [],
        inDelve: data.pos.scene === "delve",
      })
      setHp(PLAYER_MAX_HP)
      setNotifs([])
      setPaused(false)
      setShowInv(false)
      setScene("play")
    },
    [pushNotif],
  )

  const deleteSaveById = useCallback(
    (id: string): void => {
      deleteSave(id)
      const next = manifest.filter((s) => s.id !== id)
      persistManifest(next)
      setManifest(next)
    },
    [manifest],
  )

  useEffect(() => {
    const inp = inputRef.current
    const isEditable = (t: EventTarget | null): boolean => {
      const el = t as HTMLElement | null
      if (!el) return false
      const tag = el.tagName
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable
    }
    const down = (e: KeyboardEvent): void => {
      if (isEditable(e.target)) return
      const k = e.key.toLowerCase()
      if (["arrowleft", "a"].includes(k)) inp.left = true
      if (["arrowright", "d"].includes(k)) inp.right = true
      if (["arrowup", "w"].includes(k)) inp.up = true
      if (["arrowdown", "s"].includes(k)) inp.down = true
      if (["arrowup", "w", " ", "z"].includes(k)) {
        if (!inp.jump) inp.jumpEdge = true
        inp.jump = true
      }
      if (["shift", "x", "k"].includes(k)) {
        if (!inp.dash) inp.dashEdge = true
        inp.dash = true
      }
      if (k === "e" || k === "enter") {
        if (!inp.interact) inp.interactEdge = true
        inp.interact = true
      }
      if (k === "i" || k === "tab") {
        e.preventDefault()
        setShowInv((v) => !v)
      }
      if (k === "escape" || k === "p") setPaused((v) => !v)
      if (k === "m") setMuted((v) => !v)
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault()
    }
    const up = (e: KeyboardEvent): void => {
      if (isEditable(e.target)) return
      const k = e.key.toLowerCase()
      if (["arrowleft", "a"].includes(k)) inp.left = false
      if (["arrowright", "d"].includes(k)) inp.right = false
      if (["arrowup", "w"].includes(k)) inp.up = false
      if (["arrowdown", "s"].includes(k)) inp.down = false
      if (["arrowup", "w", " ", "z"].includes(k)) inp.jump = false
      if (["shift", "x", "k"].includes(k)) inp.dash = false
      if (k === "e" || k === "enter") inp.interact = false
    }
    window.addEventListener("keydown", down)
    window.addEventListener("keyup", up)
    return () => {
      window.removeEventListener("keydown", down)
      window.removeEventListener("keyup", up)
    }
  }, [])

  // Resize the canvas's pixel buffer to match its on-screen size × DPR so
  // rendering happens at native resolution (sharp on HiDPI / 4K). Aspect is
  // locked to VIEWPORT_WIDTH:VIEWPORT_HEIGHT to avoid distortion.
  useEffect(() => {
    if (scene !== "play") return
    const cv = canvasRef.current
    if (!cv) return
    const updateCanvas = (): void => {
      const aspect = VIEWPORT_WIDTH / VIEWPORT_HEIGHT
      const winW = window.innerWidth
      const winH = window.innerHeight
      const cssW = winW / winH > aspect ? winH * aspect : winW
      const cssH = winW / winH > aspect ? winH : winW / aspect
      cv.style.width = `${cssW}px`
      cv.style.height = `${cssH}px`
      const dpr = window.devicePixelRatio || 1
      cv.width = Math.round(cssW * dpr)
      cv.height = Math.round(cssH * dpr)
    }
    updateCanvas()
    window.addEventListener("resize", updateCanvas)
    return () => window.removeEventListener("resize", updateCanvas)
  }, [scene])

  useEffect(() => {
    if (scene !== "play") return
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext("2d")
    if (!ctx) return
    const callbacks: PhysicsCallbacks = {
      grantAch,
      grantXP,
      discover,
      addMaterials: (n: number) => setHud((h) => ({ ...h, materials: h.materials + n })),
      getMaterials: () => hudRef.current.materials,
      transitionToDelve,
      transitionToOver,
      hasSword: () => hudRef.current.hasSword,
      setHp,
      onDeath: () => pushNotif("You fell — respawning", "xp"),
      notify: pushNotif,
      openDialog: (id) => setDialogNpc(id),
      onDelveClear: () => {
        // Auto-advance the quest line so the dialog reflects "return to me"
        // on the next interaction. Safe to call repeatedly — we only bump
        // when the player is actually mid-quest.
        setHud((h) => (h.questStage === "active" ? { ...h, questStage: "cleared" } : h))
      },
      getMods: () => hudRef.current.mods,
    }
    // Physics is authored at 60 Hz (per-tick velocities, frame counters,
    // exponential frictions). To stay identical on 144 Hz / 240 Hz monitors we
    // run a fixed 60 Hz tick driven by a time accumulator, while rendering at
    // the display's native rate.
    const TICK_MS = 1000 / 60
    const MAX_CATCHUP_TICKS = 5
    let raf = 0
    let last = performance.now()
    let accumulator = 0
    const loop = (now: number): void => {
      const frame = Math.min(100, now - last)
      last = now
      const s = stateRef.current
      if (!s) {
        raf = requestAnimationFrame(loop)
        return
      }
      const frozen = pausedRef.current || dialogRef.current !== null
      if (!frozen) {
        accumulator += frame
        let ticks = 0
        while (accumulator >= TICK_MS && ticks < MAX_CATCHUP_TICKS) {
          stepGame(s, inputRef.current, charRef.current, callbacks, TICK_MS)
          accumulator -= TICK_MS
          ticks++
        }
        if (ticks === MAX_CATCHUP_TICKS) accumulator = 0
        const alpha = Math.min(1, accumulator / TICK_MS)
        draw(ctx, s, charRef.current, alpha)
      } else if (pausedRef.current) {
        drawPaused(ctx)
      } else {
        // Dialog open — keep the world drawn but don't tick physics.
        accumulator = 0
        draw(ctx, s, charRef.current, 1)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [scene, grantAch, grantXP, discover, transitionToDelve, transitionToOver, pushNotif])

  if (scene === "menu")
    return (
      <MainMenu
        manifest={manifest}
        muted={muted}
        // hasSaves gates this in MainMenu; the `!` documents the invariant.
        onContinue={() => loadGameById(manifest[0]!.id)}
        onNew={() => setScene("creator")}
        onLoad={() => setScene("loadmenu")}
        onAbout={() => setScene("about")}
        onToggleMute={() => setMuted((v) => !v)}
      />
    )
  if (scene === "about") return <About onBack={() => setScene("menu")} />
  if (scene === "loadmenu")
    return (
      <LoadMenu
        manifest={manifest}
        onLoad={loadGameById}
        onDelete={deleteSaveById}
        onBack={() => setScene("menu")}
      />
    )
  if (scene === "creator")
    return (
      <CharacterCreator
        character={character}
        setCharacter={setCharacter}
        onPlay={startGameFresh}
        onBack={() => setScene("menu")}
      />
    )

  const xpPct = (hud.xp / xpForLevel(hud.level)) * 100
  return (
    <div
      className="w-screen h-screen flex items-center justify-center overflow-hidden"
      style={{ background: "#0a0518" }}
    >
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={VIEWPORT_WIDTH}
          height={VIEWPORT_HEIGHT}
          className="block shadow-2xl"
        />
        <div className="absolute top-3 left-3 flex items-center gap-3 pointer-events-none">
          <div className="bg-black/40 backdrop-blur rounded-lg px-3 py-2 text-white text-sm">
            <div className="flex items-center gap-2">
              <div className="font-bold text-orange-200">{character.name}</div>
              <div className="text-xs text-stone-300">Lv {hud.level}</div>
            </div>
            <div className="w-40 h-2 bg-stone-700 rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-gradient-to-r from-orange-300 to-yellow-200"
                style={{ width: xpPct + "%" }}
              />
            </div>
            <div className="text-[10px] text-stone-400 mt-0.5">
              {hud.xp} / {xpForLevel(hud.level)} XP
            </div>
            <div className="flex gap-1 mt-1.5">
              {Array.from({ length: PLAYER_MAX_HP }).map((_, i) => (
                <div
                  key={i}
                  className={
                    "w-3.5 h-3.5 rounded-sm " +
                    (i < hp ? "bg-red-400 shadow-[0_0_4px_rgba(255,80,96,0.7)]" : "bg-stone-700")
                  }
                />
              ))}
            </div>
          </div>
          <div className="bg-black/40 backdrop-blur rounded-lg px-3 py-2 text-white text-sm">
            <div className="text-[10px] text-stone-400">Materials</div>
            <div className="font-bold text-yellow-200">{hud.materials}</div>
          </div>
          <div className="bg-black/40 backdrop-blur rounded-lg px-3 py-2 text-white text-sm">
            <div className="text-[10px] text-stone-400">Discovered</div>
            <div className="font-bold text-green-200">
              {hud.discovered.length} / {ZONES.length}
            </div>
          </div>
          {hud.inDelve && (
            <div className="bg-purple-900/60 backdrop-blur rounded-lg px-3 py-2 text-purple-100 text-xs font-semibold animate-pulse">
              DELVE
            </div>
          )}
        </div>
        <div className="absolute top-3 right-3 pointer-events-none">
          <div className="bg-black/40 backdrop-blur rounded-lg px-3 py-2 text-white text-xs">
            <div className="text-stone-400">Mode</div>
            <div className="font-semibold">{hud.inDelve ? "Delve" : "Drift"}</div>
          </div>
        </div>
        <div className="absolute bottom-3 left-3 pointer-events-none text-white/70 text-xs space-y-0.5 bg-black/30 backdrop-blur rounded-lg px-3 py-2">
          <div>
            <b>Move</b> A/D · <b>Jump</b> Space · <b>Dash</b> Shift (8-dir) · <b>Use</b> E
          </div>
          <div className="text-stone-400">Tab — inventory · Esc — pause · M — mute</div>
        </div>
        <div className="absolute top-20 right-3 flex flex-col gap-2 pointer-events-none">
          {notifs.map((n) => (
            <div
              key={n.id}
              className={
                "px-3 py-2 rounded-lg backdrop-blur text-sm font-medium " +
                (n.kind === "ach"
                  ? "bg-yellow-300/90 text-stone-900"
                  : n.kind === "level"
                    ? "bg-orange-400/90 text-stone-900"
                    : n.kind === "discovery"
                      ? "bg-emerald-400/90 text-stone-900"
                      : "bg-white/80 text-stone-900")
              }
            >
              {n.text}
            </div>
          ))}
        </div>
        {zoneBanner && performance.now() - zoneBanner.t < 3000 && (
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
            <div className="text-xs text-stone-300 tracking-widest">DISCOVERED</div>
            <div
              className="text-4xl font-bold text-white"
              style={{ textShadow: "0 2px 20px rgba(255,180,120,0.8)" }}
            >
              {zoneBanner.name}
            </div>
          </div>
        )}
        {paused && !showInv && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center rounded-lg">
            <div className="text-center space-y-4">
              <div className="text-4xl font-bold text-white">Paused</div>
              <div className="flex flex-col gap-2 items-center">
                <button
                  onClick={() => {
                    playSnd("click")
                    setPaused(false)
                  }}
                  className="bg-orange-300 text-stone-900 px-8 py-2 rounded-full font-semibold"
                >
                  Resume
                </button>
                <button
                  onClick={() => {
                    playSnd("click")
                    saveCurrent()
                  }}
                  className="bg-emerald-400 text-stone-900 px-8 py-2 rounded-full font-semibold"
                >
                  Save Game
                </button>
                <button
                  onClick={() => {
                    playSnd("click")
                    setShowInv(true)
                  }}
                  className="text-stone-300 hover:text-white text-sm"
                >
                  Inventory
                </button>
                <button
                  onClick={() => setMuted((v) => !v)}
                  className="text-stone-300 hover:text-white text-sm"
                >
                  {muted ? "🔇 Sound off" : "🔊 Sound on"}
                </button>
                <button
                  onClick={() => {
                    playSnd("click")
                    setPaused(false)
                    setScene("menu")
                  }}
                  className="text-stone-300 hover:text-white text-sm"
                >
                  Quit to menu
                </button>
              </div>
            </div>
          </div>
        )}
        {showInv && (
          <InventoryPanel hud={hud} character={character} onClose={() => setShowInv(false)} />
        )}
        {dialogNpc !== null && (
          <DialogPanel
            hud={hud}
            onClose={() => setDialogNpc(null)}
            onAcceptQuest={() => {
              setHud((h) => ({ ...h, hasSword: true, questStage: "active" }))
              pushNotif("Acquired: Worn Blade", "ach")
              playSnd("collect")
            }}
            onTurnInQuest={() => {
              setHud((h) => ({ ...h, questStage: "done", materials: h.materials + 5 }))
              grantXP(120, "quest")
              pushNotif("Quest complete — +5 materials", "level")
              playSnd("level_up")
            }}
            onCraft={(modId) => {
              setHud((h) => {
                const mod = MODS.find((m) => m.id === modId)
                if (!mod || h.mods.includes(mod.id) || h.materials < mod.cost) return h
                return { ...h, materials: h.materials - mod.cost, mods: [...h.mods, mod.id] }
              })
              pushNotif("Forged: " + (MODS.find((m) => m.id === modId)?.name ?? "?"), "ach")
              playSnd("big_collect")
            }}
          />
        )}
      </div>
    </div>
  )
}
