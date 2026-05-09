import { useState, type Dispatch, type SetStateAction } from "react"
import {
  ZONES,
  ACHIEVEMENTS,
  SKINS,
  HAIRS,
  SHIRTS,
  PANTS,
  ACCENTS,
  PROPOSED_MODS,
  MODS,
  WEAPONS,
} from "@/game/data"
import { xpForLevel } from "@/game/constants"
import { canAfford, formatCost } from "@/game/economy"
import {
  CONSUMABLE_CAP,
  HEAL_COST,
  MERCHANT_HP_COST,
  MERCHANT_HP_MAX_BONUS,
  REBIRTH_COST,
  STORM_COST,
} from "@/game/shop"
import { playSnd } from "@/game/audio"
import CharacterPreview from "@/ui/CharacterPreview"
import type { Character, NpcId, PortalState } from "@/game/types/physics"
import type { HudState, SaveManifest } from "@/game/types/save"

interface MainMenuProps {
  manifest: SaveManifest
  muted: boolean
  onContinue: () => void
  onNew: () => void
  onLoad: () => void
  onAbout: () => void
  onSettings: () => void
  onToggleMute: () => void
}

export function MainMenu({
  manifest,
  muted,
  onContinue,
  onNew,
  onLoad,
  onAbout,
  onSettings,
  onToggleMute,
}: MainMenuProps) {
  const hasSaves = manifest.length > 0
  return (
    <div
      className="w-full h-full min-h-screen flex items-center justify-center"
      style={{ background: "linear-gradient(180deg,#1a0e2a 0%,#3a2050 50%,#7a4080 100%)" }}
    >
      <div className="text-center px-8">
        <div
          className="text-7xl font-bold tracking-tight text-white mb-2"
          style={{ textShadow: "0 4px 20px rgba(255,180,120,0.5)" }}
        >
          Aether & Wild
        </div>
        <div className="text-white text-lg mb-12 italic">
          explore at your pace · grind at your will
        </div>
        <div className="flex flex-col gap-3 items-center">
          {hasSaves && (
            <button
              onClick={() => {
                playSnd("click")
                onContinue()
              }}
              className="bg-orange-300 hover:bg-orange-200 text-stone-900 font-semibold px-12 py-3 rounded-full text-lg transition"
            >
              Continue
            </button>
          )}
          <button
            onClick={() => {
              playSnd("click")
              onNew()
            }}
            className={
              (hasSaves
                ? "bg-stone-700 hover:bg-stone-600 text-stone-100"
                : "bg-orange-300 hover:bg-orange-200 text-stone-900") +
              " font-semibold px-12 py-3 rounded-full text-lg transition"
            }
          >
            New Journey
          </button>
          {hasSaves && (
            <button
              onClick={() => {
                playSnd("click")
                onLoad()
              }}
              className="text-purple-200 hover:text-white text-sm"
            >
              Load Game ({manifest.length})
            </button>
          )}
          <button
            onClick={() => {
              playSnd("click")
              onSettings()
            }}
            className="text-purple-200 hover:text-white text-sm"
          >
            Settings
          </button>
          <button
            onClick={() => {
              playSnd("click")
              onAbout()
            }}
            className="text-purple-200 hover:text-white text-sm"
          >
            About
          </button>
          <button onClick={onToggleMute} className="text-purple-200 hover:text-white text-xs">
            {muted ? "🔇 Sound off (M)" : "🔊 Sound on (M)"}
          </button>
        </div>
      </div>
    </div>
  )
}

interface AboutProps {
  onBack: () => void
}

