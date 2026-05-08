import type { OscType, SoundMap, SoundName, VolumeMap } from "./types/audio";

// Replace any procedural sound with a real file:
// SOUNDS.jump = new Audio('/sfx/jump.mp3');

export const SOUNDS: SoundMap = {
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

export const SOUND_VOLUME: VolumeMap = {
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

let _ac: AudioContext | null = null;

export let muted = false;

export function setMuted(v: boolean) {
  muted = v;
}

function ensureAC(): AudioContext | null {
  if (!_ac) {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (
          window as typeof window & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;

      if (!AudioContextClass) return null;

      _ac = new AudioContextClass();
    } catch {
      return null;
    }
  }

  if (_ac.state === "suspended") {
    void _ac.resume();
  }

  return _ac;
}

function sweep(ac: AudioContext, f1: number, f2: number, dur: number, type: OscType, vol: number) {
  const oscillator = ac.createOscillator();
  const gain = ac.createGain();

  oscillator.type = type;

  oscillator.frequency.setValueAtTime(f1, ac.currentTime);

  oscillator.frequency.exponentialRampToValueAtTime(Math.max(0.001, f2), ac.currentTime + dur);

  gain.gain.setValueAtTime(vol, ac.currentTime);

  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);

  oscillator.connect(gain);
  gain.connect(ac.destination);

  oscillator.start();
  oscillator.stop(ac.currentTime + dur);
}

function noise(ac: AudioContext, dur: number, vol: number, lpf = 1500) {
  const length = Math.max(1, Math.floor(ac.sampleRate * dur));

  const buffer = ac.createBuffer(1, length, ac.sampleRate);

  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ac.createBufferSource();
  source.buffer = buffer;

  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = lpf;

  const gain = ac.createGain();

  gain.gain.setValueAtTime(vol, ac.currentTime);

  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);

  source.start();
}

function arp(ac: AudioContext, freqs: number[], step: number, type: OscType, vol: number) {
  freqs.forEach((freq, index) => {
    setTimeout(
      () => {
        sweep(ac, freq, freq, step, type, vol);
      },
      index * step * 800,
    );
  });
}

function chord(ac: AudioContext, freqs: number[], dur: number, type: OscType, vol: number) {
  freqs.forEach((freq) => {
    sweep(ac, freq, freq, dur, type, vol / freqs.length);
  });
}

export function playSnd(name: SoundName) {
  if (muted) return;

  const sound = SOUNDS[name];

  if (sound) {
    try {
      const audio = sound.cloneNode() as HTMLAudioElement;

      audio.volume = SOUND_VOLUME[name] ?? 0.4;

      void audio.play();

      return;
    } catch {
      // Ignore playback errors
    }
  }

  const ac = ensureAC();

  if (!ac) return;

  const volume = SOUND_VOLUME[name] ?? 0.3;

  switch (name) {
    case "jump":
      sweep(ac, 220, 520, 0.1, "square", volume);
      break;

    case "doublejump":
      sweep(ac, 420, 760, 0.1, "square", volume);
      break;

    case "dash":
      sweep(ac, 600, 220, 0.14, "sawtooth", volume);
      noise(ac, 0.06, volume * 0.5, 1800);
      break;

    case "land":
      noise(ac, 0.07, volume, 800);
      break;

    case "collect":
      sweep(ac, 880, 1320, 0.1, "sine", volume);
      break;

    case "big_collect":
      arp(ac, [523, 659, 784, 1047], 0.05, "sine", volume);
      break;

    case "level_up":
      arp(ac, [523, 659, 784, 1047], 0.06, "triangle", volume);
      break;

    case "discover":
      chord(ac, [392, 494, 587], 0.4, "sine", volume);
      break;

    case "achievement":
      arp(ac, [659, 784, 988, 1318], 0.07, "triangle", volume);
      break;

    case "portal":
      sweep(ac, 100, 500, 0.4, "sine", volume);
      break;

    case "click":
      sweep(ac, 1000, 1000, 0.03, "square", volume);
      break;
  }
}
