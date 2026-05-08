import { useState, useRef, useEffect, useCallback } from "react";
import { T, VW, VH, xpFor } from "./game/constants";
import { ZONES, ACHS, SKINS, HAIRS, SHIRTS, PANTS, ACCS } from "./game/data";
import { buildOverworld, buildDelve } from "./game/levels";
import { stepGame, makeInitialState } from "./game/physics";
import { draw, drawPaused } from "./game/render";
import { playSnd, setMuted as setMutedAudio } from "./game/audio";
import { fetchManifest, persistManifest, getSave, setSave, deleteSave } from "./game/save";
import { MainMenu, About, LoadMenu, CharacterCreator, InventoryPanel } from "./ui/screens";

export default function App() {
  const [scene, setScene] = useState("menu");
  const [showInv, setShowInv] = useState(false);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [character, setCharacter] = useState({
    name: "Wren",
    skin: SKINS[1],
    hair: HAIRS[1],
    hairStyle: "med",
    shirt: SHIRTS[0],
    pants: PANTS[0],
    accent: ACCS[0],
  });
  const [hud, setHud] = useState({
    level: 1,
    xp: 0,
    materials: 0,
    discovered: [],
    achievements: [],
    inDelve: false,
  });
  const [notifs, setNotifs] = useState([]);
  const [zoneBanner, setZoneBanner] = useState(null);
  const [manifest, setManifest] = useState([]);

  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const inputRef = useRef({
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
  });
  const charRef = useRef(character);
  charRef.current = character;
  const hudRef = useRef(hud);
  hudRef.current = hud;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    setMutedAudio(muted);
  }, [muted]);
  useEffect(() => {
    setManifest(fetchManifest());
  }, []);

  const pushNotif = useCallback((text, kind) => {
    const id = Math.random().toString(36).slice(2);
    setNotifs((n) => [...n, { id, text, kind, born: performance.now() }]);
    setTimeout(() => setNotifs((n) => n.filter((x) => x.id !== id)), 3500);
  }, []);

  const grantAch = useCallback(
    (id) => {
      if (hudRef.current.achievements.includes(id)) return;
      const a = ACHS.find((x) => x.id === id);
      setHud((h) => ({ ...h, achievements: [...h.achievements, id] }));
      pushNotif("Achievement — " + a.name, "ach");
      playSnd("achievement");
    },
    [pushNotif],
  );

  const grantXP = useCallback(
    (amt, label) => {
      setHud((h) => {
        let xp = h.xp + amt,
          lvl = h.level;
        const ups = [];
        while (xp >= xpFor(lvl)) {
          xp -= xpFor(lvl);
          lvl++;
          ups.push(lvl);
        }
        if (label) pushNotif("+" + amt + " XP · " + label, "xp");
        ups.forEach((u) => {
          pushNotif("Level " + u, "level");
          playSnd("level_up");
        });
        return { ...h, xp, level: lvl };
      });
    },
    [pushNotif],
  );

  const discover = useCallback(
    (zoneId) => {
      if (hudRef.current.discovered.includes(zoneId)) return;
      const z = ZONES.find((x) => x.id === zoneId);
      setHud((h) => ({ ...h, discovered: [...h.discovered, zoneId] }));
      setZoneBanner({ name: z.name, t: performance.now() });
      grantXP(z.xp, "discovery");
      playSnd("discover");
    },
    [grantXP],
  );

  const transitionToDelve = useCallback(() => {
    const s = stateRef.current;
    s.current = "delve";
    s.level = s.dl;
    s.p.x = s.dl.spawn.x;
    s.p.y = s.dl.spawn.y;
    s.p.vx = 0;
    s.p.vy = 0;
    s.p.dashFrames = 0;
    s.p.dashCool = 0;
    s.collected = new Set();
    setHud((h) => ({ ...h, inDelve: true }));
    grantAch("a7");
    pushNotif("Entered the Delve", "discovery");
    playSnd("portal");
  }, [grantAch, pushNotif]);

  const transitionToOver = useCallback(() => {
    const s = stateRef.current;
    s.current = "over";
    s.level = s.ow;
    s.p.x = 100 * T;
    s.p.y = (s.ow.ground[100] - 3) * T;
    s.p.vx = 0;
    s.p.vy = 0;
    s.p.dashFrames = 0;
    s.p.dashCool = 0;
    setHud((h) => ({ ...h, inDelve: false }));
    pushNotif("Returned to the surface", "discovery");
    playSnd("portal");
  }, [pushNotif]);

  const saveCurrent = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    const id = "s_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    const data = {
      character: charRef.current,
      hud: hudRef.current,
      pos: { x: s.p.x, y: s.p.y, scene: s.current },
      collected: Array.from(s.collected),
    };
    const meta = {
      id,
      name: charRef.current.name,
      level: hudRef.current.level,
      materials: hudRef.current.materials,
      discovered: hudRef.current.discovered.length,
      date: new Date().toISOString(),
      where: s.current === "delve" ? "In the Delve" : "Surface",
    };
    if (setSave(id, data)) {
      const next = [meta, ...manifest];
      persistManifest(next);
      setManifest(next);
      pushNotif("Saved", "discovery");
    } else pushNotif("Save failed", "xp");
  }, [manifest, pushNotif]);

  const startGameFresh = useCallback(() => {
    const ow = buildOverworld(),
      dl = buildDelve();
    stateRef.current = makeInitialState(ow, dl, ow.spawn.x, ow.spawn.y, "over", new Set());
    setHud({ level: 1, xp: 0, materials: 0, discovered: [], achievements: [], inDelve: false });
    setNotifs([]);
    setPaused(false);
    setShowInv(false);
    setScene("play");
  }, []);

  const loadGameById = useCallback(
    (id) => {
      const data = getSave(id);
      if (!data) {
        pushNotif("Load failed", "xp");
        return;
      }
      const ow = buildOverworld(),
        dl = buildDelve();
      stateRef.current = makeInitialState(
        ow,
        dl,
        data.pos.x,
        data.pos.y,
        data.pos.scene,
        new Set(data.collected || []),
      );
      setCharacter(data.character);
      setHud({ ...data.hud, inDelve: data.pos.scene === "delve" });
      setNotifs([]);
      setPaused(false);
      setShowInv(false);
      setScene("play");
    },
    [pushNotif],
  );

  const deleteSaveById = useCallback(
    (id) => {
      deleteSave(id);
      const next = manifest.filter((s) => s.id !== id);
      persistManifest(next);
      setManifest(next);
    },
    [manifest],
  );

  useEffect(() => {
    const inp = inputRef.current;
    const down = (e) => {
      const k = e.key.toLowerCase();
      if (["arrowleft", "a"].includes(k)) inp.left = true;
      if (["arrowright", "d"].includes(k)) inp.right = true;
      if (["arrowup", "w"].includes(k)) inp.up = true;
      if (["arrowdown", "s"].includes(k)) inp.down = true;
      if (["arrowup", "w", " ", "z"].includes(k)) {
        if (!inp.jump) inp.jumpEdge = true;
        inp.jump = true;
      }
      if (["shift", "x", "k"].includes(k)) {
        if (!inp.dash) inp.dashEdge = true;
        inp.dash = true;
      }
      if (k === "e" || k === "enter") {
        if (!inp.interact) inp.interactEdge = true;
        inp.interact = true;
      }
      if (k === "i" || k === "tab") {
        e.preventDefault();
        setShowInv((v) => !v);
      }
      if (k === "escape" || k === "p") setPaused((v) => !v);
      if (k === "m") setMuted((v) => !v);
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
    };
    const up = (e) => {
      const k = e.key.toLowerCase();
      if (["arrowleft", "a"].includes(k)) inp.left = false;
      if (["arrowright", "d"].includes(k)) inp.right = false;
      if (["arrowup", "w"].includes(k)) inp.up = false;
      if (["arrowdown", "s"].includes(k)) inp.down = false;
      if (["arrowup", "w", " ", "z"].includes(k)) inp.jump = false;
      if (["shift", "x", "k"].includes(k)) inp.dash = false;
      if (k === "e" || k === "enter") inp.interact = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    if (scene !== "play") return;
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const callbacks = {
      grantAch,
      grantXP,
      discover,
      addMaterials: (n) => setHud((h) => ({ ...h, materials: h.materials + n })),
      getMaterials: () => hudRef.current.materials,
      transitionToDelve,
      transitionToOver,
    };
    let raf,
      last = performance.now();
    const loop = (now) => {
      const dt = Math.min(33, now - last);
      last = now;
      if (!pausedRef.current) {
        stepGame(stateRef.current, inputRef.current, charRef.current, callbacks, dt);
        draw(ctx, stateRef.current, charRef.current);
      } else {
        drawPaused(ctx);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [scene, grantAch, grantXP, discover, transitionToDelve, transitionToOver]);

  if (scene === "menu")
    return (
      <MainMenu
        manifest={manifest}
        muted={muted}
        onContinue={() => loadGameById(manifest[0].id)}
        onNew={() => setScene("creator")}
        onLoad={() => setScene("loadmenu")}
        onAbout={() => setScene("about")}
        onToggleMute={() => setMuted((v) => !v)}
      />
    );
  if (scene === "about") return <About onBack={() => setScene("menu")} />;
  if (scene === "loadmenu")
    return (
      <LoadMenu
        manifest={manifest}
        onLoad={loadGameById}
        onDelete={deleteSaveById}
        onBack={() => setScene("menu")}
      />
    );
  if (scene === "creator")
    return (
      <CharacterCreator
        character={character}
        setCharacter={setCharacter}
        onPlay={startGameFresh}
        onBack={() => setScene("menu")}
      />
    );

  const xpPct = (hud.xp / xpFor(hud.level)) * 100;
  return (
    <div
      className="w-full min-h-screen flex items-center justify-center p-4"
      style={{ background: "#0a0518" }}
    >
      <div className="relative" style={{ width: VW, height: VH }}>
        <canvas ref={canvasRef} width={VW} height={VH} className="block rounded-lg shadow-2xl" />
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
              {hud.xp} / {xpFor(hud.level)} XP
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
                    playSnd("click");
                    setPaused(false);
                  }}
                  className="bg-orange-300 text-stone-900 px-8 py-2 rounded-full font-semibold"
                >
                  Resume
                </button>
                <button
                  onClick={() => {
                    playSnd("click");
                    saveCurrent();
                  }}
                  className="bg-emerald-400 text-stone-900 px-8 py-2 rounded-full font-semibold"
                >
                  Save Game
                </button>
                <button
                  onClick={() => {
                    playSnd("click");
                    setShowInv(true);
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
                    playSnd("click");
                    setPaused(false);
                    setScene("menu");
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
      </div>
    </div>
  );
}
