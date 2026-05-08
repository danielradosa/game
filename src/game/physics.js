import {
  T, PW, PH, GRAV, JV, DJV, MA, MF, MR, DV, DF, DC,
  CY, JB, WS, FM, JUMP_CUT, DUST,
} from './constants';
import { ZONES } from './data';
import { isSolid, isPlat } from './levels';
import { playSnd } from './audio';

export function addParticles(s, x, y, n, color, scale) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = Math.random() * 3 * scale;
    s.particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
      life: 18 + Math.random() * 18, max: 36, color,
      size: 1.5 + Math.random() * 2.5 * scale, g: 0.15,
    });
  }
}

export function stepGame(s, inp, ch, cb, dt) {
  s.time += dt;
  const p = s.p, lv = s.level, map = lv.map;

  let dir = 0;
  if (inp.left) dir -= 1; if (inp.right) dir += 1;
  if (dir !== 0) {
    p.facing = dir;
    if (!s.hasMoved) { s.hasMoved = true; cb.grantAch('a1'); }
  }
  if (p.dashFrames <= 0) {
    p.vx += dir * MA;
    if (dir === 0) p.vx *= MF;
    if (!(Math.abs(p.vx) > MR && (dir === 0 || Math.sign(p.vx) !== dir))) {
      p.vx = Math.max(-MR, Math.min(MR, p.vx));
    }
  }

  if (inp.jumpEdge) { p.jbuf = JB; inp.jumpEdge = false; }
  p.jbuf = Math.max(0, p.jbuf - 1);
  p.coyote = Math.max(0, p.coyote - 1);

  if (p.jbuf > 0 && (p.coyote > 0 || p.jumpsLeft > 0 || p.wallDir !== 0)) {
    if (p.coyote > 0) { p.vy = JV; p.coyote = 0; p.jumpsLeft = 1; playSnd('jump'); }
    else if (p.wallDir !== 0) { p.vy = JV * 0.92; p.vx = -p.wallDir * MR * 1.1; p.jumpsLeft = 1; playSnd('jump'); }
    else {
      p.vy = DJV; p.jumpsLeft -= 1;
      addParticles(s, p.x + PW / 2, p.y + PH, 12, ch.accent, 2);
      playSnd('doublejump');
      if (!s.hasJumped) { s.hasJumped = true; cb.grantAch('a2'); }
    }
    p.jbuf = 0; p.squash = 0.7;
  }
  if (!inp.jump && p.vy < -3) p.vy *= JUMP_CUT;

  if (inp.dashEdge) {
    inp.dashEdge = false;
    if (p.dashCool <= 0 && p.dashFrames <= 0) {
      let dx = 0, dy = 0;
      if (inp.left) dx -= 1; if (inp.right) dx += 1;
      if (inp.up) dy -= 1; if (inp.down) dy += 1;
      if (dx === 0 && dy === 0) dx = p.facing;
      const len = Math.hypot(dx, dy) || 1;
      p.dashFrames = DF; p.dashCool = DC;
      p.dashDx = dx / len; p.dashDy = dy / len;
      if (dx !== 0) p.facing = dx > 0 ? 1 : -1;
      addParticles(s, p.x + PW / 2, p.y + PH / 2, 18, ch.accent, 2.4);
      playSnd('dash');
      if (!s.hasDashed) { s.hasDashed = true; cb.grantAch('a3'); }
    }
  }
  if (p.dashCool > 0) p.dashCool--;

  if (p.dashFrames > 0) {
    p.vx = p.dashDx * DV;
    p.vy = p.dashDy * DV;
    p.dashFrames--;
    if (s.time % 2 < 1) addParticles(s, p.x + PW / 2, p.y + PH / 2, 1, ch.accent, 1.5);
  } else {
    p.vy = Math.min(FM, p.vy + GRAV);
  }

  p.x += p.vx;
  p.wallDir = 0;
  {
    const left = Math.floor(p.x / T), right = Math.floor((p.x + PW - 1) / T);
    const top = Math.floor(p.y / T), bottom = Math.floor((p.y + PH - 1) / T);
    for (let ty = top; ty <= bottom; ty++) for (let tx = left; tx <= right; tx++) {
      if (isSolid(map[ty]?.[tx])) {
        if (p.vx > 0) { p.x = tx * T - PW; p.wallDir = 1; }
        else if (p.vx < 0) { p.x = (tx + 1) * T; p.wallDir = -1; }
        p.vx = 0;
      }
    }
  }
  if (p.wallDir !== 0 && !p.onGround && p.vy > WS && p.dashFrames <= 0) p.vy = WS;

  p.prevY = p.y;
  p.y += p.vy;
  {
    const left = Math.floor(p.x / T), right = Math.floor((p.x + PW - 1) / T);
    const top = Math.floor(p.y / T), bottom = Math.floor((p.y + PH - 1) / T);
    for (let ty = top; ty <= bottom; ty++) for (let tx = left; tx <= right; tx++) {
      const c = map[ty]?.[tx];
      if (isSolid(c)) {
        if (p.vy > 0) p.y = ty * T - PH;
        else if (p.vy < 0) p.y = (ty + 1) * T;
        p.vy = 0;
      } else if (isPlat(c) && p.vy > 0 && !inp.down) {
        const platY = ty * T;
        if (p.prevY + PH <= platY + 1) { p.y = platY - PH; p.vy = 0; }
      }
    }
  }

  const wasOnGround = p.onGround;
  p.onGround = false;
  {
    const left = Math.floor(p.x / T), right = Math.floor((p.x + PW - 1) / T);
    const probeTy = Math.floor((p.y + PH + 1) / T);
    const platTop = probeTy * T;
    for (let tx = left; tx <= right; tx++) {
      const c = map[probeTy]?.[tx];
      if (isSolid(c)) { p.onGround = true; break; }
      if (isPlat(c) && !inp.down && p.vy >= 0 &&
          (p.y + PH) >= platTop - 1 && (p.y + PH) <= platTop + 1) {
        p.onGround = true; break;
      }
    }
  }

  if (p.onGround) {
    if (!wasOnGround && p.peakFall > 1.5) {
      const fall = Math.min(20, p.peakFall);
      p.squash = Math.max(0.55, 1 - fall * 0.04);
      addParticles(s, p.x + PW / 2, p.y + PH, 3 + Math.floor(fall / 3), DUST, 1.0);
      if (fall > 12) s.cam.shake = Math.min(8, fall * 0.4);
      playSnd('land');
    }
    p.jumpsLeft = 2; p.coyote = CY; p.peakFall = 0;
    if (p.vy >= 0) {
      const probeTy = Math.floor((p.y + PH + 1) / T);
      p.y = probeTy * T - PH;
      p.vy = 0;
    }
  } else {
    p.peakFall = Math.max(p.peakFall, p.vy);
  }
  p.squash += (1 - p.squash) * 0.18;

  {
    const left = Math.floor(p.x / T), right = Math.floor((p.x + PW - 1) / T);
    const top = Math.floor(p.y / T), bottom = Math.floor((p.y + PH - 1) / T);
    for (let ty = top; ty <= bottom; ty++) for (let tx = left; tx <= right; tx++) {
      const c = map[ty]?.[tx];
      const key = tx + ',' + ty;
      if ((c === 'c' || c === 'C') && !s.collected.has(key)) {
        s.collected.add(key);
        const big = c === 'C';
        addParticles(s, tx * T + T / 2, ty * T + T / 2, big ? 30 : 10, ch.accent, big ? 3 : 1.5);
        cb.addMaterials(big ? 5 : 1);
        cb.grantXP(big ? 80 : 15, big ? 'rare cache' : 'material');
        playSnd(big ? 'big_collect' : 'collect');
        if (big) cb.grantAch('a8');
        if (cb.getMaterials() >= 5) cb.grantAch('a6');
      }
      if (c === 'p' && inp.interactEdge) { inp.interactEdge = false; if (s.current === 'over') cb.transitionToDelve(); }
      if (c === 'r' && inp.interactEdge) { inp.interactEdge = false; if (s.current === 'delve') cb.transitionToOver(); }
    }
  }
  inp.interactEdge = false;

  if (s.current === 'over') {
    const cx = p.x + PW / 2, cy = p.y + PH / 2;
    for (const z of ZONES) {
      if (cx >= z.x && cx < z.x + z.w && cy >= z.y && cy < z.y + z.h) cb.discover(z.id);
    }
  }

  inp.jumpEdge = false; inp.dashEdge = false;

  const camTargetX = p.x + PW / 2 - 880 / 2;
  const camTargetY = p.y + PH / 2 - 520 / 2;
  s.cam.x += (camTargetX - s.cam.x) * 0.12;
  s.cam.y += (camTargetY - s.cam.y) * 0.12;
  const lvW = lv.W * T, lvH = lv.H * T;
  s.cam.x = Math.max(0, Math.min(lvW - 880, s.cam.x));
  s.cam.y = Math.max(0, Math.min(lvH - 520, s.cam.y));
  if (s.cam.shake > 0) s.cam.shake *= 0.85;

  s.particles = s.particles.filter(pt => pt.life > 0);
  for (const pt of s.particles) { pt.x += pt.vx; pt.y += pt.vy; pt.vy += pt.g || 0.1; pt.life--; }
  for (const bp of s.bgPart) {
    bp.y += bp.sp;
    bp.x += Math.sin((s.time + bp.x) * 0.001) * 0.3;
    if (bp.y > lvH) { bp.y = -10; bp.x = Math.random() * lvW; }
  }
  p.anim += Math.abs(p.vx) * 0.06 + 0.02;

  if (p.y > (lv.H + 4) * T) { p.x = lv.spawn.x; p.y = lv.spawn.y; p.vx = 0; p.vy = 0; }
}

export function makeInitialState(ow, dl, x, y, current, collected) {
  const lv = current === 'delve' ? dl : ow;
  const st = {
    ow, dl, current, level: lv,
    cam: { x: 0, y: 0, shake: 0 },
    p: {
      x, y, vx: 0, vy: 0,
      onGround: false, wallDir: 0,
      jumpsLeft: 2, coyote: 0, jbuf: 0,
      dashFrames: 0, dashCool: 0, dashDx: 1, dashDy: 0,
      facing: 1, anim: 0, squash: 1, prevY: y, peakFall: 0,
    },
    collected, particles: [], bgPart: [], time: 0,
    hasJumped: false, hasDashed: false, hasMoved: false,
  };
  for (let i = 0; i < 18; i++) {
    st.bgPart.push({
      x: Math.random() * (lv.W * T), y: Math.random() * (lv.H * T),
      s: 0.3 + Math.random() * 1.0, o: 0.15 + Math.random() * 0.25, sp: 0.15 + Math.random() * 0.3,
    });
  }
  return st;
}
