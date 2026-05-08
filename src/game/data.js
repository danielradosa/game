import { T } from './constants';

export const ZONES = [
  { id: 'z1', name: 'Sunrise Clearing', x: 0,    y: 0, w: 14*T, h: 22*T, xp: 90 },
  { id: 'z2', name: 'Mossback Bridge',  x: 14*T, y: 0, w: 18*T, h: 22*T, xp: 120 },
  { id: 'z3', name: 'Whisper Hollow',   x: 32*T, y: 0, w: 18*T, h: 22*T, xp: 140 },
  { id: 'z4', name: 'The Vista',        x: 50*T, y: 0, w: 22*T, h: 22*T, xp: 200 },
  { id: 'z5', name: 'Cliffside Way',    x: 72*T, y: 0, w: 18*T, h: 22*T, xp: 160 },
  { id: 'z6', name: 'Riftgate',         x: 90*T, y: 0, w: 20*T, h: 22*T, xp: 220 },
];

export const ACHS = [
  { id: 'a1', name: 'First Steps',         desc: 'Take your first run' },
  { id: 'a2', name: 'Air Time',            desc: 'Use your double jump' },
  { id: 'a3', name: 'Phase Shift',         desc: 'Use your dash' },
  { id: 'a4', name: 'Wayfarer',            desc: 'Discover three areas' },
  { id: 'a5', name: 'Cartographer',        desc: 'Discover every area' },
  { id: 'a6', name: 'Magpie',              desc: 'Collect 5 materials' },
  { id: 'a7', name: 'Threshold',           desc: 'Step through the Riftgate' },
  { id: 'a8', name: 'Summit',              desc: 'Reach the Delve summit' },
  { id: 'a9', name: 'Climbing the Ladder', desc: 'Reach Level 5' },
];

export const SKINS  = ['#f4d4b8','#e8c1a0','#d4a07e','#a87154','#7a4d3a','#523829'];
export const HAIRS  = ['#1a1410','#3a2a20','#7a4d2a','#c08040','#d4b070','#e8d8a0','#5a3a8a','#c84080'];
export const SHIRTS = ['#5e7c8e','#8e5e6e','#5e8e6c','#a86040','#6a6a8e','#3a3a3a','#d4a050','#7a4080'];
export const PANTS  = ['#3a4250','#2a2a35','#4a3a2a','#5a4030','#3a3a4a','#252525','#5a5050','#3a2a4a'];
export const ACCS   = ['#e8a04a','#4ae8b0','#e84a8a','#4aa8e8','#e8e84a','#a04ae8','#ffffff','#1a1a1a'];

export const PROPOSED_MODS = [
  { n: 'Phase Dash', d: 'Pass through enemies' },
  { n: 'Updraft',    d: 'Jumps create wind gusts' },
  { n: 'Lodestone',  d: 'Auto-collect nearby drops' },
  { n: 'Quickfeet',  d: '+15% movement speed' },
  { n: 'Soft Land',  d: 'No fall stagger' },
  { n: 'Echo',       d: 'Dash leaves a damaging trail' },
];
