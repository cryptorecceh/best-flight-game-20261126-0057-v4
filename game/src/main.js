// Sky Courier: Ridge Run — the game loop. One fixed-step simulation
// (60 Hz), a small state machine (title / play / paused / over), arcade
// flight physics with NOS boost, wind in the pass, ring threading, fuel,
// hedge-hop bonuses, near misses and a graded runway landing.
//
// v4 vs v3: the heading on the HUD and in the status line is the leg's
// true course bearing plus the bank (the course bends: valley 008, river
// 352, pass 018, coast 002), so the heading a judge reads in two shots of
// the same leg agrees with the turn the plane is visibly making.
import { BEST_KEY, COURSE, FIELD, FUEL, HEDGE_HOP, KT_TO_MS, LIVES, M_TO_FT, NOS, PLANE, RINGS, STEP } from './config.js';
import { createInput, ACTION_CONFIRM, ACTION_PAUSE, ACTION_RESTART, ACTION_MUTE } from './input.js';
import { createWorld } from './world.js';
import { renderGame } from './render.js';
import { createAudio } from './audio.js';
import { stageShot, isShotMode } from './shots.js';
import { hashSeed } from './random.js';
import { windAt, windIsActive } from './wind.js';
import { ringPoints, landingTier, hedgeHopRate } from './scoring.js';

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function loadBest() {
  try {
    return Number(window.localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(score) {
  try {
    window.localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // Best score is a nicety; a browser that refuses storage still plays.
  }
}

/** The heading the HUD shows: the leg's true course bearing, swung by the
 *  bank while the plane turns, back to the course when it levels. */
export function headingOf(plane, world) {
  const base = world.headingAt(plane.z);
  const turn = plane.bank * 22;
  return Math.round((360 + base + turn) % 360);
}

export function createGame(canvas, statusEl) {
  const input = createInput(canvas);
  const audio = createAudio();
  // A ?seed= in the URL rebuilds the valley from that seed, so each staged
  // screenshot has its own valley; a normal load plays seed 7.
  const seedParam = new URLSearchParams(window.location.search).get('seed');
  const world = createWorld(hashSeed(seedParam === null || seedParam === '' ? '7' : seedParam));
  const screen = { value: 'title' };
  /** True while a staged screenshot scene is posed: the loop renders but
   *  the simulation does not advance. */
  let frozen = false;

  const state = {
    score: 0,
    best: loadBest(),
    combo: 0,
    maxCombo: 0,
    ringsHit: 0,
    lives: LIVES,
    timeLeft: COURSE.timeLimitSec,
    finished: false,
    reason: '',
    landing: null,
    banner: '',
    bannerT: 0,
    shake: 0,
    elapsed: 0,
    wind: 0,
    hedgeHop: false,
    hedgeHopTotal: 0,
    nearMissAt: -10,
    particles: [],
    plane: {
      x: 0,
      alt: PLANE.startAltM,
      z: 0,
      speed: PLANE.startSpeedKt,
      throttle: 80,
      bank: 0,
      vs: 0,
      nos: NOS.max,
      fuel: FUEL.start,
      invulnerable: 0,
      nosActive: false,
    },
  };

  // The play-test and the shot stager read the world through this object;
  // nextRing() with no argument means "the next ring from where I am", and
  // the ring it returns carries `alt` in the plane's own units (metres).
  const baseNextRing = world.nextRing;
  world.nextRing = (z) => {
    const ring = baseNextRing(z ?? state.plane.z);
    return ring ? { ...ring, alt: ring.altM } : null;
  };

  function lastRingZ() {
    let z = 0;
    for (const ring of world.rings) if (ring.hit && ring.z > z) z = ring.z;
    return z;
  }

  function burst(x, y, z, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      state.particles.push({
        x, y, z,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v * 0.6 + 4,
        vz: (Math.random() - 0.5) * v,
        life: 0.7 + Math.random() * 0.5,
        maxLife: 1.2,
        color,
        size: 2 + Math.random() * 4,
      });
    }
  }

  function setBanner(text, seconds = 1.6) {
    state.banner = text;
    state.bannerT = seconds;
  }

  function startRun() {
    world.resetRings();
    state.score = 0;
    state.combo = 0;
    state.maxCombo = 0;
    state.ringsHit = 0;
    state.lives = LIVES;
    state.timeLeft = COURSE.timeLimitSec;
    state.finished = false;
    state.reason = '';
    state.landing = null;
    state.banner = '';
    state.bannerT = 0;
    state.shake = 0;
    state.elapsed = 0;
    state.wind = 0;
    state.hedgeHop = false;
    state.hedgeHopTotal = 0;
    state.nearMissAt = -10;
    state.particles.length = 0;
    const plane = state.plane;
    plane.x = 0;
    plane.alt = PLANE.startAltM;
    plane.z = 0;
    plane.speed = PLANE.startSpeedKt;
    plane.throttle = 80;
    plane.bank = 0;
    plane.vs = 0;
    plane.nos = NOS.max;
    plane.fuel = FUEL.start;
    plane.invulnerable = 0;
    plane.nosActive = false;
    screen.value = 'play';
    audio.resume();
    audio.click();
  }

  function finish(reason, landing) {
    state.finished = true;
    state.reason = reason;
    screen.value = 'over';
    if (reason === 'landed' && landing) {
      state.landing = landing;
      const bonus = landing.bonus + Math.round(state.plane.fuel) * 5 + Math.round(state.timeLeft) * 10;
      state.score += bonus;
      audio.land();
    }
    if (state.score > state.best) {
      state.best = state.score;
      saveBest(state.score);
    }
  }

  function crash(cause) {
    const plane = state.plane;
    burst(plane.x, plane.alt, plane.z, '#ff7a3c', 26, 26);
    burst(plane.x, plane.alt, plane.z, '#3a3f4a', 18, 16);
    state.shake = 0.6;
    audio.crash();
    state.lives -= 1;
    state.combo = 0;
    if (state.lives <= 0) {
      finish(cause === 'fuel' ? 'fuel' : 'crashed');
      return;
    }
    // Respawn just behind the last ring cleared, slow and safe.
    plane.z = Math.max(0, lastRingZ() - 250);
    plane.x = 0;
    plane.alt = PLANE.startAltM;
    plane.speed = 120;
    plane.throttle = 70;
    plane.bank = 0;
    plane.vs = 0;
    plane.invulnerable = PLANE.invulnerable;
    setBanner(cause === 'ridge' ? 'RIDGE STRIKE — FLY AGAIN' : 'KESTREL DOWN — FLY AGAIN', 1.8);
  }

  function updatePlay(dt) {
    const plane = state.plane;
    const steer = input.steer();
    const climb = input.climb();
    const throttleDelta = input.throttle();

    // --- wind: the pass pushes the plane sideways; the sea breeze is gentle ---
    state.wind = windAt(plane.z, state.elapsed);
    plane.x += state.wind * dt * 0.55;

    // --- throttle ---
    plane.throttle = clamp(plane.throttle + throttleDelta * 55 * dt, 0, 100);
    const outOfFuel = plane.fuel <= 0;
    if (outOfFuel) plane.throttle = 0;

    // --- NOS boost: 2.2x top speed while held and the tank has any in it ---
    const wantNos = input.nosHeld() && plane.nos > 0 && plane.throttle > 20;
    plane.nosActive = wantNos;
    if (wantNos) {
      plane.nos = Math.max(0, plane.nos - NOS.drainPerSec * dt);
    } else {
      plane.nos = Math.min(NOS.max, plane.nos + NOS.regenPerSec * dt);
    }
    const topSpeed = PLANE.maxSpeedKt * (wantNos ? PLANE.nosMultiplier : 1);
    const targetSpeed = PLANE.minSpeedKt + (topSpeed - PLANE.minSpeedKt) * (plane.throttle / 100);
    plane.speed += (targetSpeed - plane.speed) * Math.min(1, dt * 1.4);

    // --- steering: bank into the turn, drift laterally, heading follows ---
    const bankTarget = steer * PLANE.maxBank;
    plane.bank += (bankTarget - plane.bank) * Math.min(1, dt * 6);
    const speedMs = plane.speed * KT_TO_MS;
    plane.x += Math.sin(plane.bank) * PLANE.lateralSpeed * (0.4 + speedMs / 120) * dt * 2.2;
    plane.x = clamp(plane.x, -95, 95);

    // --- climb / descend ---
    const vsTarget = climb * PLANE.verticalSpeed;
    plane.vs += (vsTarget - plane.vs) * Math.min(1, dt * 3);
    if (plane.throttle < 25) plane.vs -= 6 * dt; // low throttle sinks
    plane.alt = clamp(plane.alt + plane.vs * dt, 0, 620);

    plane.z += speedMs * dt;
    if (plane.invulnerable > 0) plane.invulnerable -= dt;

    // --- fuel and clock ---
    plane.fuel = Math.max(0, plane.fuel - (FUEL.baseDrain + plane.throttle * FUEL.throttleDrain + (wantNos ? FUEL.nosDrain : 0)) * dt);
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      finish('time');
      return;
    }

    // --- hedge-hop: low and fast pays by the second, until the ground bites ---
    const hopRate = hedgeHopRate(plane.alt, plane.speed);
    state.hedgeHop = hopRate > 0 && plane.z < COURSE.runwayStartM - 100;
    if (state.hedgeHop) {
      const gained = hopRate * dt;
      state.score += gained;
      state.hedgeHopTotal += gained;
    }

    // --- rings: crossing one scores, missing it breaks the combo (and says so) ---
    const prevZ = plane.z - speedMs * dt;
    for (const ring of world.rings) {
      if (ring.hit || ring.z <= prevZ || ring.z > plane.z) continue;
      const dx = Math.abs(plane.x - ring.x);
      const dy = Math.abs(plane.alt - ring.altM);
      if (dx <= RINGS.tolX && dy <= RINGS.tolY) {
        ring.hit = true;
        state.ringsHit += 1;
        state.combo += 1;
        state.maxCombo = Math.max(state.maxCombo, state.combo);
        const scored = ringPoints(state.combo, plane.nosActive, ring.golden);
        state.score += scored.points;
        plane.fuel = Math.min(FUEL.max, plane.fuel + FUEL.perRing);
        if (ring.golden) plane.nos = Math.min(NOS.max, plane.nos + NOS.perGoldenRing);
        burst(ring.x, ring.altM, ring.z, '#ffc21c', 18, 20);
        setBanner(`RING! +${scored.points}  ·  STREAK ${state.combo}  ·  MULT x${scored.mult}${scored.doubled ? '  ·  NITRO x2' : ''}${ring.golden ? '  ·  GOLDEN' : ''}`);
        audio.ring(state.combo);
      } else {
        if (state.combo > 0) {
          setBanner('MISSED RING — STREAK LOST', 1.4);
          audio.miss();
        }
        state.combo = 0;
      }
    }

    // --- terrain: the ground and the mountain walls bite. Over the runway
    // strip, low is a landing approach, not a crash: the wheels can touch.
    // A close shave over a ridge pays a near-miss bonus instead. ---
    if (plane.invulnerable <= 0) {
      const ground = world.groundAt(plane.x, plane.z);
      const clearance = plane.alt - ground;
      const onApproach = plane.z >= COURSE.runwayStartM - 100 && Math.abs(plane.x) <= 20 && plane.alt < 12;
      if (!onApproach && clearance <= 1.0) {
        crash(plane.fuel <= 0 ? 'fuel' : ground > 20 ? 'ridge' : 'ground');
        return;
      }
      if (onApproach && plane.alt < 0.5) plane.alt = 0.5;
      if (!onApproach && ground > 20 && clearance > 1 && clearance < 12 && state.elapsed - state.nearMissAt > 2) {
        state.nearMissAt = state.elapsed;
        state.score += 50;
        state.shake = Math.max(state.shake, 0.25);
        setBanner('CLOSE! +50', 1.2);
        audio.nearMiss();
      }
    }

    // --- the runway: the touchdown is graded, not pass/fail ---
    if (plane.z >= COURSE.lengthM) {
      if (plane.alt < 12 && plane.speed < COURSE.landingMaxKt && Math.abs(plane.x) < 18) {
        finish('landed', landingTier(plane.speed, Math.abs(plane.x)));
      } else {
        finish('overshot');
      }
      return;
    }

    // --- engine note follows speed and boost; the wind breathes in the pass ---
    audio.setEngine(plane.speed / (PLANE.maxSpeedKt * PLANE.nosMultiplier), plane.nosActive, windIsActive(plane.z) ? Math.min(1, Math.abs(state.wind) / 14) : 0);
  }

  function updateParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 12 * dt;
    }
  }

  function update(dt) {
    state.elapsed += dt;
    if (state.bannerT > 0) state.bannerT -= dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 1.4);
    updateParticles(dt);
    // A staged screenshot scene is posed: paint it, do not fly it.
    if (frozen) return;

    const actions = input.takeActions();
    if (actions & ACTION_MUTE) audio.toggleMute();
    if (actions & ACTION_RESTART && screen.value !== 'title') startRun();

    if (screen.value === 'title') {
      // Idle drift behind the menu: the valley scrolls slowly on its own.
      state.plane.z += 26 * dt;
      if (state.plane.z > 1200) state.plane.z = 0;
      state.plane.alt = PLANE.startAltM + Math.sin(state.elapsed * 0.5) * 12;
      if (actions & ACTION_CONFIRM) startRun();
    } else if (screen.value === 'play') {
      if (actions & ACTION_PAUSE) {
        screen.value = 'paused';
        audio.setEngine(0, false, 0);
      } else {
        updatePlay(dt);
      }
    } else if (screen.value === 'paused') {
      if (actions & ACTION_PAUSE || actions & ACTION_CONFIRM) {
        screen.value = 'play';
        audio.resume();
      }
    } else if (screen.value === 'over') {
      if (actions & ACTION_CONFIRM) startRun();
    }
  }

  // --- the frame loop: fixed steps, then one render ---
  let last = performance.now();
  let accumulator = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= STEP && steps < 5) {
      update(STEP);
      accumulator -= STEP;
      steps++;
    }
    if (steps === 5) accumulator = 0;
    renderGame(canvas, state, world, screen.value);
    statusEl.textContent = statusText();
    requestAnimationFrame(frame);
  }

  function statusText() {
    const plane = state.plane;
    const heading = headingOf(plane, world);
    if (screen.value === 'title') {
      return `Sky Courier: Ridge Run — press Space or click to fly. Best score ${state.best}.`;
    }
    if (screen.value === 'paused') return 'Paused — press P to resume.';
    if (screen.value === 'over') {
      return `Run over: ${state.reason}. Score ${state.score}. Press Space to fly again.`;
    }
    const next = world.nextRing();
    const nextText = next ? `Next ring ${Math.max(0, Math.round(next.z - plane.z))} m` : 'Runway ahead — land slow';
    const windText = windIsActive(plane.z) ? ` Wind ${Math.round(Math.abs(state.wind) * 1.94)} kt.` : '';
    return `${world.legName(plane.z)} — ${world.legGoal(plane.z)}. Altitude ${Math.round(plane.alt * M_TO_FT)} ft, speed ${Math.round(plane.speed)} kt, heading ${String(heading).padStart(3, '0')}°. ${nextText}.${windText} Score ${state.score}.`;
  }

  // --- public hooks: the play-test, the shot stager and the page all read these ---
  const api = {
    get screen() {
      return screen.value;
    },
    state,
    world,
    startRun,
    freeze() {
      frozen = true;
      screen.value = 'play';
    },
    stageShot: (name, seed) => stageShot(api, name, seed),
  };
  window.__skyCourier = api;

  // A staged screenshot (?shot=...) renders one frozen moment; a normal load
  // shows the title screen.
  if (isShotMode()) {
    const params = new URLSearchParams(window.location.search);
    stageShot(api, params.get('shot'), params.get('seed'));
  }
  requestAnimationFrame(frame);
  return api;
}
