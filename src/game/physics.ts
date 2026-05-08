import {
  TILE_SIZE,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  GRAVITY,
  JUMP_VELOCITY,
  DOUBLE_JUMP_VELOCITY,
  MOVE_ACCELERATION,
  MOVE_FRICTION,
  MAX_RUN_SPEED,
  DASH_VELOCITY,
  DASH_FRAMES,
  DASH_COOLDOWN,
  COYOTE_FRAMES,
  JUMP_BUFFER_FRAMES,
  WALL_SLIDE_SPEED,
  MAX_FALL_SPEED,
  JUMP_CUT_MULTIPLIER,
  DUST_COLOR,
} from "./constants";
import { ZONES } from "./data";
import { isSolid, isPlat } from "./levels";
import { playSnd } from "./audio";

// ===== Warframe-style parkour tuning =====
const BULLET_VX = 11.5; // bullet jump horizontal speed
const BULLET_VY = -11.5; // bullet jump vertical speed
const SLIDE_FRICTION = 0.965; // very low decay during slide
const SLIDE_BOOST = 1.35; // entry speed boost
const SLIDE_MIN_SPEED = 1.5; // below this, slide ends
const SLIDE_ENTER_SPEED = 2.5; // need this much speed to start sliding
const ROLL_FRAMES = 6;
const ROLL_SPEED = 11;
const ROLL_COOL = 18;
const ROLL_IFRAMES = 8;
const AIM_GLIDE_DUR = 60; // ~1 second @ 60fps
const AIM_GLIDE_GRAV = 0.1;
const AIM_GLIDE_MAX = 1.5;

export function addParticles(s, x, y, n, color, scale) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = Math.random() * 3 * scale;
    s.particles.push({
      x,
      y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 1,
      life: 18 + Math.random() * 18,
      max: 36,
      color,
      size: 1.5 + Math.random() * 2.5 * scale,
      g: 0.15,
    });
  }
}

