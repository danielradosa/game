import { useState, useRef, useEffect, useCallback } from "react"
import { TILE_SIZE, VIEWPORT_WIDTH, VIEWPORT_HEIGHT, xpForLevel } from "@/game/constants"
import {
  ZONES,
  ACHIEVEMENTS,
  SKINS,
  HAIRS,
  SHIRTS,
  PANTS,
  ACCENTS,
  MODS,
  PERKS,
  WEAPONS,
} from "@/game/data"
import type { AchievementId, PerkId, ZoneId } from "@/game/data"
import type { Cost, Materials } from "@/game/economy"
import { canAfford, clampedAddDelta, spend, formatMissing } from "@/game/economy"
import {
  CONSUMABLE_CAP,
  HEAL_COST,
  MERCHANT_HP_COST,
  MERCHANT_HP_MAX_BONUS,
  REBIRTH_COST,
  STORM_COST,
} from "@/game/shop"
import { generateDelve, generateOverworld } from "@/game/levels"
import { freshSeed } from "@/game/rng"
import { stepGame, makeInitialState, snapRenderPrev, spawnEnemiesFrom } from "@/game/physics"
import { PLAYER_MAX_HP } from "@/game/constants"
import { draw, drawPaused } from "@/game/render"
import { playSnd, setMuted as setMutedAudio, setVolume as setVolumeAudio } from "@/game/audio"
import { fetchManifest, persistManifest, getSave, setSave, deleteSave } from "@/game/save"
import { loadSettings, saveSettings, type Settings } from "@/game/settings"
import {
  MainMenu,
  About,
  LoadMenu,
  CharacterCreator,
  InventoryPanel,
  DialogPanel,
} from "@/ui/screens"
import { PerkPicker } from "@/ui/PerkPicker"
import { SettingsMenu, formatKey } from "@/ui/SettingsMenu"
import type {
  AppNotification,
  AppScene,
  Character,
  GameState,
  InputState,
  NotifKind,
  NpcId,
  PhysicsCallbacks,
  PortalState,
  ZoneBanner,
} from "@/game/types/physics"
import type { HudState, PortalStateSerialized, SaveManifest } from "@/game/types/save"

const EMPTY_PORTAL_MAP: ReadonlyMap<string, PortalState> = new Map()

