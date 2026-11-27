// Wind over the valley: calm on the first two legs, gusting through the
// Mountain Pass, a steady sea breeze on the Sunset Coast. The gusts are pure
// functions of course position and time, so a run replays the same wind.
// The value is a lateral push in metres per second; positive pushes right.
import { COURSE } from './config.js';

function legAt(z) {
  return Math.max(0, Math.min(3, Math.floor(z / COURSE.legLengthM)));
}

/** Lateral wind in m/s at course position z and clock time t (seconds). */
export function windAt(z, t) {
  const leg = legAt(z);
  if (leg === 0 || leg === 1) return 0;
  if (leg === 2) {
    const base = 7 * Math.sin(z / 260 + t * 0.6);
    const gust = 6 * Math.sin(z / 90 + t * 1.7);
    const pulse = 3 * Math.sin(z / 41 + t * 3.1);
    const wind = base + gust + pulse;
    return Math.max(-14, Math.min(14, wind));
  }
  return 3; // leg 3: a steady sea breeze off the water, pushing right.
}

/** True while the wind is strong enough for the pilot to feel it. */
export function windIsActive(z) {
  return legAt(z) === 2;
}

/** The HUD text for a wind value: arrow, speed in knots, e.g. "WIND ◀ 14 KT". */
export function windLabel(windMs) {
  const kt = Math.round(Math.abs(windMs) * 1.94384);
  const arrow = windMs < -0.5 ? '◀' : windMs > 0.5 ? '▶' : '·';
  return `WIND ${arrow} ${kt} KT`;
}
