// Sky Courier: Ridge Run — the canvas renderer. A chase view over a
// pseudo-3D valley: each leg has its own sky and ground palette, so the
// morning valley, the river, the mountain pass and the sunset coast each
// read at a glance. The ground is painted as a gradient plus a handful of
// LARGE soft fields per leg (never a quilt), then the river, the pass
// walls, the runway, rings, town, trees, the Kestrel, particles, speed
// lines, the HUD chips and one slim instrument strip.
//
// v4 fixes over v3 (see PLAN.md): terrain is large soft fields, not a
// checkerboard; each leg has its own GEOMETRY (river S-bend, pass walls,
// coast sea + full runway), not just its own palette; clouds are streaks
// in the upper band only, so a ring is never half-hidden; the pass rings
// are bigger; the runway is fully visible on final (the plane sits left
// of the centreline); the bottom panel lost its duplicated gauges and
// micro-icons; the plane has panel lines, a canopy frame and a real
// propeller disc; the wind is VISIBLE (tilted horizon, slanted clouds
// and trees, a crabbed plane); the heading is the leg's true course
// bearing, not a number derived from lateral position.
import { COURSE, FIELD, M_TO_FT, PALETTE, PLANE } from './config.js';
import { windLabel, windIsActive } from './wind.js';

const W = FIELD.width;
const H = FIELD.height;
const CX = W / 2;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Parse a #rrggbb or rgb(r,g,b) colour into [r, g, b]. */
function parseColor(c) {
  if (c[0] === '#') {
    const v = parseInt(c.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  const m = c.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
}

/** Blend two colours (either #rrggbb or rgb(r,g,b)) by t (0 = a, 1 = b). */
function mixHex(a, b, t) {
  const pa = parseColor(a);
  const pb = parseColor(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

/**
 * The palette at course position z: the current leg's colours, crossfading
 * into the next leg's over the last 400 m so the valley changes gradually.
 */
function paletteFor(z) {
  const leg = Math.max(0, Math.min(3, Math.floor(z / COURSE.legLengthM)));
  const next = Math.min(3, leg + 1);
  const intoLeg = z - leg * COURSE.legLengthM;
  const t = leg === 3 ? 0 : clamp((intoLeg - (COURSE.legLengthM - 400)) / 400, 0, 1);
  const a = COURSE.legs[leg];
  const b = COURSE.legs[next];
  return {
    leg,
    skyTop: mixHex(a.skyTop, b.skyTop, t),
    skyMid: mixHex(a.skyMid, b.skyMid, t),
    skyHorizon: mixHex(a.skyHorizon, b.skyHorizon, t),
    sun: mixHex(a.sun, b.sun, t),
    sunGlow: t < 0.5 ? a.sunGlow : b.sunGlow,
    mountainFar: mixHex(a.mountainFar, b.mountainFar, t),
    mountainNear: mixHex(a.mountainNear, b.mountainNear, t),
    mountainWall: mixHex(a.mountainWall, b.mountainWall, t),
    snow: mixHex(a.snow, b.snow, t),
    groundTop: mixHex(a.groundTop, b.groundTop, t),
    groundMid: mixHex(a.groundMid, b.groundMid, t),
    groundBottom: mixHex(a.groundBottom, b.groundBottom, t),
    haze: t < 0.5 ? a.haze : b.haze,
  };
}

function chip(ctx, x, y, w, label, value, color) {
  ctx.fillStyle = PALETTE.hudChip;
  roundRect(ctx, x, y, w, 56, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '600 11px ' + 'system-ui, sans-serif';
  ctx.fillText(label, x + 12, y + 19);
  ctx.fillStyle = color;
  ctx.font = '800 26px ' + 'system-ui, sans-serif';
  ctx.fillText(value, x + 12, y + 45);
}

export function renderGame(canvas, state, world, screen) {
  const ctx = canvas.getContext('2d');
  const plane = state.plane;
  const elapsed = state.elapsed;
  const nos = plane.nosActive;
  const focal = 430 * (nos ? 0.93 : 1);
  // The horizon tilts with the bank — and in the pass the wind tilts it
  // further, so the gusts are visible even before the wind chip is read.
  const windTilt = windIsActive(plane.z) ? state.wind * 0.9 : 0;
  const horizonY = FIELD.horizonY + (nos ? 7 : 0) + plane.bank * 18 + windTilt;
  const camX = plane.x;
  const camY = plane.alt + 6;
  const camZ = plane.z;
  const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 16 : 0;
  const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 12 : 0;
  const pal = paletteFor(camZ);
  const leg = pal.leg;

  function project(x, y, z) {
    const dz = z - camZ;
    if (dz < 2) return null;
    const scale = focal / dz;
    return {
      x: CX + (x - camX) * scale + shakeX,
      y: horizonY + (camY - y) * scale + shakeY,
      scale,
      dz,
    };
  }

  // --- sky: this leg's gradient, sun with glow, drifting streak clouds ---
  const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
  sky.addColorStop(0, pal.skyTop);
  sky.addColorStop(0.55, pal.skyMid);
  sky.addColorStop(1, pal.skyHorizon);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, horizonY + 2);

  const glow = ctx.createRadialGradient(1005, 128, 8, 1005, 128, 120);
  glow.addColorStop(0, pal.sunGlow);
  glow.addColorStop(1, 'rgba(255, 190, 90, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(880, 0, 250, 260);
  ctx.fillStyle = pal.sun;
  ctx.beginPath();
  ctx.arc(1005, 128, 32, 0, Math.PI * 2);
  ctx.fill();

  // --- mountain ridges: three layers, far pale and hazy, near dark and
  // tall, so the sky has depth instead of one flat silhouette. Snow caps
  // the near ridge's highest summits when flying the pass. ---
  for (const ridge of world.ridges) {
    const ridgeY = (sx) => {
      const wx = sx - camX * ridge.parallax * 5;
      return horizonY - ridge.base
        - ridge.amp1 * (0.5 + 0.5 * Math.sin(wx * ridge.freq1 + ridge.phase1))
        - ridge.amp2 * (0.5 + 0.5 * Math.sin(wx * ridge.freq2 + ridge.phase2));
    };
    ctx.fillStyle = ridge.layer === 0 ? pal.mountainFar : ridge.layer === 1 ? pal.mountainNear : pal.mountainWall;
    ctx.beginPath();
    ctx.moveTo(-40, horizonY + 2);
    for (let sx = -40; sx <= W + 40; sx += 20) ctx.lineTo(sx, ridgeY(sx));
    ctx.lineTo(W + 40, horizonY + 2);
    ctx.closePath();
    ctx.fill();
    if (leg === 2 && ridge.layer === 2) {
      const samples = [];
      for (let sx = 0; sx <= W; sx += 20) samples.push({ x: sx, y: ridgeY(sx) });
      samples.sort((a, b) => a.y - b.y);
      ctx.fillStyle = pal.snow;
      for (const peak of samples.slice(0, 3)) {
        ctx.beginPath();
        ctx.moveTo(peak.x - 34, peak.y + 34);
        ctx.lineTo(peak.x, peak.y);
        ctx.lineTo(peak.x + 34, peak.y + 34);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // --- clouds: long thin STREAKS in the upper band only (y < 150), never
  // in the ring lane — a ring is never half-hidden behind a cloud. In the
  // pass they slant with the wind. ---
  const cloudSlant = leg === 2 ? clamp(state.wind * 0.02, -0.28, 0.28) : 0;
  ctx.fillStyle = leg === 2 ? 'rgba(235, 238, 242, 0.85)' : 'rgba(255, 244, 224, 0.9)';
  for (const cloud of world.clouds) {
    const cx = ((cloud.x + elapsed * cloud.speed) % 1360) - 40;
    const cy = cloud.y;
    const s = cloud.scale;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(cloudSlant);
    ctx.beginPath();
    ctx.ellipse(0, 0, 62 * s, 9 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(-34 * s, 4 * s, 30 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(36 * s, 4 * s, 32 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // --- ground: a warm base so no corner stays dark, then the ground is
  // painted slice by slice. The colour of a cell comes from the LARGE field
  // it sits in (hundreds of metres across), never from a per-cell hash —
  // that is what killed the v3 quilt. Narrow features (runway, river,
  // coast) are tested by overlap with the segment, not by its centre. ---
  const groundBase = ctx.createLinearGradient(0, horizonY, 0, FIELD.panelY);
  groundBase.addColorStop(0, pal.groundTop);
  groundBase.addColorStop(0.45, pal.groundMid);
  groundBase.addColorStop(1, pal.groundBottom);
  ctx.fillStyle = groundBase;
  ctx.fillRect(0, horizonY, W, FIELD.panelY - horizonY);

  function fieldColorAt(x, z) {
    for (const f of world.fields) {
      if (z >= f.z0 && z < f.z1 && x >= f.x0 && x < f.x1) return f.color;
    }
    return null;
  }

  const SLICES = 30;
  const sliceZ = [];
  for (let i = 0; i <= SLICES; i++) sliceZ.push(camZ + 8 + i * i * 0.9);
  const SEGMENTS = 12;
  for (let i = SLICES - 1; i >= 0; i--) {
    const z0 = sliceZ[i];
    const z1 = sliceZ[i + 1];
    const zMid = (z0 + z1) / 2;
    const legMid = world.legAt(zMid);
    const inRunway = zMid >= COURSE.runwayStartM && zMid <= COURSE.lengthM;
    const rx = world.riverX(zMid);
    const scaleMid = focal / Math.max(2, zMid - camZ);
    const xLeft = camX + (-40 - CX) / scaleMid;
    const xRight = camX + (W + 40 - CX) / scaleMid;
    const segW = (xRight - xLeft) / SEGMENTS;
    for (let j = 0; j < SEGMENTS; j++) {
      const x0 = xLeft + j * segW;
      const x1 = x0 + segW;
      const xMid = (x0 + x1) / 2;
      const a = project(x0, 0, z0);
      const b = project(x1, 0, z0);
      const c = project(x1, 0, z1);
      const d = project(x0, 0, z1);
      if (!a || !b || !c || !d) continue;
      if (a.y < horizonY + 1 && b.y < horizonY + 1 && c.y < horizonY + 1 && d.y < horizonY + 1) continue;
      let color;
      const overlaps = (lo, hi) => x0 < hi && x1 > lo;
      if (inRunway && overlaps(-COURSE.runwayWidthM / 2, COURSE.runwayWidthM / 2)) {
        const centre = overlaps(-2, 2) && Math.floor(zMid / 40) % 2 === 0;
        const zone = (zMid > 8660 && zMid < 8720) || (zMid > 8760 && zMid < 8820);
        const zoneBar = zone && (xMid < -6 || xMid > 6) && Math.abs(xMid) < 14;
        color = zoneBar ? PALETTE.runwayMark : centre ? PALETTE.runwayMark : PALETTE.runway;
      } else if (legMid === 3 && x1 < -44) {
        color = PALETTE.sea;
      } else if (legMid === 3 && overlaps(-44, -30)) {
        color = PALETTE.sand;
      } else if (rx !== null && overlaps(rx - 58, rx + 58)) {
        color = overlaps(rx - 12, rx + 12) ? PALETTE.riverDeep : overlaps(rx - 48, rx + 48) ? PALETTE.river : PALETTE.riverBank;
      } else {
        // Large-field colour, falling back to the ground gradient's mid
        // tone when no field covers this cell (e.g. past the last field).
        color = fieldColorAt(xMid, zMid) || pal.groundMid;
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.lineTo(d.x, d.y);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Hedgerows: thin dark lines along the edges of the large fields, drawn
  // as projected polylines — the scale cue that makes a field read as a
  // field instead of a flat colour block. Kept faint: a strong line across
  // the whole frame reads as a scratch, not a hedge.
  ctx.strokeStyle = 'rgba(30, 50, 22, 0.3)';
  ctx.lineWidth = 1.5;
  for (const f of world.fields) {
    if (f.z1 < camZ + 10 || f.z0 > camZ + 900) continue;
    for (const edgeX of [f.x0, f.x1]) {
      const p0 = project(edgeX, 0, Math.max(f.z0, camZ + 10));
      const p1 = project(edgeX, 0, Math.min(f.z1, camZ + 900));
      if (!p0 || !p1 || p0.y < horizonY + 2) continue;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
  }
  // Sun glitter on the sea (leg 4): shimmering horizontal streaks.
  if (leg === 3) {
    ctx.fillStyle = PALETTE.seaGlitter;
    for (let i = 0; i < 8; i++) {
      const gz = camZ + 120 + i * 90;
      const gp = project(-80, 0, gz);
      if (!gp || gp.y < horizonY + 4) continue;
      const w = 60 + ((i * 37 + Math.floor(elapsed * 3)) % 40);
      ctx.fillRect(gp.x - w / 2, gp.y, w, 2.5);
    }
  }
  // Atmospheric haze over the far ground.
  const haze = ctx.createLinearGradient(0, horizonY, 0, horizonY + 90);
  haze.addColorStop(0, pal.haze);
  haze.addColorStop(1, 'rgba(255, 180, 90, 0)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, horizonY, W, 90);

  // --- pass walls: two big converging polygons with snow caps and rock
  // strata, closing in around the corridor — the pass HAS a pass now.
  // The walls start 150 m ahead (never engulfing the camera), wear a
  // vertical gradient (pale crest, dark base) so they read as rock, not
  // flat slabs, and carry snow only where the crest is actually on screen.
  if (leg === 2 || (camZ > COURSE.legLengthM * 2 - 500 && camZ < COURSE.legLengthM * 3)) {
    for (const side of [-1, 1]) {
      const wallTop = [];
      const wallBase = [];
      for (let z = Math.max(camZ + 150, COURSE.legLengthM * 2); z <= camZ + 900; z += 60) {
        const halfW = world.wallHalfWidth(z);
        const h = world.wallHeight(z);
        const top = project(side * halfW, h, z);
        const base = project(side * halfW, 0, z);
        if (top && base) { wallTop.push(top); wallBase.push(base); }
      }
      if (wallTop.length < 2) continue;
      let topY = Infinity;
      let baseY = -Infinity;
      for (const p of wallTop) topY = Math.min(topY, p.y);
      for (const p of wallBase) baseY = Math.max(baseY, p.y);
      const wallGrad = ctx.createLinearGradient(0, Math.max(0, topY), 0, baseY);
      wallGrad.addColorStop(0, mixHex(pal.mountainWall, pal.mountainNear, 0.45));
      wallGrad.addColorStop(1, pal.mountainWall);
      ctx.fillStyle = wallGrad;
      ctx.beginPath();
      ctx.moveTo(wallBase[0].x, wallBase[0].y);
      for (const p of wallTop) ctx.lineTo(p.x, p.y);
      for (let i = wallBase.length - 1; i >= 0; i--) ctx.lineTo(wallBase[i].x, wallBase[i].y);
      ctx.closePath();
      ctx.fill();
      // Snow on the wall's three highest crest peaks — caps, not a band
      // along the whole crest (a band reads as a white slash).
      const peaks = [...wallTop].sort((a, b) => a.y - b.y).slice(0, 3);
      ctx.fillStyle = pal.snow;
      for (const peak of peaks) {
        if (peak.y < 0 || peak.y > horizonY) continue;
        ctx.beginPath();
        ctx.moveTo(peak.x - 42, peak.y + 30);
        ctx.lineTo(peak.x, peak.y);
        ctx.lineTo(peak.x + 42, peak.y + 30);
        ctx.closePath();
        ctx.fill();
      }
      // Rock strata: two faint diagonal bands down the wall face.
      ctx.strokeStyle = 'rgba(20, 18, 28, 0.22)';
      ctx.lineWidth = 2;
      for (const frac of [0.35, 0.65]) {
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < wallTop.length; i++) {
          const x = wallTop[i].x + (wallBase[i].x - wallTop[i].x) * frac;
          const y = wallTop[i].y + (wallBase[i].y - wallTop[i].y) * frac;
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
  }

  // --- runway edge lights + threshold bars ---
  if (camZ < COURSE.lengthM && camZ + 900 > COURSE.runwayStartM) {
    ctx.fillStyle = '#ff5a3c';
    for (let z = COURSE.runwayStartM; z <= COURSE.lengthM; z += 60) {
      for (const side of [-1, 1]) {
        const p = project(side * (COURSE.runwayWidthM / 2 + 2), 0, z);
        if (!p || p.y < horizonY + 2 || p.y > FIELD.panelY) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.5, 3.2 * p.scale), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // The windsock by the threshold shows the pass wind's direction.
    const sock = project(26, 0, COURSE.runwayStartM - 40);
    if (sock && sock.y > horizonY + 2 && sock.y < FIELD.panelY) {
      const s = Math.max(0.4, sock.scale);
      ctx.strokeStyle = '#e8e2d2';
      ctx.lineWidth = Math.max(1.5, 2.5 * s);
      ctx.beginPath();
      ctx.moveTo(sock.x, sock.y);
      ctx.lineTo(sock.x, sock.y - 26 * s);
      ctx.stroke();
      const dir = state.wind >= 0 ? 1 : -1;
      ctx.fillStyle = '#ff7a3c';
      ctx.beginPath();
      ctx.moveTo(sock.x, sock.y - 26 * s);
      ctx.lineTo(sock.x + dir * 22 * s, sock.y - 22 * s);
      ctx.lineTo(sock.x + dir * 22 * s, sock.y - 14 * s);
      ctx.lineTo(sock.x, sock.y - 18 * s);
      ctx.closePath();
      ctx.fill();
    }
  }

  // --- town houses on the river's east bank (leg 2), with the church tower ---
  const drawHouse = (hx, hz, hw, hh, lit) => {
    const base = project(hx, 0, hz);
    const top = project(hx, hh, hz);
    if (!base || !top || base.y < horizonY + 2) return;
    const w = hw * base.scale;
    ctx.fillStyle = '#7a5a44';
    ctx.fillRect(base.x - w / 2, top.y, w, base.y - top.y);
    ctx.fillStyle = '#a33d2e';
    ctx.beginPath();
    ctx.moveTo(base.x - w / 2 - 2, top.y);
    ctx.lineTo(base.x, top.y - 7 * base.scale);
    ctx.lineTo(base.x + w / 2 + 2, top.y);
    ctx.closePath();
    ctx.fill();
    if (lit) {
      ctx.fillStyle = '#ffd76a';
      ctx.fillRect(base.x - 3, top.y + (base.y - top.y) * 0.45, 6, 6);
      ctx.fillRect(base.x + 4, top.y + (base.y - top.y) * 0.45, 6, 6);
    }
  };
  for (const house of world.town) {
    if (house.z < camZ + 10 || house.z > camZ + 900) continue;
    drawHouse(house.x, house.z, house.w, house.h, house.lit);
  }
  if (world.church.z > camZ + 10 && world.church.z < camZ + 900) {
    drawHouse(world.church.x, world.church.z, world.church.w, world.church.h, true);
    const base = project(world.church.x, 0, world.church.z);
    const top = project(world.church.x, world.church.h + 14, world.church.z);
    if (base && top && base.y > horizonY + 2) {
      const w = world.church.w * base.scale;
      ctx.fillStyle = '#5a4636';
      ctx.fillRect(base.x - w * 0.28, top.y, w * 0.56, base.y - top.y);
      ctx.fillStyle = '#a33d2e';
      ctx.beginPath();
      ctx.moveTo(base.x - w * 0.34, top.y);
      ctx.lineTo(base.x, top.y - 10 * base.scale);
      ctx.lineTo(base.x + w * 0.34, top.y);
      ctx.closePath();
      ctx.fill();
    }
  }

  // --- trees: capped on screen (a tree right by the camera is a trunk and
  // a canopy, never a giant ball) and skipped when too close to see whole.
  // In the pass they lean with the wind — the gusts are visible on the
  // ground, not only in a chip. ---
  const treeLean = leg === 2 ? clamp(state.wind * 0.03, -0.35, 0.35) : 0;
  for (const tree of world.trees) {
    if (tree.z < camZ + 30 || tree.z > camZ + 800) continue;
    const base = project(tree.x, 0, tree.z);
    if (!base || base.y < horizonY + 2 || base.y > FIELD.panelY + 10) continue;
    const s = Math.min(tree.size * base.scale, 30);
    if (s < 1.5) continue;
    const leanX = treeLean * s * 1.6;
    if (!tree.pine) {
      ctx.fillStyle = '#5a4632';
      ctx.fillRect(base.x - Math.max(1, s * 0.08), base.y - s * 0.9, Math.max(2, s * 0.16), s * 0.9);
    }
    ctx.fillStyle = tree.pine ? '#2e5d2a' : '#4c7a34';
    if (tree.pine) {
      ctx.beginPath();
      ctx.moveTo(base.x + leanX, base.y - s * 2.2);
      ctx.lineTo(base.x - s * 0.8, base.y);
      ctx.lineTo(base.x + s * 0.8, base.y);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(base.x + leanX, base.y - s, s * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- rings: big, glowing, impossible to miss. The next three show so the
  // course reads ahead; the nearest gets a pulsing halo. The small
  // "RING · NNN m" label under the ring is GONE (v3): it was unreadable at
  // 300 px and duplicated the NEXT RING pill above. ---
  const upcoming = world.nextRings(camZ, 3);
  for (let k = upcoming.length - 1; k >= 0; k--) {
    const ring = upcoming[k];
    const p = project(ring.x, ring.altM, ring.z);
    if (!p || p.y < 40 || p.y > FIELD.panelY) continue;
    const r = ring.radius * p.scale;
    if (r < 3) continue;
    const isNext = k === 0;
    const alpha = isNext ? 1 : 0.45;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = PALETTE.ringGlow;
    ctx.shadowBlur = isNext ? 22 : 10;
    ctx.strokeStyle = ring.golden ? PALETTE.golden : PALETTE.ring;
    ctx.lineWidth = Math.max(3, r * 0.14);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 240, 180, 0.9)';
    ctx.lineWidth = Math.max(1.5, r * 0.05);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    if (isNext) {
      const pulse = 1 + Math.sin(elapsed * 4) * 0.08;
      ctx.strokeStyle = 'rgba(255, 194, 28, 0.5)';
      ctx.lineWidth = Math.max(2, r * 0.06);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * pulse * 1.25, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // --- the Kestrel's shadow on the ground below, shrinking with altitude ---
  const shadow = project(plane.x, 0, plane.z + 26);
  if (shadow && shadow.y > horizonY + 2 && shadow.y < FIELD.panelY) {
    const alpha = clamp(0.34 - plane.alt / 1400, 0.06, 0.34);
    ctx.fillStyle = `rgba(20, 16, 12, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(shadow.x, shadow.y, 78 * shadow.scale + 10, 14 * shadow.scale + 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // --- particles (ring bursts, crash debris) ---
  for (const p of state.particles) {
    const sp = project(p.x, p.y, p.z);
    if (!sp || sp.y < 0 || sp.y > FIELD.panelY) continue;
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, p.size * sp.scale + 1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // --- landing light cone on the approach: a soft beam down the runway ---
  if (camZ > COURSE.runwayStartM - 700 && plane.alt < 110) {
    const beam = ctx.createLinearGradient(0, 500, 0, FIELD.panelY);
    beam.addColorStop(0, 'rgba(255, 244, 200, 0.20)');
    beam.addColorStop(1, 'rgba(255, 244, 200, 0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(CX - 40, 500);
    ctx.lineTo(CX + 40, 500);
    ctx.lineTo(CX + 130, FIELD.panelY);
    ctx.lineTo(CX - 130, FIELD.panelY);
    ctx.closePath();
    ctx.fill();
  }

  // --- the Kestrel, chase view, banked into its turn. On final approach
  // the plane sits LEFT of the centreline so the runway — centreline,
  // touchdown zone, edge lights — stays fully visible ahead of it. ---
  const onFinal = camZ > COURSE.runwayStartM - 300;
  drawPlane(ctx, plane, nos, elapsed, state.wind, onFinal ? 110 : 0);

  // --- NOS speed lines: long streaks, spread over the frame ---
  if (nos) {
    ctx.strokeStyle = 'rgba(255, 244, 220, 0.45)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      const seed = (i * 137 + Math.floor(elapsed * 26)) % 1000;
      const y = 70 + ((seed * 53) % 500);
      const x = 40 + ((seed * 91) % 1200);
      const len = 34 + (seed % 42);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - len * 0.35, y + len * 0.3);
      ctx.stroke();
    }
  }

  // --- gust arrow in the pass: the wind's push, drawn beside the plane,
  // clear of the wings ---
  if (windIsActive(plane.z) && Math.abs(state.wind) > 4 && screen === 'play') {
    const dir = state.wind > 0 ? 1 : -1;
    const ax = CX + plane.bank * 30 + dir * 270;
    const ay = 380;
    ctx.fillStyle = 'rgba(255, 176, 46, 0.9)';
    ctx.font = '800 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(dir > 0 ? '▶▶ GUST' : 'GUST ◀◀', ax, ay);
  }

  drawHud(ctx, state, world, screen, pal);
  drawPanel(ctx, state, world);
  if (screen === 'title') drawTitle(ctx, state);
  if (screen === 'paused') drawPaused(ctx);
  if (screen === 'over') drawOver(ctx, state);
}

function drawPlane(ctx, plane, nos, elapsed, wind, xShift) {
  const px = CX + plane.bank * 30 - xShift;
  const py = 500;
  const scale = 1.62 + (nos ? 0.06 : 0);
  ctx.save();
  ctx.translate(px, py);
  // Crabbed into the wind: the nose points against the gust while the
  // plane still flies its course — the pass wind is visible on the plane.
  ctx.rotate(plane.bank * 0.9 - clamp(wind * 0.012, -0.14, 0.14));
  ctx.scale(scale, scale);
  if (plane.invulnerable > 0 && Math.floor(elapsed * 8) % 2 === 0) ctx.globalAlpha = 0.45;

  // NOS flames under the tail.
  if (nos) {
    const flick = 1 + Math.sin(elapsed * 46) * 0.18 + Math.random() * 0.12;
    for (const fx of [-9, 9]) {
      const grad = ctx.createLinearGradient(0, 72, 0, 72 + 46 * flick);
      grad.addColorStop(0, '#ffe08a');
      grad.addColorStop(0.5, '#ff8a2a');
      grad.addColorStop(1, 'rgba(80, 160, 255, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(fx - 7, 72);
      ctx.lineTo(fx + 7, 72);
      ctx.lineTo(fx, 72 + 46 * flick);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Propeller disc at the nose: a wide translucent spinning blur, seen
  // edge-on — the plane is powered, not a glider cutout.
  ctx.fillStyle = 'rgba(225, 230, 238, 0.28)';
  ctx.beginPath();
  ctx.ellipse(0, -78, 26, 3 + Math.sin(elapsed * 40) * 1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(225, 230, 238, 0.14)';
  ctx.beginPath();
  ctx.ellipse(0, -78, 20, 5 + Math.sin(elapsed * 40 + 1) * 1.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Main wing: white with red tips, slight dihedral, shaded underside.
  ctx.fillStyle = PALETTE.planeWhite;
  ctx.beginPath();
  ctx.moveTo(-128, 6);
  ctx.lineTo(-116, -12);
  ctx.lineTo(116, -12);
  ctx.lineTo(128, 6);
  ctx.lineTo(108, 16);
  ctx.lineTo(-108, 16);
  ctx.closePath();
  ctx.fill();
  // Panel lines on the wing: two seams per wing + a spar line, so the
  // wing reads as built sheet metal, not a flat pictogram.
  ctx.strokeStyle = 'rgba(90, 84, 70, 0.5)';
  ctx.lineWidth = 1.2;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 34, -11);
    ctx.lineTo(side * 44, 14);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(side * 72, -11);
    ctx.lineTo(side * 80, 13);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-112, -6);
  ctx.lineTo(112, -6);
  ctx.stroke();
  ctx.fillStyle = PALETTE.planeShade;
  ctx.beginPath();
  ctx.moveTo(-108, 16);
  ctx.lineTo(108, 16);
  ctx.lineTo(100, 20);
  ctx.lineTo(-100, 20);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.planeRed;
  ctx.beginPath();
  ctx.moveTo(-128, 6);
  ctx.lineTo(-116, -12);
  ctx.lineTo(-102, -12);
  ctx.lineTo(-110, 8);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(128, 6);
  ctx.lineTo(116, -12);
  ctx.lineTo(102, -12);
  ctx.lineTo(110, 8);
  ctx.closePath();
  ctx.fill();
  // Navigation lights + a blinking tail strobe.
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(-126, -2, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#37e08a';
  ctx.beginPath();
  ctx.arc(126, -2, 3.5, 0, Math.PI * 2);
  ctx.fill();
  if (Math.floor(elapsed * 2) % 2 === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(0, 80, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tailplane.
  ctx.fillStyle = PALETTE.planeWhite;
  ctx.beginPath();
  ctx.moveTo(-58, 52);
  ctx.lineTo(-50, 42);
  ctx.lineTo(50, 42);
  ctx.lineTo(58, 52);
  ctx.lineTo(44, 60);
  ctx.lineTo(-44, 60);
  ctx.closePath();
  ctx.fill();
  // Vertical fin: red, rising from the tail so the plane reads built.
  ctx.fillStyle = PALETTE.planeRed;
  ctx.beginPath();
  ctx.moveTo(-8, 62);
  ctx.lineTo(8, 62);
  ctx.lineTo(12, 84);
  ctx.lineTo(-12, 84);
  ctx.closePath();
  ctx.fill();

  // Fuselage: wide at the tail (near the camera), tapering to the nose.
  // A light top stripe shades it so it reads as a body, not a flat cutout.
  ctx.fillStyle = PALETTE.planeWhite;
  ctx.beginPath();
  ctx.moveTo(-10, -72);
  ctx.lineTo(10, -72);
  ctx.lineTo(21, 74);
  ctx.lineTo(-21, 74);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.moveTo(-6, -70);
  ctx.lineTo(6, -70);
  ctx.lineTo(10, 70);
  ctx.lineTo(-10, 70);
  ctx.closePath();
  ctx.fill();
  // Red nose cap and cheatline.
  ctx.fillStyle = PALETTE.planeRed;
  ctx.beginPath();
  ctx.moveTo(-10, -72);
  ctx.lineTo(10, -72);
  ctx.lineTo(8, -52);
  ctx.lineTo(-8, -52);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-19, 30, 38, 5);
  // Canopy: blue, with a frame and a white glint — a cockpit, not an oval.
  ctx.fillStyle = PALETTE.planeCanopy;
  ctx.beginPath();
  ctx.ellipse(0, -36, 8, 17, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40, 44, 56, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, -36, 8, 17, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-8, -36);
  ctx.lineTo(8, -36);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(-2, -42, 3, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  // Tail cone.
  ctx.fillStyle = PALETTE.planeRed;
  ctx.beginPath();
  ctx.moveTo(-14, 62);
  ctx.lineTo(14, 62);
  ctx.lineTo(0, 78);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/** The heading is the leg's true course bearing plus the turn: banking
 *  left or right swings the nose off the course, levelling returns it. */
function headingOf(plane, world) {
  const base = world.headingAt(plane.z);
  const turn = plane.bank * 22;
  return Math.round((360 + base + turn) % 360);
}

function drawHud(ctx, state, world, screen, pal) {
  const plane = state.plane;
  const heading = headingOf(plane, world);
  const next = world.nextRing();
  const approachingRunway = plane.z >= COURSE.runwayStartM - 300;
  const time = Math.max(0, state.timeLeft);
  const mm = Math.floor(time / 60);
  const ss = Math.floor(time % 60);

  chip(ctx, 12, 12, 150, 'ALTITUDE', `${Math.round(plane.alt * M_TO_FT).toLocaleString('en-US')} FT`, PALETTE.cyan);
  chip(ctx, 174, 12, 170, plane.nosActive ? 'SPEED · NITRO' : 'SPEED', `${Math.round(plane.speed)} KT`, plane.nosActive ? PALETTE.amber : PALETTE.green);
  chip(ctx, 356, 12, 130, 'HEADING', `${String(heading).padStart(3, '0')}°`, PALETTE.amber);
  if (next) {
    chip(ctx, 498, 12, 300, 'NEXT RING', `▲  ${Math.max(0, Math.round(next.z - plane.z))} m`, PALETTE.amber);
  } else if (approachingRunway && screen === 'play') {
    chip(ctx, 498, 12, 300, 'RUNWAY AHEAD', '▼  LAND SLOW', PALETTE.green);
  } else {
    chip(ctx, 498, 12, 300, 'COURSE', 'CLEAR', PALETTE.green);
  }
  chip(ctx, 940, 12, 180, 'SCORE', state.score.toLocaleString('en-US'), PALETTE.text);
  chip(ctx, 1132, 12, 136, 'TIME', `${mm}:${String(ss).padStart(2, '0')}`, time < 30 ? '#ff6a5e' : PALETTE.text);

  // Wind chip, only while the pass is pushing the plane around.
  if (windIsActive(plane.z) && screen === 'play') {
    ctx.fillStyle = PALETTE.hudChip;
    roundRect(ctx, 12, 80, 210, 34, 9);
    ctx.fill();
    ctx.fillStyle = PALETTE.amber;
    ctx.font = '800 16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(windLabel(state.wind), 24, 103);
  }
  // Hedge-hop tag, while the bonus is running.
  if (state.hedgeHop && screen === 'play') {
    ctx.fillStyle = PALETTE.hudChip;
    roundRect(ctx, 1058, 80, 210, 34, 9);
    ctx.fill();
    ctx.fillStyle = PALETTE.green;
    ctx.font = '800 16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('LOW & FAST +25/s', 1070, 103);
  }

  if (state.bannerT > 0 && state.banner) {
    const alpha = clamp(state.bannerT, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = PALETTE.hudChip;
    const w = 560;
    roundRect(ctx, CX - w / 2, 84, w, 38, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.amber;
    ctx.font = '800 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(state.banner, CX, 109);
    ctx.globalAlpha = 1;
  }
}

function bar(ctx, x, y, w, h, fraction, color, label, value) {
  ctx.fillStyle = '#232c3f';
  roundRect(ctx, x, y, w, h, 3);
  ctx.fill();
  const fillH = Math.max(0, h * clamp(fraction, 0, 1));
  ctx.fillStyle = color;
  roundRect(ctx, x, y + h - fillH, w, fillH, 3);
  ctx.fill();
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, 712);
  if (value) {
    ctx.fillStyle = PALETTE.amber;
    ctx.font = '800 13px system-ui, sans-serif';
    ctx.fillText(value, x + w / 2, y - 6);
  }
}

// The bottom strip, trimmed: v3's duplicate ALT/SPD gauges and the tiny
// plane icons are GONE (unreadable at 300 px, duplicating the HUD pills
// above). What stays is big type only: the attitude ball, the mission in
// the middle, throttle / fuel / NOS bars with BIG percentages, and rings
// + lives as large text.
function drawPanel(ctx, state, world) {
  const plane = state.plane;
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(0, FIELD.panelY, W, H - FIELD.panelY);
  ctx.fillStyle = PALETTE.panelEdge;
  ctx.fillRect(0, FIELD.panelY, W, 2);

  // Attitude indicator: banked horizon, fixed wings. The only round
  // instrument left — and its label is the only small text on the panel.
  const attX = 78;
  const attY = 668;
  const attR = 44;
  ctx.save();
  ctx.beginPath();
  ctx.arc(attX, attY, attR, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(attX, attY);
  ctx.rotate(plane.bank);
  ctx.fillStyle = '#5fa8d8';
  ctx.fillRect(-attR, -attR, attR * 2, attR);
  ctx.fillStyle = '#8a5a30';
  ctx.fillRect(-attR, 0, attR * 2, attR);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-attR, 0);
  ctx.lineTo(attR, 0);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#3a4a66';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(attX, attY, attR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = PALETTE.amber;
  ctx.fillRect(attX - 16, attY - 2, 12, 3);
  ctx.fillRect(attX + 4, attY - 2, 12, 3);
  ctx.beginPath();
  ctx.arc(attX, attY, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ATT', attX, 712);

  // Centre: leg, its goal, score and streak — the mission, in big type.
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.text;
  ctx.font = '800 17px system-ui, sans-serif';
  ctx.fillText(`LEG ${world.legAt(plane.z) + 1} · ${world.legName(plane.z)}`, 640, 644);
  ctx.fillStyle = PALETTE.amber;
  ctx.font = '700 14px system-ui, sans-serif';
  ctx.fillText(world.legGoal(plane.z), 640, 668);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '700 14px system-ui, sans-serif';
  const streak = state.combo > 1 ? `   ·   STREAK x${state.combo} · MULT x${Math.min(state.combo, 5)}` : '';
  ctx.fillText(`SCORE ${state.score.toLocaleString('en-US')}${streak}`, 640, 692);

  // Throttle / fuel / NOS bars, with BIG percentage labels.
  bar(ctx, 884, 640, 14, 56, plane.throttle / 100, '#ff7a5e', 'THR', `${Math.round(plane.throttle)}%`);
  bar(ctx, 952, 640, 14, 56, plane.fuel / 100, plane.fuel < 25 ? '#ff5a4e' : PALETTE.green, 'FUEL', `${Math.round(plane.fuel)}%`);
  bar(ctx, 1012, 640, 14, 56, plane.nos / 100, '#5fb8ff', 'NOS', plane.nosActive ? 'NITRO!' : `${Math.round(plane.nos)}%`);

  // Lives and rings, as large text — no more tiny plane pictograms.
  ctx.fillStyle = PALETTE.text;
  ctx.font = '800 17px system-ui, sans-serif';
  ctx.fillText(`PLANES ${'●'.repeat(state.lives)}${'○'.repeat(3 - state.lives)}`, 1180, 654);
  ctx.fillStyle = PALETTE.amber;
  ctx.font = '800 17px system-ui, sans-serif';
  ctx.fillText(`RINGS ${state.ringsHit}/${world.rings.length}`, 1180, 688);
}

function overlayPanel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(10, 14, 24, 0.82)';
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = PALETTE.amber;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawTitle(ctx, state) {
  ctx.fillStyle = 'rgba(10, 14, 24, 0.30)';
  ctx.fillRect(0, 0, W, FIELD.panelY);
  overlayPanel(ctx, 300, 108, 680, 380);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.text;
  ctx.font = '800 46px system-ui, sans-serif';
  ctx.fillText('SKY COURIER', CX, 172);
  ctx.fillStyle = PALETTE.amber;
  ctx.font = '800 24px system-ui, sans-serif';
  ctx.fillText('RIDGE RUN', CX, 206);
  ctx.fillStyle = '#d8d2c4';
  ctx.font = '400 16px system-ui, sans-serif';
  ctx.fillText('Fly Kestrel the courier plane down the valley.', CX, 242);
  ctx.fillText('Thread every glowing ring: +100 points, +8 fuel, streak to x5.', CX, 266);
  ctx.fillText('Burn NOS on the straights — rings pay DOUBLE while it burns.', CX, 290);
  ctx.fillText('The pass blows sideways. Low and fast pays +25 a second.', CX, 314);
  ctx.fillText('Land slow and centred on the coast runway to finish.', CX, 338);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '400 14px system-ui, sans-serif';
  ctx.fillText('← → steer  ·  ↑ climb  ·  ↓ descend  ·  Shift / Ctrl throttle  ·  X NOS', CX, 372);
  ctx.fillText('P pause  ·  M mute  ·  R restart', CX, 394);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillText(`Best score ${state.best.toLocaleString('en-US')}`, CX, 420);
  if (Math.floor(state.elapsed * 1.6) % 2 === 0) {
    ctx.fillStyle = PALETTE.amber;
    ctx.font = '800 18px system-ui, sans-serif';
    ctx.fillText('PRESS SPACE OR CLICK TO FLY', CX, 452);
  }
}

function drawPaused(ctx) {
  ctx.fillStyle = 'rgba(10, 14, 24, 0.45)';
  ctx.fillRect(0, 0, W, FIELD.panelY);
  overlayPanel(ctx, 490, 250, 300, 130);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.text;
  ctx.font = '800 34px system-ui, sans-serif';
  ctx.fillText('PAUSED', CX, 300);
  ctx.fillStyle = PALETTE.muted;
  ctx.font = '400 15px system-ui, sans-serif';
  ctx.fillText('Press P to keep flying', CX, 332);
  ctx.fillText('Press R to restart the run', CX, 356);
}

function drawOver(ctx, state) {
  ctx.fillStyle = 'rgba(10, 14, 24, 0.35)';
  ctx.fillRect(0, 0, W, FIELD.panelY);
  const titles = {
    landed: 'LANDED!',
    overshot: 'OVERSHOT!',
    crashed: 'KESTREL DOWN',
    fuel: 'OUT OF FUEL',
    time: 'TIME UP',
  };
  const flavors = {
    landed: 'Kestrel is down safe. The valley keeps the rings.',
    overshot: 'Too fast over the runway — the coast keeps the mail.',
    crashed: 'The mountains keep the mail this time.',
    fuel: 'The tanks ran dry over the valley.',
    time: 'The 3-minute window closed over the valley.',
  };
  overlayPanel(ctx, 300, 108, 680, 380);
  ctx.textAlign = 'center';
  ctx.fillStyle = state.reason === 'landed' ? PALETTE.green : '#ff6a5e';
  ctx.font = '800 44px system-ui, sans-serif';
  ctx.fillText(titles[state.reason] || 'RUN OVER', CX, 172);
  ctx.fillStyle = '#d8d2c4';
  ctx.font = '400 16px system-ui, sans-serif';
  ctx.fillText(flavors[state.reason] || '', CX, 208);
  ctx.fillStyle = PALETTE.text;
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.fillText(`Score ${state.score.toLocaleString('en-US')}   ·   Best ${state.best.toLocaleString('en-US')}`, CX, 248);
  ctx.fillText(`Rings ${state.ringsHit} of ${23}   ·   Best streak x${state.maxCombo}`, CX, 276);
  ctx.fillText(`Fuel ${Math.round(state.plane.fuel)}   ·   Time ${Math.max(0, Math.round(state.timeLeft))}s left`, CX, 304);
  if (state.reason === 'landed' && state.landing) {
    ctx.fillStyle = PALETTE.amber;
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.fillText(`${state.landing.tier} LANDING +${state.landing.bonus} — fuel and time bonus included.`, CX, 336);
  }
  if (state.hedgeHopTotal > 0) {
    ctx.fillStyle = PALETTE.green;
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText(`Low & fast bonus: +${Math.round(state.hedgeHopTotal)}`, CX, 364);
  }
  if (Math.floor(state.elapsed * 1.6) % 2 === 0) {
    ctx.fillStyle = PALETTE.amber;
    ctx.font = '800 18px system-ui, sans-serif';
    ctx.fillText('PRESS SPACE OR CLICK TO FLY AGAIN', CX, 452);
  }
}