export default function App() {
  const [scene, setScene] = useState<AppScene>("menu")
  const [showInv, setShowInv] = useState(false)
  const [paused, setPaused] = useState(false)
  // User settings — persisted to localStorage["aw:settings"]. settingsRef
  // mirrors `settings` so the keydown handler can read the current bindings
  // without re-subscribing every change. (Key rebinding lands in the next
  // commit; the handler still uses hardcoded keys for now.)
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const settingsRef = useRef<Settings>(settings)
  settingsRef.current = settings
  // muted is derived from settings.muted but kept as its own state so the
  // M-key toggle and SettingsMenu mute-checkbox both flow through the same
  // React update path. Initialized from saved settings.
  const [muted, setMuted] = useState<boolean>(settings.muted)
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
    materials: { basic: 0, essence: 0, crystal: 0 },
    discovered: [],
    achievements: [],
    inDelve: false,
    hasSword: false,
    questStage: "intro",
    mods: [],
    maxHpBonus: 0,
    weaponLevel: 0,
    consumables: { heal: 0, storm: 0 },
    rebirths: 0,
    perks: [],
    pendingPerkChoice: null,
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
    useHealEdge: false,
    useStormEdge: false,
  })
  const charRef = useRef<Character>(character)
  charRef.current = character
  const hudRef = useRef<HudState>(hud)
  hudRef.current = hud
  const pausedRef = useRef<boolean>(paused)
  pausedRef.current = paused
  const showInvRef = useRef<boolean>(false)
  showInvRef.current = showInv
  // Separate freeze gate for the perk picker. Mirrors hud.pendingPerkChoice so
  // the imperative loop can short-circuit a tick without going through React.
  // We don't piggyback on `paused` because the pause overlay UI would then
  // stack on top of the picker.
  const perkPendingRef = useRef<boolean>(false)
  perkPendingRef.current = hud.pendingPerkChoice !== null

  // Apply persisted audio settings once on boot so the WebAudio master volume
  // and mute flag match what the user saved last session. The mute checkbox in
  // SettingsMenu and the M-key toggle both update `muted` state below, which
  // re-syncs setMutedAudio.
  useEffect(() => {
    setVolumeAudio(settings.volume)
    setMutedAudio(settings.muted)
    // Run once at mount only — subsequent changes flow through the
    // settings-apply path or the muted-state effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    setMutedAudio(muted)
    // Mirror M-key toggle back into settings so it persists across reloads.
    if (settingsRef.current.muted !== muted) {
      const next = { ...settingsRef.current, muted }
      settingsRef.current = next
      setSettings(next)
      saveSettings(next)
    }
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
        // Perk milestones: queue a picker for the *next unfilled slot whose
        // threshold has been met*. Slots are gated purely by perks.length and
        // the current level — never by the pre-grant level — so a single XP
        // grant that crosses multiple milestones (e.g. 4 -> 11) still queues
        // the lowest unfilled slot (here, 5). After the user picks at 5,
        // perks.length increases and the next grant queues 10, etc. Once all
        // three slots are filled, no further pending choices fire because
        // perks.length < 3 becomes false.
        let pending: 5 | 10 | 15 | null = h.pendingPerkChoice
        if (pending === null) {
          if (h.perks.length < 1 && lvl >= 5) pending = 5
          else if (h.perks.length < 2 && lvl >= 10) pending = 10
          else if (h.perks.length < 3 && lvl >= 15) pending = 15
        }
        return { ...h, xp, level: lvl, pendingPerkChoice: pending }
      })
      // a9 — Climbing the Ladder fires the moment level reaches 5. We re-read
      // hudRef on the next microtask so the setHud above has committed.
      queueMicrotask(() => {
        if (hudRef.current.level >= 5) grantAch("a9")
      })
    },
    [pushNotif, grantAch],
  )

  const discover = useCallback(
    (zoneId: ZoneId): void => {
      if (hudRef.current.discovered.includes(zoneId)) return
      const z = ZONES.find((x) => x.id === zoneId)!
      setHud((h) => ({ ...h, discovered: [...h.discovered, zoneId] }))
      setZoneBanner({ name: z.name, t: performance.now() })
      grantXP(z.xp, "discovery")
      playSnd("discover")
      // Discovery achievement chain: 3 zones = Wayfarer, all = Cartographer.
      // hudRef updates synchronously via the inline mutation in render, but
      // we just called setHud — so check the projected length instead.
      const next = hudRef.current.discovered.length + 1
      if (next >= 3) grantAch("a4")
      if (next >= ZONES.length) grantAch("a5")
    },
    [grantXP, grantAch],
  )

  const transitionToDelve = useCallback(
    (portalId: string): void => {
      const s = stateRef.current
      if (!s) return

      // Sword gate — without one the player would be auto-killed inside.
      // Keep the quest as the discovery path: hint at the Elder explicitly.
      if (!hudRef.current.hasSword) {
        pushNotif("You need a blade — find the Elder", "xp")
        playSnd("land")
        return
      }

      // Look up the per-portal state, lazily creating a fresh entry the first
      // time this portal is visited.
      let portal = s.portals.get(portalId)
      if (!portal) {
        portal = {
          seed: freshSeed(),
          tier: 0,
          status: "fresh",
          defeatedEnemies: [],
          cleared: false,
          lostCache: null,
        }
        s.portals.set(portalId, portal)
      }
      if (portal.status === "destroyed") {
        pushNotif("The rift is sealed", "xp")
        return
      }

      // Regenerate this portal's delve from its identity, then restore its
      // per-portal progress (defeats / cleared flag) so re-entering picks up
      // where the player left off.
      s.dl = generateDelve(portal.seed, portal.tier)
      s.activePortalId = portalId
      s.defeatedEnemies = new Set<number>(portal.defeatedEnemies)
      s.delveCleared = portal.cleared

      s.current = "delve"
      s.level = s.dl
      s.p.x = s.dl.spawn.x
      s.p.y = s.dl.spawn.y
      s.p.vx = 0
      s.p.vy = 0
      s.p.dashFrames = 0
      s.p.dashCool = 0
      s.enemies = spawnEnemiesFrom(s.dl.enemySpawns, s.defeatedEnemies)
      s.projectiles = []
      s.p.hp = s.p.maxHp
      setHp(s.p.hp)
      snapRenderPrev(s)
      setHud((h) => ({ ...h, inDelve: true }))
      grantAch("a7")
      pushNotif("Entered the Delve", "discovery")
      playSnd("portal")
    },
    [grantAch, pushNotif],
  )

  const transitionToOver = useCallback((): void => {
    const s = stateRef.current
    if (!s) return

    // Snapshot the current delve session back into the active portal so
    // partial progress survives if the player leaves without clearing.
    const portalId = s.activePortalId
    const portal = portalId !== null ? (s.portals.get(portalId) ?? null) : null
    if (portal) {
      portal.defeatedEnemies = Array.from(s.defeatedEnemies)
      portal.cleared = s.delveCleared
    }

    s.current = "over"
    s.level = s.ow
    // Spawn next to the portal we exited so the player isn't teleported to a
    // far corner of the map. Falls back to the legacy spawn if no portalId.
    if (portalId !== null) {
      const [tx = 100, ty = 13] = portalId.split(",").map(Number)
      s.p.x = tx * TILE_SIZE
      s.p.y = (ty - 2) * TILE_SIZE
    } else {
      s.p.x = 100 * TILE_SIZE
      s.p.y = (s.ow.ground[100]! - 3) * TILE_SIZE
    }
    s.p.vx = 0
    s.p.vy = 0
    s.p.dashFrames = 0
    s.p.dashCool = 0
    s.enemies = []
    s.projectiles = []
    s.p.hp = s.p.maxHp
    setHp(s.p.hp)
    snapRenderPrev(s)
    setHud((h) => ({ ...h, inDelve: false }))

    // Coin flip on cleared exit — only fires for the portal that was active.
    if (s.delveCleared && portal && portalId !== null) {
      const sealForever = Math.random() < 0.5
      // Either branch ends this portal's current run, so wipe session state.
      s.defeatedEnemies = new Set<number>()
      s.delveCleared = false
      const prefix = `delve:${portalId}:`
      for (const k of Array.from(s.collected)) {
        if (k.startsWith(prefix)) s.collected.delete(k)
      }
      portal.defeatedEnemies = []
      portal.cleared = false

      if (sealForever) {
        if (portal.lostCache) {
          pushNotif("A sealed rift swallowed your cache", "xp")
          portal.lostCache = null
        }
        portal.status = "destroyed"
        const [tx, ty] = portalId.split(",").map(Number)
        if (tx !== undefined && ty !== undefined && s.ow.map[ty]?.[tx] === "p") {
          s.ow.map[ty]![tx] = "X"
        }
        pushNotif("The rift collapses behind you", "discovery")
      } else {
        portal.seed = freshSeed()
        portal.tier += 1
        pushNotif("The rift pulses with malice — it returns harder", "discovery")
      }
    } else {
      pushNotif("Returned to the surface", "discovery")
    }

    s.activePortalId = null
    playSnd("portal")
  }, [pushNotif])

  const handleRebirth = useCallback((): void => {
    const liveS = stateRef.current
    if (!liveS) return
    if (!canAfford(REBIRTH_COST, hudRef.current.materials)) {
      pushNotif(`Need ${formatMissing(REBIRTH_COST, hudRef.current.materials)} more`, "xp")
      playSnd("land")
      return
    }
    // window.confirm matches the existing dialog UX (no custom modal
    // shell — Phase D will revisit). Cancel exits cleanly without
    // any side effects.
    if (
      !window.confirm("Rebirth: reroll the world. Keep level, perks, weapon, mods, items. Proceed?")
    )
      return

    // a11 World Reborn — fires on the player's first rebirth. Read hudRef
    // pre-commit because it updates after setHud, not synchronously.
    const isFirstRebirth = hudRef.current.rebirths === 0

    // Spend cost and bump rebirth counter.
    setHud((h) => ({
      ...h,
      materials: spend(REBIRTH_COST, h.materials),
      rebirths: h.rebirths + 1,
    }))

    if (isFirstRebirth) grantAch("a11")

    // Reroll worldSeed and regenerate the overworld. Old portal
    // entries are wiped — every "p" tile in the new map gets a
    // fresh PortalState. Delve `collected` keys are namespaced by
    // portalId so they fall away naturally with the cleared Map;
    // we still need to drop "over:" keys since those reference the
    // old map's tile coords.
    const newSeed = freshSeed()
    liveS.worldSeed = newSeed
    liveS.ow = generateOverworld(newSeed)
    for (const key of Array.from(liveS.collected)) {
      if (key.startsWith("over:")) liveS.collected.delete(key)
    }
    liveS.portals.clear()
    for (let ty = 0; ty < liveS.ow.H; ty++) {
      for (let tx = 0; tx < liveS.ow.W; tx++) {
        if (liveS.ow.map[ty]?.[tx] === "p") {
          liveS.portals.set(`${tx},${ty}`, {
            seed: freshSeed(),
            tier: 0,
            status: "fresh",
            defeatedEnemies: [],
            cleared: false,
            lostCache: null,
          })
        }
      }
    }
    liveS.activePortalId = null
    // Teleport player to the new spawn and snap the render-prev so
    // the next frame doesn't lerp across the cut.
    liveS.p.x = liveS.ow.spawn.x
    liveS.p.y = liveS.ow.spawn.y
    liveS.p.vx = 0
    liveS.p.vy = 0
    liveS.p.dashFrames = 0
    liveS.p.dashCool = 0
    liveS.level = liveS.ow
    liveS.current = "over"
    liveS.enemies = []
    liveS.projectiles = []
    snapRenderPrev(liveS)

    pushNotif("World reborn", "ach")
    playSnd("level_up")
    setDialogNpc(null)
  }, [pushNotif, grantAch])

  // Map → Record so portals can JSON-serialize. Mirror of PortalState shape.
  const serializePortals = (
    portals: Map<string, PortalState>,
  ): Record<string, PortalStateSerialized> => {
    const out: Record<string, PortalStateSerialized> = {}
    for (const [pid, ps] of portals) {
      out[pid] = {
        seed: ps.seed,
        tier: ps.tier,
        status: ps.status,
        defeatedEnemies: ps.defeatedEnemies,
        cleared: ps.cleared,
        lostCache: ps.lostCache,
      }
    }
    return out
  }

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
      portals: serializePortals(s.portals),
      activePortalId: s.activePortalId,
      worldSeed: s.worldSeed,
    }
    const meta = {
      id,
      name: charRef.current.name,
      level: hudRef.current.level,
      // SaveMeta carries a flat number for the manifest preview. Sum the
      // rarities so the load row reflects total wealth at a glance.
      materials:
        hudRef.current.materials.basic +
        hudRef.current.materials.essence +
        hudRef.current.materials.crystal,
      discovered: hudRef.current.discovered.length,
      date: new Date().toISOString(),
      where: s.current === "delve" ? "In the Delve" : "Surface",
      rebirths: hudRef.current.rebirths,
      worldSeed: s.worldSeed ?? 0,
    }
    if (setSave(id, data)) {
      // Functional updater so we always merge against the latest manifest —
      // autosave fires every 20s and could land between renders, leaving any
      // closed-over `manifest` stale. Filter-by-id mirrors autosave so a
      // re-save into the same slot replaces (not duplicates) the prior entry.
      setManifest((m) => {
        const next = [meta, ...m.filter((e) => e.id !== id)]
        persistManifest(next)
        return next
      })
      pushNotif("Saved", "discovery")
    } else pushNotif("Save failed", "xp")
  }, [pushNotif])

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
      portals: serializePortals(s.portals),
      activePortalId: s.activePortalId,
      worldSeed: s.worldSeed,
    }
    const meta = {
      id,
      name: charRef.current.name + " — autosave",
      level: hudRef.current.level,
      materials:
        hudRef.current.materials.basic +
        hudRef.current.materials.essence +
        hudRef.current.materials.crystal,
      discovered: hudRef.current.discovered.length,
      date: new Date().toISOString(),
      where: s.current === "delve" ? "In the Delve" : "Surface",
      rebirths: hudRef.current.rebirths,
      worldSeed: s.worldSeed ?? 0,
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
      if (perkPendingRef.current) return
      autosave()
    }
    const handle = window.setInterval(tick, 20_000)
    return () => window.clearInterval(handle)
  }, [scene, autosave])

  const startGameFresh = useCallback((): void => {
    // Roll a fresh world seed for this save — controls overworld terrain,
    // portal positions, NPC placement. Persists in saves.
    const worldSeed = freshSeed()
    const ow = generateOverworld(worldSeed),
      dl = generateDelve(freshSeed(), 0)
    stateRef.current = makeInitialState(
      ow,
      dl,
      ow.spawn.x,
      ow.spawn.y,
      "over",
      new Set<string>(),
      new Set<number>(),
      false,
      new Map<string, PortalState>(),
      null,
      worldSeed,
    )
    setHud({
      level: 1,
      xp: 0,
      materials: { basic: 0, essence: 0, crystal: 0 },
      discovered: [],
      achievements: [],
      inDelve: false,
      hasSword: false,
      questStage: "intro",
      mods: [],
      maxHpBonus: 0,
      weaponLevel: 0,
      consumables: { heal: 0, storm: 0 },
      rebirths: 0,
      perks: [],
      pendingPerkChoice: null,
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
      // Reproduce the saved overworld from its seed. Old saves predate
      // procgen — fall back to a fresh seed (portal positions will differ
      // from what was saved, which orphans portal state, but the game stays
      // playable).
      const worldSeed = data.worldSeed ?? freshSeed()
      const ow = generateOverworld(worldSeed)

      // Rehydrate per-portal state machine. Map → JSON Record on save, back to
      // Map on load. Seeds/tiers/statuses round-trip exactly.
      const portals = new Map<string, PortalState>()
      if (data.portals) {
        for (const [pid, ps] of Object.entries(data.portals)) {
          portals.set(pid, {
            seed: ps.seed,
            tier: ps.tier,
            status: ps.status,
            defeatedEnemies: [...ps.defeatedEnemies],
            cleared: ps.cleared,
            // Forward-compat: pre-Phase-C-Task-3 saves don't have lostCache.
            lostCache: ps.lostCache ?? null,
          })
        }
      }
      // Migration: pre-multi-portal saves only had a single boolean flag. If
      // it was set, mark every portal in the (newly-rebuilt) overworld as
      // destroyed — the old game only had one portal, so this is a strict
      // superset of the previous behavior for migrated saves.
      if (data.portalDestroyed === true && portals.size === 0) {
        for (let y = 0; y < ow.H; y++) {
          for (let x = 0; x < ow.W; x++) {
            if (ow.map[y]![x] === "p") {
              portals.set(`${x},${y}`, {
                seed: 0,
                tier: 1,
                status: "destroyed",
                defeatedEnemies: [],
                cleared: false,
                lostCache: null,
              })
            }
          }
        }
      }
      // Replay every destroyed portal's "p" → "X" mutation against the freshly-
      // built overworld map (we don't serialize the map itself).
      for (const [pid, ps] of portals) {
        if (ps.status === "destroyed") {
          const [tx, ty] = pid.split(",").map(Number)
          if (tx !== undefined && ty !== undefined && ow.map[ty]?.[tx] === "p") {
            ow.map[ty]![tx] = "X"
          }
        }
      }

      // If the saved scene was a delve, regenerate THAT portal's layout from
      // its seed/tier so the player resumes inside the same world. Otherwise
      // build a placeholder delve that will be replaced on next portal entry.
      const activePortalId = data.activePortalId ?? null
      let dl: ReturnType<typeof generateDelve>
      const activePortal = activePortalId !== null ? portals.get(activePortalId) : undefined
      if (data.pos.scene === "delve" && activePortal) {
        dl = generateDelve(activePortal.seed, activePortal.tier)
      } else {
        dl = generateDelve(data.delveSeed ?? freshSeed(), data.delveTier ?? 0)
      }
      const inDelve = data.pos.scene === "delve"
      const startX = inDelve && !activePortal ? dl.spawn.x : data.pos.x
      const startY = inDelve && !activePortal ? dl.spawn.y : data.pos.y

      stateRef.current = makeInitialState(
        ow,
        dl,
        startX,
        startY,
        data.pos.scene,
        new Set<string>(data.collected || []),
        new Set<number>(data.defeatedEnemies || []),
        data.delveCleared ?? false,
        portals,
        activePortalId,
        worldSeed,
      )
      setCharacter(data.character)
      // Older saves predate the quest/mods/sword fields — default forward
      // (sword granted, quest pre-completed, no mods) so the run remains
      // playable without forcing a re-do.
      const maxHpBonus = data.hud.maxHpBonus ?? 0
      // Migrate materials: pre-Phase-C saves stored a flat number; new saves
      // store { basic, essence, crystal }. Old number → all goes to basic.
      const rawMats = (data.hud as { materials?: number | Materials }).materials
      const materials: Materials =
        typeof rawMats === "number"
          ? { basic: rawMats, essence: 0, crystal: 0 }
          : (rawMats ?? { basic: 0, essence: 0, crystal: 0 })
      setHud({
        ...data.hud,
        materials,
        hasSword: data.hud.hasSword ?? true,
        questStage: data.hud.questStage ?? "done",
        mods: data.hud.mods ?? [],
        maxHpBonus,
        weaponLevel: data.hud.weaponLevel ?? 0,
        consumables: data.hud.consumables ?? { heal: 0, storm: 0 },
        // Forward-compat: pre-Phase-C-Task-4 saves don't have rebirths.
        rebirths: data.hud.rebirths ?? 0,
        // Forward-compat: pre-Phase-C-Task-5 saves don't have perks.
        perks: data.hud.perks ?? [],
        pendingPerkChoice: data.hud.pendingPerkChoice ?? null,
        inDelve: data.pos.scene === "delve",
      })
      // Apply HP bonus to the live player so the loaded run starts with the
      // upgraded cap. setHp pushes the new value into React for the HUD.
      const loaded = stateRef.current
      if (loaded && maxHpBonus > 0) {
        loaded.p.maxHp = PLAYER_MAX_HP + maxHpBonus
        loaded.p.hp = loaded.p.maxHp
      }
      setHp(loaded ? loaded.p.hp : PLAYER_MAX_HP)
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
    // Compare an event key against a configured binding. Single-character
    // keys are case-folded so Shift+letter doesn't escape the binding (e.g.
    // a binding of "e" still matches when the user presses "E"). Multi-char
    // keys ("ArrowLeft", "Shift", " ") are compared verbatim — the literal
    // " " for Space stays a string of length 1 BUT lowercasing a space is a
    // no-op so it falls through correctly either way.
    const matches = (k: string, bound: string): boolean => {
      if (k.length === 1 && bound.length === 1) {
        return k.toLowerCase() === bound.toLowerCase()
      }
      return k === bound
    }
    const down = (e: KeyboardEvent): void => {
      if (isEditable(e.target)) return
      const k = e.key
      const b = settingsRef.current.keys
      // Rebindable game inputs — read from the live settings ref each press
      // so a Settings save takes effect immediately without rewiring.
      if (matches(k, b.moveLeft)) inp.left = true
      if (matches(k, b.moveRight)) inp.right = true
      if (matches(k, b.moveUp)) inp.up = true
      if (matches(k, b.moveDown)) inp.down = true
      if (matches(k, b.jump)) {
        if (!inp.jump) inp.jumpEdge = true
        inp.jump = true
      }
      if (matches(k, b.dash)) {
        if (!inp.dash) inp.dashEdge = true
        inp.dash = true
      }
      if (matches(k, b.interact)) {
        // Interact acts as a toggle when a dialog is open: pressing again
        // closes it instead of stacking another open via the next NPC
        // overlap.
        if (dialogRef.current !== null) {
          setDialogNpc(null)
          return
        }
        if (!inp.interact) inp.interactEdge = true
        inp.interact = true
      }
      // Consumable hotkeys — only fire if the user has at least one. The
      // physics layer rechecks via cb.useHeal/useStorm, but we gate here too
      // for snappy "no feedback when empty" behavior (no edge stamped).
      if (matches(k, b.heal) && hudRef.current.consumables.heal > 0) inp.useHealEdge = true
      if (matches(k, b.storm) && hudRef.current.consumables.storm > 0) inp.useStormEdge = true

      // System keys — NOT user-rebindable. These stay hardcoded since they
      // operate on overlays/scene flow, not the player. Compared lowercased
      // against the original key string so Shift+letter still hits.
      const lk = k.length === 1 ? k.toLowerCase() : k
      if (lk === "i" || k === "Tab") {
        e.preventDefault()
        setShowInv((v) => !v)
      }
      // Esc cascades through open overlays before exiting to menu.
      // Order: dialog → inventory → pause overlay → main menu.
      if (k === "Escape") {
        if (dialogRef.current !== null) {
          setDialogNpc(null)
        } else if (showInvRef.current) {
          setShowInv(false)
        } else if (pausedRef.current) {
          setPaused(false)
          setScene("menu")
        } else {
          setScene("menu")
        }
      }
      if (lk === "p") setPaused((v) => !v)
      if (lk === "m") setMuted((v) => !v)
      // Block default for arrow keys + space when they're the configured
      // movement / jump binding so the page doesn't scroll under the canvas.
      if (
        k === "ArrowUp" ||
        k === "ArrowDown" ||
        k === "ArrowLeft" ||
        k === "ArrowRight" ||
        k === " "
      ) {
        e.preventDefault()
      }
    }
    const up = (e: KeyboardEvent): void => {
      if (isEditable(e.target)) return
      const k = e.key
      const b = settingsRef.current.keys
      if (matches(k, b.moveLeft)) inp.left = false
      if (matches(k, b.moveRight)) inp.right = false
      if (matches(k, b.moveUp)) inp.up = false
      if (matches(k, b.moveDown)) inp.down = false
      if (matches(k, b.jump)) inp.jump = false
      if (matches(k, b.dash)) inp.dash = false
      if (matches(k, b.interact)) inp.interact = false
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
      addMaterials: (delta: Cost) =>
        setHud((h) => {
          const next = clampedAddDelta(h.materials, delta)
          // a12 Crystal Heart — first crystal earned. Defer the grant via
          // queueMicrotask: calling grantAch (which calls setHud) from inside
          // a setHud updater is illegal in React.
          if (h.materials.crystal === 0 && next.crystal > 0) {
            queueMicrotask(() => grantAch("a12"))
          }
          return { ...h, materials: next }
        }),
      getMaterials: () => hudRef.current.materials,
      transitionToDelve,
      transitionToOver,
      hasSword: () => hudRef.current.hasSword,
      getWeaponLevel: () => hudRef.current.weaponLevel,
      // Consumables: physics asks "may I use one?", App decrements + answers.
      // Returning false means inventory was empty so the use sound/effect
      // doesn't fire.
      getConsumables: () => hudRef.current.consumables,
      useHeal: () => {
        if (hudRef.current.consumables.heal <= 0) return false
        setHud((h) => ({
          ...h,
          consumables: { ...h.consumables, heal: h.consumables.heal - 1 },
        }))
        return true
      },
      useStorm: () => {
        if (hudRef.current.consumables.storm <= 0) return false
        setHud((h) => ({
          ...h,
          consumables: { ...h.consumables, storm: h.consumables.storm - 1 },
        }))
        return true
      },
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
      hasPerk: (id) => hudRef.current.perks.includes(id),
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
      const frozen = pausedRef.current || dialogRef.current !== null || perkPendingRef.current
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
      } else if (perkPendingRef.current) {
        // Perk picker is open — world stays visible but does not tick.
        accumulator = 0
        draw(ctx, s, charRef.current, 1)
      } else {
        // Dialog open — same draw behavior as the perk-picker arm, but kept
        // distinct so the intent is documented and not load-bearing on
        // branch order.
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
        onSettings={() => setScene("settings")}
        onToggleMute={() => setMuted((v) => !v)}
      />
    )
  if (scene === "about") return <About onBack={() => setScene("menu")} />
  if (scene === "settings")
    return (
      <SettingsMenu
        initial={settings}
        onApply={(next) => {
          // Commit: persist, mirror into ref, push audio-side changes, and
          // keep the local `muted` state in sync so the M-key toggle and
          // pause overlay stay aligned.
          setSettings(next)
          settingsRef.current = next
          saveSettings(next)
          setVolumeAudio(next.volume)
          setMutedAudio(next.muted)
          setMuted(next.muted)
        }}
        onBack={() => setScene("menu")}
      />
    )
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
              {Array.from({ length: PLAYER_MAX_HP + hud.maxHpBonus }).map((_, i) => (
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
            <div className="flex flex-col gap-0.5 text-xs">
              <div className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-stone-300" />
                <span className="font-bold text-stone-200">{hud.materials.basic}</span>
              </div>
              <div className="flex items-center gap-1">
                <span
                  className={
                    "inline-block w-2 h-2 rounded-full bg-pink-300 " +
                    (hud.materials.essence === 0 ? "opacity-30" : "")
                  }
                />
                <span
                  className={
                    "font-bold text-pink-200 " + (hud.materials.essence === 0 ? "opacity-50" : "")
                  }
                >
                  {hud.materials.essence}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <span
                  className={
                    "inline-block w-2 h-2 rounded-full bg-cyan-300 " +
                    (hud.materials.crystal === 0 ? "opacity-30" : "")
                  }
                />
                <span
                  className={
                    "font-bold text-cyan-200 " + (hud.materials.crystal === 0 ? "opacity-50" : "")
                  }
                >
                  {hud.materials.crystal}
                </span>
              </div>
            </div>
          </div>
          {/* Consumable hotkey chips — dimmed when empty so the player can
              see which keys do what at a glance. */}
          <div
            className={
              "bg-black/40 backdrop-blur rounded-lg px-3 py-2 text-white text-sm " +
              (hud.consumables.heal === 0 ? "opacity-40" : "")
            }
          >
            <div className="text-[10px] text-stone-400">[1] Heal</div>
            <div className="font-bold text-pink-200">×{hud.consumables.heal}</div>
          </div>
          <div
            className={
              "bg-black/40 backdrop-blur rounded-lg px-3 py-2 text-white text-sm " +
              (hud.consumables.storm === 0 ? "opacity-40" : "")
            }
          >
            <div className="text-[10px] text-stone-400">[2] Storm</div>
            <div className="font-bold text-cyan-200">×{hud.consumables.storm}</div>
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
            <div className="font-semibold">{hud.inDelve ? "Wild" : "Aether"}</div>
          </div>
        </div>
        <div className="absolute bottom-3 left-3 pointer-events-none text-white/70 text-xs space-y-0.5 bg-black/30 backdrop-blur rounded-lg px-3 py-2">
          <div>
            <b>Move</b> {formatKey(settings.keys.moveLeft)}/{formatKey(settings.keys.moveRight)} ·{" "}
            <b>Jump</b> {formatKey(settings.keys.jump)} · <b>Dash</b>{" "}
            {formatKey(settings.keys.dash)} (8-dir) · <b>Use</b>{" "}
            {formatKey(settings.keys.interact)}
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
                  onClick={() => {
                    playSnd("click")
                    setPaused(false)
                    setScene("settings")
                  }}
                  className="text-stone-300 hover:text-white text-sm"
                >
                  Settings
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
            npc={dialogNpc}
            hud={hud}
            onClose={() => setDialogNpc(null)}
            onAcceptQuest={() => {
              setHud((h) => ({ ...h, hasSword: true, questStage: "active" }))
              pushNotif("Acquired: Worn Blade", "ach")
              playSnd("collect")
            }}
            onTurnInQuest={() => {
              setHud((h) => ({
                ...h,
                questStage: "done",
                materials: { ...h.materials, basic: h.materials.basic + 5 },
              }))
              grantXP(120, "quest")
              pushNotif("Quest complete — +5 materials", "level")
              playSnd("level_up")
            }}
            onCraft={(modId) => {
              const mod = MODS.find((m) => m.id === modId)
              if (!mod) return
              // Pre-check guards: failure cases need to notify the player
              // (the prior code silently returned the same hud and still
              // toasted "Forged" — looked like a bug because the button
              // appeared to do nothing useful).
              if (hudRef.current.mods.includes(modId)) {
                pushNotif("Already forged", "xp")
                return
              }
              if (!canAfford(mod.cost, hudRef.current.materials)) {
                pushNotif(`Need ${formatMissing(mod.cost, hudRef.current.materials)} more`, "xp")
                playSnd("land")
                return
              }
              setHud((h) => ({
                ...h,
                materials: spend(mod.cost, h.materials),
                mods: [...h.mods, mod.id],
              }))
              pushNotif("Forged: " + mod.name, "ach")
              playSnd("big_collect")
            }}
            onBuyMaxHp={() => {
              if (hudRef.current.maxHpBonus >= MERCHANT_HP_MAX_BONUS) {
                pushNotif("Already at max", "xp")
                return
              }
              if (!canAfford(MERCHANT_HP_COST, hudRef.current.materials)) {
                pushNotif(
                  `Need ${formatMissing(MERCHANT_HP_COST, hudRef.current.materials)} more`,
                  "xp",
                )
                playSnd("land")
                return
              }
              setHud((h) => ({
                ...h,
                materials: spend(MERCHANT_HP_COST, h.materials),
                maxHpBonus: h.maxHpBonus + 1,
              }))
              // Apply to live player too so HP cap is immediate, not next-load.
              const liveS = stateRef.current
              if (liveS) {
                liveS.p.maxHp += 1
                liveS.p.hp = liveS.p.maxHp
                setHp(liveS.p.hp)
              }
              pushNotif("Max HP +1 — heart restored", "ach")
              playSnd("level_up")
            }}
            onUpgradeWeapon={() => {
              const next = WEAPONS[hudRef.current.weaponLevel + 1]
              if (!next) {
                pushNotif("Already at peak", "xp")
                return
              }
              if (!canAfford(next.cost, hudRef.current.materials)) {
                pushNotif(`Need ${formatMissing(next.cost, hudRef.current.materials)} more`, "xp")
                playSnd("land")
                return
              }
              setHud((h) => ({
                ...h,
                materials: spend(next.cost, h.materials),
                weaponLevel: h.weaponLevel + 1,
              }))
              pushNotif(`Upgraded: ${next.name} · ${next.damage} dmg`, "ach")
              playSnd("level_up")
            }}
            onBuyHeal={() => {
              if (hudRef.current.consumables.heal >= CONSUMABLE_CAP) {
                pushNotif("Pouch full", "xp")
                return
              }
              if (!canAfford(HEAL_COST, hudRef.current.materials)) {
                pushNotif(`Need ${formatMissing(HEAL_COST, hudRef.current.materials)} more`, "xp")
                playSnd("land")
                return
              }
              setHud((h) => ({
                ...h,
                materials: spend(HEAL_COST, h.materials),
                consumables: { ...h.consumables, heal: h.consumables.heal + 1 },
              }))
              pushNotif("Heal Potion +1", "ach")
              playSnd("collect")
            }}
            onBuyStorm={() => {
              if (hudRef.current.consumables.storm >= CONSUMABLE_CAP) {
                pushNotif("Pouch full", "xp")
                return
              }
              if (!canAfford(STORM_COST, hudRef.current.materials)) {
                pushNotif(`Need ${formatMissing(STORM_COST, hudRef.current.materials)} more`, "xp")
                playSnd("land")
                return
              }
              setHud((h) => ({
                ...h,
                materials: spend(STORM_COST, h.materials),
                consumables: { ...h.consumables, storm: h.consumables.storm + 1 },
              }))
              pushNotif("Storm Vial +1", "ach")
              playSnd("collect")
            }}
            portals={stateRef.current?.portals ?? EMPTY_PORTAL_MAP}
            onRebirth={handleRebirth}
          />
        )}
        {hud.pendingPerkChoice !== null && (
          <PerkPicker
            milestone={hud.pendingPerkChoice}
            alreadyPicked={hud.perks}
            onPick={(id: PerkId) => {
              const perk = PERKS.find((p) => p.id === id)
              // a13 Specialist — picking the third perk. Read pre-commit:
              // hud.perks here is the closure-captured length (0/1/2 before
              // this pick), and we trigger when this pick will make it 3.
              const isThirdPerk = hud.perks.length === 2
              setHud((h) => {
                const next: HudState = {
                  ...h,
                  perks: [...h.perks, id],
                  pendingPerkChoice: null,
                }
                if (id === "vigor") next.maxHpBonus = h.maxHpBonus + 1
                return next
              })
              if (isThirdPerk) grantAch("a13")
              // Vigor — one-shot +1 max HP. Persists via maxHpBonus (saved)
              // and bumps the live player so the new pip lights up immediately.
              if (id === "vigor") {
                const liveS = stateRef.current
                if (liveS) {
                  liveS.p.maxHp += 1
                  liveS.p.hp = Math.min(liveS.p.maxHp, liveS.p.hp + 1)
                  setHp(liveS.p.hp)
                }
              }
              pushNotif(`Perk acquired: ${perk?.name ?? id}`, "ach")
              playSnd("level_up")
            }}
          />
        )}
      </div>
    </div>
  )
}