export function About({ onBack }: AboutProps) {
  return (
    <div
      className="w-full min-h-screen flex items-center justify-center p-8"
      style={{ background: "#1a0e2a" }}
    >
      <div className="max-w-xl text-stone-200 space-y-4 text-sm leading-relaxed">
        <h2 className="text-2xl font-bold text-orange-200">Drift</h2>
        <p>
          A relaxing 2D platformer where exploration is its own reward. No timers, no quest
          pressure.
        </p>
        <div className="bg-stone-800/50 p-4 rounded space-y-2">
          <div>
            <span className="text-orange-300">A / D</span> — move
          </div>
          <div>
            <span className="text-orange-300">W / Space</span> — jump (double in air)
          </div>
          <div>
            <span className="text-orange-300">Shift / X</span> — dash (8-directional, hold WASD)
          </div>
          <div>
            <span className="text-orange-300">S</span> — drop through platform
          </div>
          <div>
            <span className="text-orange-300">E</span> — interact
          </div>
          <div>
            <span className="text-orange-300">Tab</span> · inventory ·{" "}
            <span className="text-orange-300">Esc</span> · pause ·{" "}
            <span className="text-orange-300">M</span> · mute
          </div>
        </div>
        <button
          onClick={() => {
            playSnd("click")
            onBack()
          }}
          className="text-orange-200 hover:text-white"
        >
          ← Back
        </button>
      </div>
    </div>
  )
}

interface LoadMenuProps {
  manifest: SaveManifest
  onLoad: (id: string) => void
  onDelete: (id: string) => void
  onBack: () => void
}

type SortKey = "date" | "level" | "rebirths"

