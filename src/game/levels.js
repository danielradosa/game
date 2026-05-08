import { T } from './constants';

export function buildOverworld() {
  const W = 110, H = 22;
  const m = Array.from({ length: H }, () => Array(W).fill(' '));
  const g = [];
  for (let x = 0; x < W; x++) {
    let y = 16;
    y += Math.round(Math.sin(x * 0.09) * 1.5);
    y += Math.round(Math.cos(x * 0.045) * 1.4);
    if (x >= 26 && x < 34) y = 13;
    if (x >= 50 && x < 58) y = 18;
    if (x >= 68 && x < 80) y = 9;
    if (x >= 95 && x < 105) y = 14;
    g.push(Math.max(8, Math.min(20, y)));
  }
  for (let x = 0; x < W; x++) for (let y = g[x]; y < H; y++) m[y][x] = '#';
  const plats = [
    [10,13,3],[16,11,3],[22,9,4],[38,14,3],[44,12,3],[50,10,4],
    [60,11,3],[64,9,3],[70,7,4],[85,11,3],[92,13,4],[100,12,3],
  ];
  plats.forEach(([px, py, pw]) => {
    for (let i = 0; i < pw; i++) {
      if (m[py] && px + i < W && m[py][px + i] === ' ') m[py][px + i] = '=';
    }
  });
  [[12,12],[23,8],[44,11],[51,9],[65,8],[74,6],[86,10],[101,11],[33,12],[55,17]]
    .forEach(([x, y]) => { if (m[y]) m[y][x] = 'c'; });
  m[g[6] - 1][6] = 'n';
  m[g[105] - 1][105] = 'p';
  return { map: m, W, H, spawn: { x: 3 * T, y: (g[3] - 3) * T }, ground: g, theme: 'over' };
}

export function buildDelve() {
  const W = 24, H = 30;
  const m = Array.from({ length: H }, () => Array(W).fill(' '));
  for (let x = 0; x < W; x++) { m[H - 1][x] = '#'; m[0][x] = '#'; }
  for (let y = 0; y < H; y++) { m[y][0] = '#'; m[y][W - 1] = '#'; }
  [[3,26,5],[13,24,5],[4,21,4],[15,19,4],[3,16,5],[13,13,4],[5,10,4],[14,7,5],[3,4,6]]
    .forEach(([px, py, pw]) => { for (let i = 0; i < pw; i++) m[py][px + i] = '='; });
  [[15,25],[5,20],[16,18],[4,15],[15,12],[5,9],[15,6]].forEach(([x, y]) => m[y][x] = 'c');
  m[3][12] = 'C';
  m[H - 2][2] = 'r';
  return { map: m, W, H, spawn: { x: 4 * T, y: (H - 3) * T }, theme: 'delve' };
}

export const isSolid = (c) => c === '#';
export const isPlat  = (c) => c === '=';
