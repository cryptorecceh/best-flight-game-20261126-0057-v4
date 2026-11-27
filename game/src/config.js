// Sky Courier: Ridge Run — every tuning number and colour in one place.
// The playfield is a fixed 1280x720 logical area; the renderer scales it to
// the window, so no rule below depends on the screen size. World units are
// metres for x (lateral) and z (forward), metres for altitude internally;
// the HUD shows altitude in feet and speed in knots.
//
// v4 vs v3: the course now BENDS — every leg has its own true course
// bearing, so the heading on the HUD is the bearing the plane actually
// flies (plus bank while turning), not a number derived from lateral
// position. Rings in the pass are bigger (the corridor is narrow and the
// walls are close), and the ground is painted as a handful of LARGE soft
// fields per leg, never a per-cell quilt.
export const FIELD = { width: 1280, height: 720, horizonY: 292, panelY: 616 };

/** The simulation's fixed step, in seconds: 60 updates a second. */
export const STEP = 1 / 60;

/** Knots <-> metres per second. */
export const KT_TO_MS = 0.514444;
export const M_TO_FT = 3.28084;

export const PLANE = {
  startAltM: 150,
  startSpeedKt: 150,
  minSpeedKt: 60,
  maxSpeedKt: 240,
  /** NOS multiplies top speed by this (240 kt -> 528 kt). */
  nosMultiplier: 2.2,
  /** Lateral speed at full bank, metres per second. */
  lateralSpeed: 30,
  /** Vertical speed at full climb/descent, metres per second. */
  verticalSpeed: 20,
  maxBank: 0.62,
  /** Seconds of invulnerability after a respawn. */
  invulnerable: 2.0,
};

export const NOS = {
  max: 100,
  drainPerSec: 26,
  regenPerSec: 6,
  /** A golden ring refills this much NOS (normal rings refill fuel only). */
  perGoldenRing: 25,
};

export const FUEL = {
  max: 100,
  start: 100,
  /** Drain per second at zero throttle, plus this per throttle percent. */
  baseDrain: 0.32,
  throttleDrain: 0.0055,
  nosDrain: 0.35,
  /** A normal ring refills this much fuel. */
  perRing: 8,
};

export const RINGS = {
  /** Total rings on the course (23 across four legs). */
  total: 23,
  /** Points for a clean ring, before the streak multiplier. */
  points: 100,
  /** Hit tolerance: metres lateral, metres vertical. */
  tolX: 26,
  tolY: 55,
  /** The streak multiplier caps at x5 (the banner shows streak AND mult). */
  maxCombo: 5,
  /** Drawn radius of a ring, in metres — the pass rings are drawn bigger. */
  radiusM: 30,
  radiusPassM: 38,
};

/** Hedge-hop: flying low and fast pays, but the ground is right there. */
export const HEDGE_HOP = {
  /** Below this altitude (metres, ~250 ft) the bonus runs. */
  maxAltM: 76,
  /** Above this speed (knots) the bonus runs. */
  minSpeedKt: 120,
  /** Points per second while low and fast. */
  pointsPerSec: 25,
};

/** Landing quality: the runway grades the touchdown, it is not pass/fail. */
export const LANDING = {
  perfectMaxKt: 110,
  goodMaxKt: 130,
  hardMaxKt: 145,
  perfectBonus: 800,
  goodBonus: 500,
  hardBonus: 200,
  /** Touchdown inside this lateral offset counts as centred. */
  centreHalfWidthM: 8,
  /** A centred touchdown inside the zone bars pays this extra. */
  centreBonus: 100,
};