export function stepGame(s, inp, ch, cb, dt) {
  s.time += dt;
  const p = s.p,
    lv = s.level,
    map = lv.map;

  // ---- horizontal direction intent ----
  let dir = 0;
  if (inp.left) dir -= 1;
  if (inp.right) dir += 1;
  if (dir !== 0) {
    p.facing = dir;
    if (!s.hasMoved) {
      s.hasMoved = true;
      cb.grantAch("a1");
    }
  }

  // ---- slide state (hold S while running on ground) ----
  const wantsSlide = inp.down && p.onGround && Math.abs(p.vx) > SLIDE_ENTER_SPEED;
  if (wantsSlide && !p.sliding && p.dashFrames <= 0) {
    p.sliding = true;
    p.slideFrames = 0;
    p.vx *= SLIDE_BOOST;
    addParticles(s, p.x + PLAYER_WIDTH / 2, p.y + PLAYER_HEIGHT, 8, DUST_COLOR, 1.2);
    playSnd("dash");
  }
  if (p.sliding) {
    p.slideFrames++;
    if (!inp.down || !p.onGround || Math.abs(p.vx) < SLIDE_MIN_SPEED) {
      p.sliding = false;
    }
  }

  // ---- horizontal acceleration ----
  if (p.dashFrames <= 0 && !p.wallLatched) {
    if (p.sliding) {
      p.vx *= SLIDE_FRICTION;
      p.vx += dir * MOVE_ACCELERATION * 0.25; // tiny steering during slide
    } else {
      p.vx += dir * MOVE_ACCELERATION;
      if (dir === 0) p.vx *= MOVE_FRICTION;
      const overspeed = Math.abs(p.vx) > MAX_RUN_SPEED && (dir === 0 || Math.sign(p.vx) !== dir);
      if (!overspeed) p.vx = Math.max(-MAX_RUN_SPEED, Math.min(MAX_RUN_SPEED, p.vx));
    }
  }

  // ---- jump / bullet jump (with coyote + buffer) ----
  if (inp.jumpEdge) {
    p.jbuf = JUMP_BUFFER_FRAMES;
    inp.jumpEdge = false;
  }
  p.jbuf = Math.max(0, p.jbuf - 1);
  p.coyote = Math.max(0, p.coyote - 1);

  let justBulletJumped = false;
  const groundedish = p.onGround || p.coyote > 0;

  if (p.jbuf > 0 && groundedish && (inp.down || p.sliding)) {
    // BULLET JUMP — explosive 45° launch in facing direction
    p.vx = Math.sign(p.vx || p.facing) * Math.max(BULLET_VX, Math.abs(p.vx));
    if (p.vx === 0) p.vx = BULLET_VX * p.facing;
    p.vy = BULLET_VY;
    p.jbuf = 0;
    p.coyote = 0;
    p.sliding = false;
    p.jumpsLeft = 1; // can still double jump after
    p.airDashUsed = false;
    p.aimGlideUsed = false;
    p.wallLatched = false;
    p.squash = 0.6;
    justBulletJumped = true;
    addParticles(s, p.x + PLAYER_WIDTH / 2, p.y + PLAYER_HEIGHT, 18, ch.accent, 2.6);
    playSnd("doublejump");
  } else if (p.jbuf > 0 && (p.coyote > 0 || p.jumpsLeft > 0 || p.wallDir !== 0 || p.wallLatched)) {
    if (p.coyote > 0) {
      p.vy = JUMP_VELOCITY;
      p.coyote = 0;
      p.jumpsLeft = 1;
      playSnd("jump");
    } else if (p.wallDir !== 0 || p.wallLatched) {
      const wd = p.wallDir !== 0 ? p.wallDir : p.facing > 0 ? 1 : -1;
      p.vy = JUMP_VELOCITY * 0.94;
      p.vx = -wd * MAX_RUN_SPEED * 1.15;
      p.jumpsLeft = 1;
      p.airDashUsed = false; // wall jump refreshes air abilities
      p.aimGlideUsed = false;
      p.wallLatched = false;
      playSnd("jump");
    } else {
      p.vy = DOUBLE_JUMP_VELOCITY;
      p.jumpsLeft -= 1;
      addParticles(s, p.x + PLAYER_WIDTH / 2, p.y + PLAYER_HEIGHT, 12, ch.accent, 2);
      playSnd("doublejump");
      if (!s.hasJumped) {
        s.hasJumped = true;
        cb.grantAch("a2");
      }
    }
    p.jbuf = 0;
    p.squash = 0.7;
  }

  // variable jump cut (skip for bullet jump — full commit)
  if (!justBulletJumped && !inp.jump && p.vy < -3) p.vy *= JUMP_CUT_MULTIPLIER;

  // ---- dash (ROLL on ground / AIR DASH in air) ----
  if (inp.dashEdge) {
    inp.dashEdge = false;
    if (p.dashCool <= 0 && p.dashFrames <= 0 && !p.wallLatched) {
      if (p.onGround) {
        // ROLL — short horizontal evasive hop with i-frames
        p.dashFrames = ROLL_FRAMES;
        p.dashCool = ROLL_COOL;
        p.dashDx = dir !== 0 ? dir : p.facing;
        p.dashDy = 0;
        p.iframes = ROLL_IFRAMES;
        if (p.dashDx !== 0) p.facing = p.dashDx > 0 ? 1 : -1;
        addParticles(s, p.x + PLAYER_WIDTH / 2, p.y + PLAYER_HEIGHT, 12, ch.accent, 1.8);
        playSnd("dash");
        if (!s.hasDashed) {
          s.hasDashed = true;
          cb.grantAch("a3");
        }
      } else if (!p.airDashUsed) {
        // AIR DASH — 8-directional, 1 charge per airborne sequence
        let dx = 0,
          dy = 0;
        if (inp.left) dx -= 1;
        if (inp.right) dx += 1;
        if (inp.up) dy -= 1;
        if (inp.down) dy += 1;
        if (dx === 0 && dy === 0) dx = p.facing;
        const len = Math.hypot(dx, dy) || 1;
        p.dashFrames = DASH_FRAMES;
        p.dashCool = DASH_COOLDOWN;
        p.dashDx = dx / len;
        p.dashDy = dy / len;
        p.airDashUsed = true;
        if (dx !== 0) p.facing = dx > 0 ? 1 : -1;
        addParticles(s, p.x + PLAYER_WIDTH / 2, p.y + PLAYER_HEIGHT / 2, 18, ch.accent, 2.4);
        playSnd("dash");
        if (!s.hasDashed) {
          s.hasDashed = true;
          cb.grantAch("a3");
        }
        p.aimGlideFrames = 0; // dashing cancels active glide
      }
    }
  }
  if (p.dashCool > 0) p.dashCool--;
  if (p.iframes > 0) p.iframes--;

  // ---- dash physics ----
  if (p.dashFrames > 0) {
    if (p.onGround) {
      p.vx = p.dashDx * ROLL_SPEED;
      p.vy = 0;
    } else {
      p.vx = p.dashDx * DASH_VELOCITY;
      p.vy = p.dashDy * DASH_VELOCITY;
    }
    p.dashFrames--;
    if (s.time % 2 < 1)
      addParticles(s, p.x + PLAYER_WIDTH / 2, p.y + PLAYER_HEIGHT / 2, 1, ch.accent, 1.5);
  }

  // ---- horizontal collision (sets wallDir) ----
  p.x += p.vx;
  p.wallDir = 0;
  {
    const left = Math.floor(p.x / TILE_SIZE),
      right = Math.floor((p.x + PLAYER_WIDTH - 1) / TILE_SIZE);
    const top = Math.floor(p.y / TILE_SIZE),
      bottom = Math.floor((p.y + PLAYER_HEIGHT - 1) / TILE_SIZE);
    for (let ty = top; ty <= bottom; ty++)
      for (let tx = left; tx <= right; tx++) {
        if (isSolid(map[ty]?.[tx])) {
          if (p.vx > 0) {
            p.x = tx * TILE_SIZE - PLAYER_WIDTH;
            p.wallDir = 1;
          } else if (p.vx < 0) {
            p.x = (tx + 1) * TILE_SIZE;
            p.wallDir = -1;
          }
          p.vx = 0;
        }
      }
  }

  // ---- wall latch (hold X against wall in air) ----
  const pressingIntoWall = (p.wallDir > 0 && inp.right) || (p.wallDir < 0 && inp.left);
  const canLatch =
    p.wallDir !== 0 && !p.onGround && inp.dash && pressingIntoWall && p.dashFrames <= 0;
  if (canLatch) {
    if (!p.wallLatched) {
      addParticles(
        s,
        p.x + (p.wallDir > 0 ? PLAYER_WIDTH : 0),
        p.y + PLAYER_HEIGHT / 2,
        6,
        DUST_COLOR,
        1.0,
      );
    }
    p.wallLatched = true;
    p.vy = 0;
    p.vx = 0;
    p.airDashUsed = false; // wall latch refreshes EVERYTHING
    p.aimGlideUsed = false;
    p.aimGlideFrames = 0;
    p.jumpsLeft = 2;
    p.squash = 0.85;
  } else {
    p.wallLatched = false;
  }

  // ---- aim glide (hold X in air, once per airborne sequence) ----
  const canStartGlide =
    inp.dash &&
    !p.onGround &&
    p.dashFrames <= 0 &&
    !p.wallLatched &&
    !p.aimGlideUsed &&
    p.aimGlideFrames <= 0;
  if (canStartGlide) {
    p.aimGlideFrames = AIM_GLIDE_DUR;
    p.aimGlideUsed = true;
    addParticles(s, p.x + PLAYER_WIDTH / 2, p.y + PLAYER_HEIGHT, 4, ch.accent, 0.8);
  }
  if (p.aimGlideFrames > 0) {
    if (!inp.dash || p.onGround || p.wallLatched || p.dashFrames > 0 || p.vy < -2) {
      p.aimGlideFrames = 0; // cancel on land/latch/dash/upward burst
    } else {
      p.aimGlideFrames--;
      p.squash = 1.05; // slight stretch while gliding
    }
  }

  // ---- gravity (state-modulated) ----
  if (p.dashFrames > 0) {
    // dashing — vy controlled
  } else if (p.wallLatched) {
    // no gravity while latched
  } else if (p.aimGlideFrames > 0) {
    p.vy = Math.min(AIM_GLIDE_MAX, p.vy + AIM_GLIDE_GRAV);
  } else {
    p.vy = Math.min(MAX_FALL_SPEED, p.vy + GRAVITY);
  }

  // ---- wall slide (only when not latched and falling fast) ----
  if (
    p.wallDir !== 0 &&
    !p.onGround &&
    p.vy > WALL_SLIDE_SPEED &&
    p.dashFrames <= 0 &&
    !p.wallLatched
  ) {
    p.vy = WALL_SLIDE_SPEED;
  }

  // ---- vertical collision ----
  p.prevY = p.y;
  p.y += p.vy;
  {
    const left = Math.floor(p.x / TILE_SIZE),
      right = Math.floor((p.x + PLAYER_WIDTH - 1) / TILE_SIZE);
    const top = Math.floor(p.y / TILE_SIZE),
      bottom = Math.floor((p.y + PLAYER_HEIGHT - 1) / TILE_SIZE);
    for (let ty = top; ty <= bottom; ty++)
      for (let tx = left; tx <= right; tx++) {
        const c = map[ty]?.[tx];
        if (isSolid(c)) {
          if (p.vy > 0) p.y = ty * TILE_SIZE - PLAYER_HEIGHT;
          else if (p.vy < 0) p.y = (ty + 1) * TILE_SIZE;
          p.vy = 0;
        } else if (isPlat(c) && p.vy > 0 && !inp.down) {
          const platY = ty * TILE_SIZE;
          if (p.prevY + PLAYER_HEIGHT <= platY + 1) {
            p.y = platY - PLAYER_HEIGHT;
            p.vy = 0;
          }
        }
      }
  }

  // ---- ground probe (single source of truth) ----
  const wasOnGround = p.onGround;
  p.onGround = false;
  {
    const left = Math.floor(p.x / TILE_SIZE),
      right = Math.floor((p.x + PLAYER_WIDTH - 1) / TILE_SIZE);
    const probeTy = Math.floor((p.y + PLAYER_HEIGHT + 1) / TILE_SIZE);
    const platTop = probeTy * TILE_SIZE;
    for (let tx = left; tx <= right; tx++) {
      const c = map[probeTy]?.[tx];
      if (isSolid(c)) {
        p.onGround = true;
        break;
      }
      if (
        isPlat(c) &&
        !inp.down &&
        p.vy >= 0 &&
        p.y + PLAYER_HEIGHT >= platTop - 1 &&
        p.y + PLAYER_HEIGHT <= platTop + 1
      ) {
        p.onGround = true;
        break;
      }
    }
  }

  if (p.onGround) {
    if (!wasOnGround && p.peakFall > 1.5) {
      const fall = Math.min(20, p.peakFall);
      p.squash = Math.max(0.55, 1 - fall * 0.04);
      addParticles(
        s,
        p.x + PLAYER_WIDTH / 2,
        p.y + PLAYER_HEIGHT,
        3 + Math.floor(fall / 3),
        DUST_COLOR,
        1.0,
      );
      if (fall > 12) s.cam.shake = Math.min(8, fall * 0.4);
      playSnd("land");
    }
    // landing refreshes everything
    p.jumpsLeft = 2;
    p.coyote = COYOTE_FRAMES;
    p.peakFall = 0;
    p.airDashUsed = false;
    p.aimGlideUsed = false;
    p.aimGlideFrames = 0;
    if (p.vy >= 0) {
      const probeTy = Math.floor((p.y + PLAYER_HEIGHT + 1) / TILE_SIZE);
      p.y = probeTy * TILE_SIZE - PLAYER_HEIGHT;
      p.vy = 0;
    }
  } else {
    p.peakFall = Math.max(p.peakFall, p.vy);
  }
  if (p.sliding) p.squash = 0.55; // visual: stay flat during slide
  p.squash += (1 - p.squash) * 0.18;

  // ---- collectibles + portals ----
  {
    const left = Math.floor(p.x / TILE_SIZE),
      right = Math.floor((p.x + PLAYER_WIDTH - 1) / TILE_SIZE);
    const top = Math.floor(p.y / TILE_SIZE),
      bottom = Math.floor((p.y + PLAYER_HEIGHT - 1) / TILE_SIZE);
    for (let ty = top; ty <= bottom; ty++)
      for (let tx = left; tx <= right; tx++) {
        const c = map[ty]?.[tx];
        const key = tx + "," + ty;
        if ((c === "c" || c === "C") && !s.collected.has(key)) {
          s.collected.add(key);
          const big = c === "C";
          addParticles(
            s,
            tx * TILE_SIZE + TILE_SIZE / 2,
            ty * TILE_SIZE + TILE_SIZE / 2,
            big ? 30 : 10,
            ch.accent,
            big ? 3 : 1.5,
          );
          cb.addMaterials(big ? 5 : 1);
          cb.grantXP(big ? 80 : 15, big ? "rare cache" : "material");
          playSnd(big ? "big_collect" : "collect");
          if (big) cb.grantAch("a8");
          if (cb.getMaterials() >= 5) cb.grantAch("a6");
        }
        if (c === "p" && inp.interactEdge) {
          inp.interactEdge = false;
          if (s.current === "over") cb.transitionToDelve();
        }
        if (c === "r" && inp.interactEdge) {
          inp.interactEdge = false;
          if (s.current === "delve") cb.transitionToOver();
        }
      }
  }
  inp.interactEdge = false;

  if (s.current === "over") {
    const cx = p.x + PLAYER_WIDTH / 2,
      cy = p.y + PLAYER_HEIGHT / 2;
    for (const z of ZONES) {
      if (cx >= z.x && cx < z.x + z.w && cy >= z.y && cy < z.y + z.h) cb.discover(z.id);
    }
  }

  inp.jumpEdge = false;
  inp.dashEdge = false;

  // ---- camera ----
  const camTargetX = p.x + PLAYER_WIDTH / 2 - 880 / 2;
  const camTargetY = p.y + PLAYER_HEIGHT / 2 - 520 / 2;
  s.cam.x += (camTargetX - s.cam.x) * 0.12;
  s.cam.y += (camTargetY - s.cam.y) * 0.12;
  const lvW = lv.W * TILE_SIZE,
    lvH = lv.H * TILE_SIZE;
  s.cam.x = Math.max(0, Math.min(lvW - 880, s.cam.x));
  s.cam.y = Math.max(0, Math.min(lvH - 520, s.cam.y));
  if (s.cam.shake > 0) s.cam.shake *= 0.85;

  s.particles = s.particles.filter((pt) => pt.life > 0);
  for (const pt of s.particles) {
    pt.x += pt.vx;
    pt.y += pt.vy;
    pt.vy += pt.g || 0.1;
    pt.life--;
  }
  for (const bp of s.bgPart) {
    bp.y += bp.sp;
    bp.x += Math.sin((s.time + bp.x) * 0.001) * 0.3;
    if (bp.y > lvH) {
      bp.y = -10;
      bp.x = Math.random() * lvW;
    }
  }
  p.anim += Math.abs(p.vx) * 0.06 + 0.02;

  if (p.y > (lv.H + 4) * TILE_SIZE) {
    p.x = lv.spawn.x;
    p.y = lv.spawn.y;
    p.vx = 0;
    p.vy = 0;
  }
}

