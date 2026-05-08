// Replace any procedural sound with a real file:
// SOUNDS.jump = new Audio('/sfx/jump.mp3');
export const SOUNDS = {
  jump: null,
  doublejump: null,
  dash: null,
  land: null,
  collect: null,
  big_collect: null,
  level_up: null,
  discover: null,
  achievement: null,
  portal: null,
  click: null,
};
export const SOUND_VOLUME = {
  jump: 0.35,
  doublejump: 0.35,
  dash: 0.35,
  land: 0.4,
  collect: 0.4,
  big_collect: 0.5,
  level_up: 0.5,
  discover: 0.45,
  achievement: 0.5,
  portal: 0.4,
  click: 0.3,
};

let _ac: any = null;
export let muted = false;
export function setMuted(v: any) {
  muted = v;
}

function ensureAC() {
  if (!_ac) {
    try {
      _ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (_ac.state === "suspended") _ac.resume();
  return _ac;
}
function sweep(ac: any, f1: any, f2: any, dur: any, type: any, vol: any) {
  const o = ac.createOscillator(),
    g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f1, ac.currentTime);
  o.frequency.exponentialRampToValueAtTime(Math.max(0.001, f2), ac.currentTime + dur);
  g.gain.setValueAtTime(vol, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
  o.connect(g).connect(ac.destination);
  o.start();
  o.stop(ac.currentTime + dur);
}
function noise(ac: any, dur: any, vol: any, lpf = 1500) {
  const n = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filt = ac.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = lpf;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
  src.connect(filt).connect(g).connect(ac.destination);
  src.start();
}
function arp(ac: any, freqs: any, step: any, type: any, vol: any) {
  freqs.forEach((f, i) => setTimeout(() => sweep(ac, f, f, step, type, vol), i * step * 800));
}
function chord(ac: any, freqs: any, dur: any, type: any, vol: any) {
  freqs.forEach((f) => sweep(ac, f, f, dur, type, vol / freqs.length));
}

export function playSnd(name: any) {
  if (muted) return;
  if (SOUNDS[name]) {
    try {
      const a = SOUNDS[name].cloneNode();
      a.volume = SOUND_VOLUME[name] || 0.4;
      a.play().catch(() => {});
      return;
    } catch {}
  }
  const ac = ensureAC();
  if (!ac) return;
  const v = SOUND_VOLUME[name] || 0.3;
  switch (name) {
    case "jump":
      sweep(ac, 220, 520, 0.1, "square", v);
      break;
    case "doublejump":
      sweep(ac, 420, 760, 0.1, "square", v);
      break;
    case "dash":
      sweep(ac, 600, 220, 0.14, "sawtooth", v);
      noise(ac, 0.06, v * 0.5, 1800);
      break;
    case "land":
      noise(ac, 0.07, v, 800);
      break;
    case "collect":
      sweep(ac, 880, 1320, 0.1, "sine", v);
      break;
    case "big_collect":
      arp(ac, [523, 659, 784, 1047], 0.05, "sine", v);
      break;
    case "level_up":
      arp(ac, [523, 659, 784, 1047], 0.06, "triangle", v);
      break;
    case "discover":
      chord(ac, [392, 494, 587], 0.4, "sine", v);
      break;
    case "achievement":
      arp(ac, [659, 784, 988, 1318], 0.07, "triangle", v);
      break;
    case "portal":
      sweep(ac, 100, 500, 0.4, "sine", v);
      break;
    case "click":
      sweep(ac, 1000, 1000, 0.03, "square", v);
      break;
  }
}