export const COURSE = {
  lengthM: 9000,
  /** Four legs, each 2250 m, each with its own goal, palette, weather and
   *  TRUE COURSE BEARING — the valley bends, so the heading is real. */
  legs: [
    {
      name: 'GREEN VALLEY',
      goal: 'Thread 6 rings — learn the plane',
      corridor: 70,
      headingDeg: 8,
      skyTop: '#3d7cc2', skyMid: '#7ec3ee', skyHorizon: '#d8f0fb',
      sun: '#fff6c8', sunGlow: 'rgba(255, 240, 170, 0.5)',
      mountainFar: '#a8bdd4', mountainNear: '#7d94b0', mountainWall: '#5d748f',
      snow: '#f2f6fa',
      fields: ['#69a34d', '#7fb85c', '#578a41', '#93c468'],
      groundTop: '#a8bf7a', groundMid: '#6f9a44', groundBottom: '#4c7a34',
      haze: 'rgba(190, 220, 240, 0.22)',
    },
    {
      name: 'RIVER CROSSING',
      goal: 'Follow the river — 6 rings over water',
      corridor: 62,
      headingDeg: 352,
      skyTop: '#2f6fc0', skyMid: '#6fb2ec', skyHorizon: '#cfe8fa',
      sun: '#fff3b0', sunGlow: 'rgba(255, 235, 150, 0.5)',
      mountainFar: '#9db0c8', mountainNear: '#7488a6', mountainWall: '#54688a',
      snow: '#eef3f8',
      fields: ['#7fae4e', '#c9a13b', '#5d8a3c', '#d9b45a'],
      groundTop: '#b3bd78', groundMid: '#7a9a4a', groundBottom: '#4c7a34',
      haze: 'rgba(185, 215, 240, 0.2)',
    },
    {
      name: 'MOUNTAIN PASS',
      goal: 'Mind the wind — 6 rings through the pass',
      corridor: 48,
      headingDeg: 18,
      skyTop: '#5d7290', skyMid: '#8fa3bd', skyHorizon: '#d3dde8',
      sun: '#f4ead0', sunGlow: 'rgba(230, 225, 200, 0.4)',
      mountainFar: '#8b93a3', mountainNear: '#6a7284', mountainWall: '#454c5e',
      snow: '#f4f6f8',
      fields: ['#7d8a5a', '#8a7a5a', '#6b7a4a', '#9a8a62'],
      groundTop: '#9a9a72', groundMid: '#7a8a5a', groundBottom: '#55663e',
      haze: 'rgba(200, 205, 215, 0.22)',
    },
    {
      name: 'SUNSET COAST',
      goal: 'Land on the runway — slow and centred',
      corridor: 64,
      headingDeg: 2,
      skyTop: '#7a2d12', skyMid: '#e0641f', skyHorizon: '#ffb347',
      sun: '#fff3c4', sunGlow: 'rgba(255, 190, 90, 0.55)',
      mountainFar: '#8a6a7d', mountainNear: '#6b4a63', mountainWall: '#4a2f4d',
      snow: '#f4e9e2',
      fields: ['#c9a13b', '#d9b45a', '#5d8a3c', '#b8932f'],
      groundTop: '#c99a4a', groundMid: '#7a9a4a', groundBottom: '#4c7a34',
      haze: 'rgba(255, 180, 90, 0.18)',
    },
  ],
  legLengthM: 2250,
  runwayStartM: 8600,
  runwayWidthM: 36,
  /** Landing counts when slower than this (knots) over the runway. */
  landingMaxKt: 145,
  /** Mission clock, seconds. */
  timeLimitSec: 180,
};

export const LIVES = 3;

/** Shared colours that do not change per leg. */
export const PALETTE = {
  river: '#3f8fd2',
  riverDeep: '#2f6fb0',
  riverBank: '#d9c078',
  sea: '#2f7fb8',
  seaGlitter: 'rgba(255, 240, 180, 0.75)',
  sand: '#d9b96a',
  runway: '#3d3a38',
  runwayMark: '#e8e2d2',
  ring: '#ffc21c',
  ringGlow: 'rgba(255, 194, 28, 0.8)',
  golden: '#ffd94a',
  planeWhite: '#f4f1e8',
  planeShade: '#cfc8b4',
  planeRed: '#d23b2e',
  planeCanopy: '#7fd4e8',
  panel: '#141a26',
  panelEdge: '#2a3348',
  text: '#f2ede2',
  muted: '#9aa5b5',
  hudChip: 'rgba(12, 16, 26, 0.72)',
  cyan: '#5fd4ff',
  green: '#7be495',
  amber: '#ffb02e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'sky-courier-ridge.best';