export function makeInitialState(ow, dl, x, y, current, collected) {
  const lv = current === "delve" ? dl : ow;
  const st = {
    ow,
    dl,
    current,
    level: lv,
    cam: { x: 0, y: 0, shake: 0 },
    p: {
      x,
      y,
      vx: 0,
      vy: 0,
      onGround: false,
      wallDir: 0,
      jumpsLeft: 2,
      coyote: 0,
      jbuf: 0,
      dashFrames: 0,
      dashCool: 0,
      dashDx: 1,
      dashDy: 0,
      facing: 1,
      anim: 0,
      squash: 1,
      prevY: y,
      peakFall: 0,
      // Warframe-style state
      airDashUsed: false,
      aimGlideUsed: false,
      aimGlideFrames: 0,
      wallLatched: false,
      sliding: false,
      slideFrames: 0,
      iframes: 0,
    },
    collected,
    particles: [],
    bgPart: [],
    time: 0,
    hasJumped: false,
    hasDashed: false,
    hasMoved: false,
  };
  for (let i = 0; i < 18; i++) {
    st.bgPart.push({
      x: Math.random() * (lv.W * TILE_SIZE),
      y: Math.random() * (lv.H * TILE_SIZE),
      s: 0.3 + Math.random() * 1.0,
      o: 0.15 + Math.random() * 0.25,
      sp: 0.15 + Math.random() * 0.3,
    });
  }
  return st;
}
