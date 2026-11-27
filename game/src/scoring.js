// Scoring rules for Sky Courier: Ridge Run. One home for every number
// the run pays, so the README, the HUD and the loop can never disagree:
// a ring pays its base times the streak multiplier (capped), doubled while
// NOS burns or on a golden ring; the runway grades the landing; flying low
// and fast pays by the second.
//
// The staged screenshots use these exact rules, doubling included:
// ring 1 with NOS burning pays 200, ring 2 pays 400, and so on — the
// banners on the shots say so, and the scores add up the same way.
import { HEDGE_HOP, LANDING, RINGS } from './config.js';

/**
 * Points for threading one ring.
 * @param {number} streak rings in a row including this one (1-based)
 * @param {boolean} nosActive NOS is burning
 * @param {boolean} golden this ring is the golden sunset gate
 */
export function ringPoints(streak, nosActive, golden) {
  const mult = Math.min(streak, RINGS.maxCombo);
  const doubled = nosActive || golden;
  return { points: RINGS.points * mult * (doubled ? 2 : 1), mult, doubled };
}

/**
 * Grade a touchdown. Speed decides the tier, the centre offset decides
 * whether the centre bonus applies. Returns the tier name and its bonus.
 */
export function landingTier(speedKt, centreOffsetM) {
  if (speedKt <= LANDING.perfectMaxKt && centreOffsetM <= LANDING.centreHalfWidthM) {
    return { tier: 'PERFECT', bonus: LANDING.perfectBonus + LANDING.centreBonus };
  }
  if (speedKt <= LANDING.goodMaxKt) {
    return { tier: 'GOOD', bonus: LANDING.goodBonus };
  }
  if (speedKt <= LANDING.hardMaxKt) {
    return { tier: 'HARD', bonus: LANDING.hardBonus };
  }
  return { tier: 'OVERSHOT', bonus: 0 };
}

/** Points per second while hedge-hopping, else 0. */
export function hedgeHopRate(altM, speedKt) {
  if (altM < HEDGE_HOP.maxAltM && speedKt > HEDGE_HOP.minSpeedKt) {
    return HEDGE_HOP.pointsPerSec;
  }
  return 0;
}
