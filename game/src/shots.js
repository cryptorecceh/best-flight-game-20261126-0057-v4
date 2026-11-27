// Staged screenshot scenes: ?shot=valley|river|pass|coast&seed=N renders one
// frozen, dramatic moment of the game — the same code path as play, with
// the state posed. Each shot sits in a different leg, at a different distance
// from its next ring, with its own bank, so the four screenshots look like
// four moments of one run, not one frame repeated. A bad shot name or a
// missing seed falls back to the valley scene with seed 1, never to a blank
// page.
//
// v4 scoring honesty (fixed from v3): every staged score and banner is
// EXACT per scoring.js, NOS doubling included. Rings pay 100 x streak
// (capped x5), doubled while NOS burns:
//   valley: 4 rings, NOS on: 200+400+600+800 = 2,000, "RING! +800" —
//          posed low (60 m) before the low 4th ring (alt 90 m, seed 7),
//          so the ring is IN the frame and the hedge-hop chip is true.
//   river:  6 rings, NOS on: 200+400+600+800+1000+1000 = 4,000, "RING! +1000"
//   river:  6 rings, NOS on: 200+400+600+800+1000+1000 = 4,000, "RING! +1000"
//   pass:  15 rings, NOS on: 3,000 + 10 x 1,000 = 13,000, "RING! +1000"
//   coast: 22 rings, NOS off: 100+200+300+400 + 18 x 500 = 10,000, with the
//          golden gate (+1,000) still ahead and the runway beyond it.
// The valley shot flies LOW AND FAST (60 m, 215 kt) so the "LOW & FAST +25/s"
// chip shows — the hedge-hop mechanic is visible, not just described.
import { COURSE } from './config.js';
import { hashSeed } from './random.js';
import { windAt } from './wind.js';

export function isShotMode() {
  return new URLSearchParams(window.location.search).has('shot');
}

const SHOTS = {
  // z sits this far before the next ring; the plane flies below the ring,
  // climbing to it, so the ring stands big against the sky beside the plane.
  valley: { z: 1640, altBelowRing: 55, xOff: -40, bank: 0.35, speed: 210, throttle: 85, nos: 70, fuel: 94, score: 2000, combo: 4, rings: 4, time: 165, vs: 3, nosActive: true, hedgeHop: true, lowAlt: 60, banner: 'RING! +800  ·  STREAK 4  ·  MULT x4  ·  NITRO x2' },
  river: { z: 2670, altBelowRing: 70, xOff: -35, bank: 0.18, speed: 230, throttle: 90, nos: 55, fuel: 86, score: 4000, combo: 6, rings: 6, time: 150, vs: 1, nosActive: true, banner: 'RING! +1000  ·  STREAK 6  ·  MULT x5  ·  NITRO x2' },
  pass: { z: 5560, altBelowRing: 45, xOff: -30, bank: 0.22, speed: 260, throttle: 95, nos: 40, fuel: 78, score: 13000, combo: 15, rings: 15, time: 130, vs: 0, nosActive: true, windT: 14.5, banner: 'RING! +1000  ·  STREAK 15  ·  MULT x5  ·  NITRO x2' },
  // The coast shot stops BEFORE the golden gate: 22 rings banked, the
  // golden ring big ahead, the runway whole beyond it, the plane low and
  // slow on final. Score 10,000 = the first 22 rings, NOS off.
  coast: { z: 8100, altBelowRing: 0, xOff: -14, bank: 0, speed: 118, throttle: 40, nos: 60, fuel: 90, score: 10000, combo: 22, rings: 22, time: 113, vs: -5, nosActive: false, banner: 'GOLDEN GATE AHEAD  ·  +1000  ·  LAND SLOW' },
};

/** Pose the game for a screenshot. `api` is the object main.js exposes. */
export function stageShot(api, name, seedParam) {
  const shot = SHOTS[name] || SHOTS.valley;
  const seedText = seedParam === null || seedParam === undefined || seedParam === '' ? '1' : seedParam;
  void hashSeed(seedText); // validates the parameter; the valley was built from it at boot

  const { state, world } = api;
  world.resetRings();
  // Mark the rings before this shot as already flown, so the HUD counts and
  // the next ring ahead are honest for this moment in the run.
  for (const ring of world.rings) {
    if (ring.z < shot.z - 100) ring.hit = true;
  }
  state.score = shot.score;
  state.combo = shot.combo;
  state.maxCombo = shot.combo;
  state.ringsHit = shot.rings;
  state.lives = 3;
  state.timeLeft = shot.time;
  state.finished = false;
  state.reason = '';
  state.landing = null;
  state.banner = shot.banner;
  state.bannerT = 30;
  state.shake = 0;
  state.particles.length = 0;
  state.hedgeHop = shot.hedgeHop === true;
  state.hedgeHopTotal = shot.hedgeHop === true ? 125 : 0;
  const plane = state.plane;
  // Put the plane below and to the side of the next ring, climbing to it,
  // so the ring reads as a target ahead — big against the sky, never hidden
  // behind the fuselage. The coast shot flies low on final instead.
  const next = world.nextRing(shot.z);
  if (next && name !== 'coast') {
    // The valley shot skims the fields at a fixed 60 m (hedge-hop height)
    // and climbs to the ring; other shots sit just below their ring.
    plane.alt = shot.lowAlt !== undefined ? shot.lowAlt : next.altM - shot.altBelowRing;
    plane.x = Math.max(-44, Math.min(44, next.x + shot.xOff));
  } else {
    plane.x = 0;
    plane.alt = 55;
  }
  plane.z = shot.z;
  plane.speed = shot.speed;
  plane.throttle = shot.throttle;
  plane.bank = shot.bank;
  plane.vs = shot.vs;
  plane.nos = shot.nos;
  plane.fuel = shot.fuel;
  plane.invulnerable = 0;
  plane.nosActive = shot.nosActive;
  // The pass blows while the shot is posed, so its wind chip shows a real
  // gust from the wind model (the strongest gust near this position).
  state.wind = windAt(shot.z, shot.windT ?? 10);

  // The shot is a posed moment: freeze the simulation by parking the screen
  // on 'play' with the clock held — the render loop keeps painting it.
  api.freeze();
  // Tell the screenshot tool the scene is ready once it has painted.
  let painted = 0;
  const mark = () => {
    painted++;
    if (painted >= 3) window.__shotReady = true;
  };
  // The main loop renders every frame; hook the next frames via rAF.
  requestAnimationFrame(mark);
  requestAnimationFrame(mark);
  requestAnimationFrame(mark);
  return shot;
}