export function LoadMenu({ manifest, onLoad, onDelete, onBack }: LoadMenuProps) {
  const [page, setPage] = useState(0)
  const [sortKey, setSortKey] = useState<SortKey>("date")
  const PER_PAGE = 5
  // Client-side sort on the manifest array. Always returns a new array so
  // we don't mutate the prop.
  const sorted = [...manifest].sort((a, b) => {
    if (sortKey === "level") return b.level - a.level
    if (sortKey === "rebirths") return (b.rebirths ?? 0) - (a.rebirths ?? 0)
    // Default: date descending (newest first).
    return Date.parse(b.date) - Date.parse(a.date)
  })
  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE))
  const items = sorted.slice(page * PER_PAGE, (page + 1) * PER_PAGE)
  const fmtDate = (iso: string): string => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    } catch {
      return iso
    }
  }
  // Last 6 hex chars of the world seed. Coerce to unsigned first so
  // mulberry32's negative outputs stringify cleanly.
  const fmtSeed = (seed: number | undefined): string =>
    ((seed ?? 0) >>> 0)
      .toString(16)
      .padStart(6, "0")
      .slice(-6)
  return (
    <div
      className="w-full min-h-screen flex items-center justify-center p-6"
      style={{ background: "linear-gradient(180deg,#1a0e2a,#3a2050)" }}
    >
      <div className="bg-stone-900/70 backdrop-blur rounded-2xl p-8 max-w-2xl w-full shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-orange-200">Load Game</h2>
          <button
            onClick={() => {
              playSnd("click")
              onBack()
            }}
            className="text-stone-400 hover:text-white text-sm"
          >
            ← Back
          </button>
        </div>
        {manifest.length === 0 && (
          <div className="text-stone-400 text-center py-12">No saves yet.</div>
        )}
        {manifest.length > 0 && (
          <div className="flex items-center justify-end gap-2 mb-3 text-xs">
            <label htmlFor="load-sort" className="text-stone-400 uppercase tracking-wider">
              Sort
            </label>
            <select
              id="load-sort"
              value={sortKey}
              onChange={(e) => {
                setSortKey(e.target.value as SortKey)
                setPage(0)
              }}
              className="bg-stone-800 text-stone-200 border border-stone-700 rounded px-2 py-1 outline-none focus:ring-1 ring-orange-300"
            >
              <option value="date">Date (newest)</option>
              <option value="level">Level (high→low)</option>
              <option value="rebirths">Rebirths (high→low)</option>
            </select>
          </div>
        )}
        <div className="space-y-2">
          {items.map((s) => (
            <div
              key={s.id}
              className="bg-stone-800/60 rounded-lg p-4 flex items-center justify-between"
            >
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white flex items-center gap-2">
                  <span>
                    {s.name} <span className="text-stone-400 font-normal">· Lv {s.level}</span>
                  </span>
                  {/* Rebirth badge — fallback to 0 for pre-Phase-C-Task-4
                      manifests that didn't track the field. */}
                  {(s.rebirths ?? 0) > 0 && (
                    <span
                      className="px-1.5 py-0.5 rounded bg-violet-900/40 text-violet-200 text-[10px] font-medium"
                      title="World rebirths"
                    >
                      ♻ ×{s.rebirths}
                    </span>
                  )}
                </div>
                <div className="text-xs text-stone-400">
                  {s.where} · {s.discovered}/{ZONES.length} zones · {s.materials} materials
                </div>
                <div className="text-xs text-stone-500 mt-0.5 flex items-center gap-2">
                  <span>{fmtDate(s.date)}</span>
                  <span className="font-mono text-stone-600">seed: {fmtSeed(s.worldSeed)}</span>
                </div>
              </div>
              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => {
                    playSnd("click")
                    onLoad(s.id)
                  }}
                  className="bg-orange-300 text-stone-900 px-4 py-1.5 rounded-md text-xs font-semibold"
                >
                  Load
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Delete save "${s.name}"? This cannot be undone.`)) {
                      playSnd("click")
                      onDelete(s.id)
                    }
                  }}
                  className="text-stone-400 hover:text-red-300 text-xs"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="flex justify-between items-center mt-4 text-stone-300 text-sm">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="px-3 py-1 rounded bg-stone-800 disabled:opacity-30 hover:bg-stone-700"
            >
              ← Prev
            </button>
            <div className="text-stone-400">
              Page {page + 1} of {totalPages}
            </div>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 rounded bg-stone-800 disabled:opacity-30 hover:bg-stone-700"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

interface SwatchesProps {
  label: string
  value: string
  options: readonly string[]
  onChange: (value: string) => void
}

function Swatches({ label, value, options, onChange }: SwatchesProps) {
  return (
    <div>
      <label className="text-stone-300 text-xs uppercase tracking-wider">{label}</label>
      <div className="flex gap-2 mt-1 flex-wrap">
        {options.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            className={
              "w-8 h-8 rounded-lg ring-2 transition " +
              (value === c ? "ring-orange-300 scale-110" : "ring-transparent")
            }
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  )
}

const HAIR_STYLES = ["short", "med", "long"] as const

interface CharacterCreatorProps {
  character: Character
  setCharacter: Dispatch<SetStateAction<Character>>
  onPlay: () => void
  onBack: () => void
}

export function CharacterCreator({
  character,
  setCharacter,
  onPlay,
  onBack,
}: CharacterCreatorProps) {
  // Generic indexed setter: K is the key, value must match Character[K].
  // Catches `upd("hairStyle", "tall")` or `upd("name", 42)` at build time.
  const upd = <K extends keyof Character>(key: K, value: Character[K]): void =>
    setCharacter((c) => ({ ...c, [key]: value }))
  return (
    <div
      className="w-full min-h-screen flex items-center justify-center p-6"
      style={{ background: "linear-gradient(180deg,#1a0e2a,#3a2050)" }}
    >
      <div className="bg-stone-900/60 backdrop-blur rounded-2xl p-8 max-w-3xl w-full shadow-2xl">
        <div className="text-2xl font-bold text-orange-200 mb-1">Customize</div>
        <div className="text-stone-400 text-sm mb-6">Cosmetics only — never tied to stats.</div>
        <div className="grid md:grid-cols-2 gap-8">
          <div className="flex items-center justify-center">
            <div
              className="w-64 h-80 rounded-xl flex items-center justify-center"
              style={{ background: "radial-gradient(circle at 50% 30%, #5a3a8a, #1a0a2a)" }}
            >
              <CharacterPreview ch={character} />
            </div>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-stone-300 text-xs uppercase tracking-wider">Name</label>
              <input
                value={character.name}
                onChange={(e) => upd("name", e.target.value.slice(0, 16))}
                className="w-full mt-1 bg-stone-800 text-white px-3 py-2 rounded-lg outline-none focus:ring-2 ring-orange-300"
              />
            </div>
            <Swatches
              label="Skin"
              value={character.skin}
              options={SKINS}
              onChange={(v) => upd("skin", v)}
            />
            <Swatches
              label="Hair color"
              value={character.hair}
              options={HAIRS}
              onChange={(v) => upd("hair", v)}
            />
            <div>
              <label className="text-stone-300 text-xs uppercase tracking-wider">Hair style</label>
              <div className="flex gap-2 mt-1">
                {HAIR_STYLES.map((s) => (
                  <button
                    key={s}
                    onClick={() => upd("hairStyle", s)}
                    className={
                      "px-3 py-1.5 rounded-lg text-sm capitalize " +
                      (character.hairStyle === s
                        ? "bg-orange-300 text-stone-900"
                        : "bg-stone-700 text-stone-200")
                    }
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <Swatches
              label="Shirt"
              value={character.shirt}
              options={SHIRTS}
              onChange={(v) => upd("shirt", v)}
            />
            <Swatches
              label="Pants"
              value={character.pants}
              options={PANTS}
              onChange={(v) => upd("pants", v)}
            />
            <Swatches
              label="Accent"
              value={character.accent}
              options={ACCENTS}
              onChange={(v) => upd("accent", v)}
            />
          </div>
        </div>
        <div className="flex justify-between mt-8">
          <button
            onClick={() => {
              playSnd("click")
              onBack()
            }}
            className="text-stone-400 hover:text-white text-sm"
          >
            ← Back
          </button>
          <button
            onClick={() => {
              playSnd("click")
              onPlay()
            }}
            className="bg-orange-300 hover:bg-orange-200 text-stone-900 font-semibold px-10 py-2.5 rounded-full"
          >
            Enter the world →
          </button>
        </div>
      </div>
    </div>
  )
}

interface InventoryPanelProps {
  hud: HudState
  character: Character
  onClose: () => void
}

export function InventoryPanel({ hud, character, onClose }: InventoryPanelProps) {
  const xpPct = (hud.xp / xpForLevel(hud.level)) * 100
  const unlocked = ACHIEVEMENTS.filter((a) => hud.achievements.includes(a.id))
  const locked = ACHIEVEMENTS.filter((a) => !hud.achievements.includes(a.id))
  return (
    <div className="absolute inset-0 bg-black/75 backdrop-blur-sm rounded-lg flex items-center justify-center p-4 overflow-auto">
      <div className="bg-stone-900 rounded-xl p-6 max-w-2xl w-full max-h-full overflow-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-orange-200">{character.name}</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-white">
            ✕
          </button>
        </div>
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="bg-stone-800/60 rounded-lg p-4">
            <div className="text-stone-400 text-xs uppercase tracking-wider">Level</div>
            <div className="text-3xl font-bold text-white">
              {hud.level} <span className="text-sm text-stone-500">/ 99</span>
            </div>
            <div className="w-full h-2 bg-stone-700 rounded-full overflow-hidden mt-2">
              <div
                className="h-full bg-gradient-to-r from-orange-300 to-yellow-200"
                style={{ width: xpPct + "%" }}
              />
            </div>
            <div className="text-xs text-stone-500 mt-1">
              {hud.xp} / {xpForLevel(hud.level)} XP to next level
            </div>
          </div>
          <div className="bg-stone-800/60 rounded-lg p-4">
            <div className="text-stone-400 text-xs uppercase tracking-wider">Inventory</div>
            <div className="text-sm text-stone-200 mt-2 space-y-1">
              <div className="flex justify-between">
                <span>Materials</span>
                <span className="font-semibold text-yellow-200">
                  {hud.materials.basic}
                  <span className="text-pink-200"> · {hud.materials.essence}</span>
                  <span className="text-cyan-200"> · {hud.materials.crystal}</span>
                </span>
              </div>
              <div className="flex justify-between">
                <span>Areas Discovered</span>
                <span className="font-semibold text-emerald-200">
                  {hud.discovered.length} / {ZONES.length}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Achievements</span>
                <span className="font-semibold text-orange-200">
                  {unlocked.length} / {ACHIEVEMENTS.length}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="mb-6">
          <h3 className="text-stone-300 font-semibold mb-2">
            Mods <span className="text-xs text-stone-500 font-normal">(unlocked at Lv 99)</span>
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 opacity-60">
            {PROPOSED_MODS.map((m) => (
              <div
                key={m.n}
                className="bg-stone-800/40 border border-stone-700 rounded p-2 text-xs"
              >
                <div className="text-stone-300 font-semibold">🔒 {m.n}</div>
                <div className="text-stone-500">{m.d}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-stone-300 font-semibold mb-2">Achievements</h3>
          <div className="grid sm:grid-cols-2 gap-2">
            {[...unlocked, ...locked].map((a) => {
              const u = hud.achievements.includes(a.id)
              return (
                <div
                  key={a.id}
                  className={
                    "p-2 rounded border " +
                    (u
                      ? "bg-yellow-300/10 border-yellow-300/40"
                      : "bg-stone-800/40 border-stone-700")
                  }
                >
                  <div
                    className={
                      "text-sm font-semibold " + (u ? "text-yellow-200" : "text-stone-500")
                    }
                  >
                    {u ? "★" : "☆"} {a.name}
                  </div>
                  <div className="text-xs text-stone-400">{a.desc}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

interface DialogPanelProps {
  npc: NpcId
  hud: HudState
  onClose: () => void
  onAcceptQuest: () => void
  onTurnInQuest: () => void
  onCraft: (modId: string) => void
  onBuyMaxHp: () => void
  onUpgradeWeapon: () => void
  onBuyHeal: () => void
  onBuyStorm: () => void
  // Portal state from the live GameState. Read-only — used to check whether
  // every portal is destroyed (gate the Rebirth option).
  portals: ReadonlyMap<string, PortalState>
  onRebirth: () => void
}

export function DialogPanel({
  npc,
  hud,
  onClose,
  onAcceptQuest,
  onTurnInQuest,
  onCraft,
  onBuyMaxHp,
  onUpgradeWeapon,
  onBuyHeal,
  onBuyStorm,
  portals,
  onRebirth,
}: DialogPanelProps) {
  if (npc === "merchant") {
    const atCap = hud.maxHpBonus >= MERCHANT_HP_MAX_BONUS
    const affordable = canAfford(MERCHANT_HP_COST, hud.materials)
    const text = atCap
      ? "You are full of vigor, friend. Nothing more I can offer."
      : "Steel for the soul, traveler. Five basic buys you another beat of the heart."
    return (
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
        <div className="bg-stone-900/95 border border-emerald-900 rounded-xl p-6 max-w-2xl w-full shadow-2xl">
          <div className="flex justify-between items-start mb-3">
            <div className="text-emerald-200 font-bold text-lg">The Merchant</div>
            <button onClick={onClose} className="text-stone-400 hover:text-white">
              ✕
            </button>
          </div>
          <p className="text-stone-200 leading-relaxed mb-5">{text}</p>
          <div className="mb-5 space-y-3">
            <div className="text-xs text-stone-400 uppercase tracking-wider">
              Stall — {hud.materials.basic}b · {hud.materials.essence}e · {hud.materials.crystal}c
            </div>
            {!atCap && (
              <button
                disabled={!affordable}
                onClick={onBuyMaxHp}
                className={
                  "w-full text-left p-3 rounded-lg border transition " +
                  (affordable
                    ? "bg-stone-800 border-stone-700 hover:border-emerald-300/60 hover:bg-stone-800/80"
                    : "bg-stone-900 border-stone-800 opacity-50 cursor-not-allowed")
                }
              >
                <div className="font-semibold text-sm text-stone-100">+1 Max HP</div>
                <div className="text-xs text-stone-400 mt-0.5">
                  Permanent. Currently +{hud.maxHpBonus}/{MERCHANT_HP_MAX_BONUS}.
                </div>
                <div className="text-[10px] text-stone-500 mt-1">
                  Cost: {formatCost(MERCHANT_HP_COST)}
                </div>
              </button>
            )}
            {/* Consumables — capped at CONSUMABLE_CAP each so the player can't
                stockpile to invincibility. Counters live in hud.consumables. */}
            {(() => {
              const healAffordable = canAfford(HEAL_COST, hud.materials)
              const healFull = hud.consumables.heal >= CONSUMABLE_CAP
              return (
                <button
                  disabled={!healAffordable || healFull}
                  onClick={onBuyHeal}
                  className={
                    "w-full text-left p-3 rounded-lg border transition " +
                    (healAffordable && !healFull
                      ? "bg-stone-800 border-stone-700 hover:border-emerald-300/60 hover:bg-stone-800/80"
                      : "bg-stone-900 border-stone-800 opacity-50 cursor-not-allowed")
                  }
                >
                  <div className="font-semibold text-sm text-stone-100">
                    Heal Potion · ({hud.consumables.heal}/{CONSUMABLE_CAP})
                  </div>
                  <div className="text-xs text-stone-400 mt-0.5">
                    Press [1] mid-fight · restores 2 hearts
                  </div>
                  <div className="text-[10px] text-stone-500 mt-1">
                    {healFull ? "Pouch is full" : `Cost: ${formatCost(HEAL_COST)}`}
                  </div>
                </button>
              )
            })()}
            {(() => {
              const stormAffordable = canAfford(STORM_COST, hud.materials)
              const stormFull = hud.consumables.storm >= CONSUMABLE_CAP
              return (
                <button
                  disabled={!stormAffordable || stormFull}
                  onClick={onBuyStorm}
                  className={
                    "w-full text-left p-3 rounded-lg border transition " +
                    (stormAffordable && !stormFull
                      ? "bg-stone-800 border-stone-700 hover:border-emerald-300/60 hover:bg-stone-800/80"
                      : "bg-stone-900 border-stone-800 opacity-50 cursor-not-allowed")
                  }
                >
                  <div className="font-semibold text-sm text-stone-100">
                    Storm Vial · ({hud.consumables.storm}/{CONSUMABLE_CAP})
                  </div>
                  <div className="text-xs text-stone-400 mt-0.5">
                    Press [2] · electric burst, damages every enemy nearby
                  </div>
                  <div className="text-[10px] text-stone-500 mt-1">
                    {stormFull ? "Pouch is full" : `Cost: ${formatCost(STORM_COST)}`}
                  </div>
                </button>
              )
            })()}
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="bg-stone-700 text-stone-200 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-stone-600"
            >
              Leave
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Elder dialog. Dialog text derived from hud.questStage so we never desync from save state.
  const stage = hud.questStage
  const text =
    stage === "intro"
      ? "Wanderer. The delve below grows hungry, and its guardians wake. Take this blade — and quiet them."
      : stage === "active"
        ? "The portal will not yield until the last guardian falls. Steady your hand."
        : stage === "cleared"
          ? "You have done it. The hush has returned. Bring me what you found below."
          : "What needs forging?"
  const canCraft = stage === "done"

  return (
    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-stone-900/95 border border-stone-700 rounded-xl p-6 max-w-2xl w-full shadow-2xl">
        <div className="flex justify-between items-start mb-3">
          <div className="text-orange-200 font-bold text-lg">The Elder</div>
          <button onClick={onClose} className="text-stone-400 hover:text-white">
            ✕
          </button>
        </div>
        <p className="text-stone-200 leading-relaxed mb-5">{text}</p>

        {canCraft && (
          <div className="mb-5 space-y-4">
            <div className="text-xs text-stone-400 uppercase tracking-wider">
              Forge — {hud.materials.basic}b · {hud.materials.essence}e · {hud.materials.crystal}c
            </div>

            {/* Weapon upgrade — single button advancing the next tier. */}
            {(() => {
              const next = WEAPONS[hud.weaponLevel + 1]
              const current = WEAPONS[hud.weaponLevel] ?? WEAPONS[0]!
              if (!next) {
                return (
                  <div className="bg-stone-800/60 rounded-lg p-3 border border-stone-700">
                    <div className="text-xs text-stone-400 uppercase tracking-wider mb-1">
                      Weapon
                    </div>
                    <div className="text-sm text-yellow-200 font-semibold">★ {current.name}</div>
                    <div className="text-xs text-stone-400 mt-0.5">
                      Honed to its limit · {current.damage} damage
                    </div>
                  </div>
                )
              }
              const affordable = canAfford(next.cost, hud.materials)
              return (
                <div className="bg-stone-800/60 rounded-lg p-3 border border-stone-700">
                  <div className="text-xs text-stone-400 uppercase tracking-wider mb-1">
                    Weapon · {current.name} ({current.damage} dmg)
                  </div>
                  <button
                    disabled={!affordable}
                    onClick={onUpgradeWeapon}
                    className={
                      "w-full text-left p-3 rounded-lg border transition mt-1 " +
                      (affordable
                        ? "bg-stone-900 border-stone-700 hover:border-orange-300/60"
                        : "bg-stone-900 border-stone-800 opacity-50 cursor-not-allowed")
                    }
                  >
                    <div className="font-semibold text-sm text-stone-100">
                      Upgrade → {next.name}
                    </div>
                    <div className="text-xs text-stone-400 mt-0.5">
                      {next.desc} · {next.damage} damage
                    </div>
                    <div className="text-[10px] text-stone-500 mt-1">
                      Cost: {formatCost(next.cost)}
                    </div>
                  </button>
                </div>
              )
            })()}

            {/* Rebirth — visible only when every known portal in this world
                has been sealed. Reroll worldSeed, keep all progression. The
                window.confirm() handshake lives in App.tsx onRebirth. */}
            {(() => {
              if (portals.size === 0) return null
              const allDestroyed = Array.from(portals.values()).every(
                (p) => p.status === "destroyed",
              )
              if (!allDestroyed) return null
              const affordable = canAfford(REBIRTH_COST, hud.materials)
              return (
                <div className="bg-violet-900/20 rounded-lg p-3 border border-violet-700/40">
                  <div className="text-xs text-violet-300 uppercase tracking-wider mb-1">
                    Rebirth · ×{hud.rebirths}
                  </div>
                  <button
                    disabled={!affordable}
                    onClick={onRebirth}
                    className={
                      "w-full text-left p-3 rounded-lg border transition mt-1 " +
                      (affordable
                        ? "bg-stone-900 border-violet-700 hover:border-violet-300/60"
                        : "bg-stone-900 border-stone-800 opacity-50 cursor-not-allowed")
                    }
                  >
                    <div className="font-semibold text-sm text-violet-200">Reroll the world</div>
                    <div className="text-xs text-stone-400 mt-0.5">
                      The rifts have all sealed. Bend the seed; keep your power.
                    </div>
                    <div className="text-[10px] text-stone-500 mt-1">
                      Cost: {formatCost(REBIRTH_COST)}
                    </div>
                  </button>
                </div>
              )
            })()}

            {/* Mods grid, grouped by kind so weapon mods don't drown utility ones. */}
            {(["weapon", "utility"] as const).map((kind) => {
              const list = MODS.filter((m) => m.kind === kind)
              if (list.length === 0) return null
              return (
                <div key={kind}>
                  <div className="text-[11px] text-stone-500 uppercase tracking-wider mb-2">
                    {kind === "weapon" ? "Weapon Mods" : "Utility Mods"}
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {list.map((m) => {
                      const owned = hud.mods.includes(m.id)
                      const affordable = canAfford(m.cost, hud.materials)
                      return (
                        <button
                          key={m.id}
                          disabled={owned || !affordable}
                          onClick={() => onCraft(m.id)}
                          className={
                            "text-left p-3 rounded-lg border transition " +
                            (owned
                              ? "bg-yellow-300/10 border-yellow-300/40 cursor-default"
                              : affordable
                                ? "bg-stone-800 border-stone-700 hover:border-orange-300/60 hover:bg-stone-800/80"
                                : "bg-stone-900 border-stone-800 opacity-50 cursor-not-allowed")
                          }
                        >
                          <div
                            className={
                              "font-semibold text-sm " +
                              (owned ? "text-yellow-200" : "text-stone-100")
                            }
                          >
                            {owned ? "★ " : ""}
                            {m.name}
                          </div>
                          <div className="text-xs text-stone-400 mt-0.5">{m.desc}</div>
                          <div className="text-[10px] text-stone-500 mt-1">
                            {owned ? "Equipped" : `Cost: ${formatCost(m.cost)}`}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          {stage === "intro" && (
            <button
              onClick={onAcceptQuest}
              className="bg-orange-300 text-stone-900 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-orange-200"
            >
              Take the blade
            </button>
          )}
          {stage === "cleared" && (
            <button
              onClick={onTurnInQuest}
              className="bg-orange-300 text-stone-900 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-orange-200"
            >
              Return offerings
            </button>
          )}
          <button
            onClick={onClose}
            className="bg-stone-700 text-stone-200 font-semibold px-4 py-2 rounded-lg text-sm hover:bg-stone-600"
          >
            {stage === "intro" ? "Not yet" : "Leave"}
          </button>
        </div>
      </div>
    </div>
  )
}
