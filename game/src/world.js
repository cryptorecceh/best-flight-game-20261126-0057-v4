// The seeded valley: four legs down one course, the rings to thread, the
// river, the town, the trees, the mountain walls and the coast runway at the
// end. Everything here is pure data derived from the seed, so the same seed
// always builds the same valley.
//
// v4 vs v3: the ground is no longer a per-cell quilt. Each leg holds a
// handful of LARGE soft fields (hundreds of metres across, with a hedgerow
// on their edges), so at 300 px the terrain reads as farmland, not static.
// The river is a visible S-bend, the town stands on ONE bank only (never in
// the water), and the Mountain Pass has real walls: two ridges that close in
// around the corridor, snow-capped, with the rings squeezed between them.
import { COURSE, RINGS } from './config.js';
import { createRandom, hashSeed } from './random.js';

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Build the whole course for a seed. Returns the world object the loop and
 *  the renderer share. */
export function createWorld(seed) {
  const random = createRandom(seed);
  const legLength = COURSE.legLengthM;

  // --- mountain ridges: three layers with parallax and clearly different
  // lightness — far is pale haze, near is dark — so the sky has depth. ---
  const ridges = [];
  const ridgeSpecs = [
    { parallax: 0.08, base: 30, amp1: 40, amp2: 18 },
    { parallax: 0.18, base: 58, amp1: 62, amp2: 32 },
    { parallax: 0.35, base: 78, amp1: 70, amp2: 38 },
  ];
  for (let layer = 0; layer < 3; layer++) {
    const spec = ridgeSpecs[layer];
    ridges.push({
      layer,
      parallax: spec.parallax,
      base: spec.base,
      amp1: spec.amp1,
      amp2: spec.amp2,
      freq1: 0.006 + random() * 0.003,
      freq2: 0.016 + random() * 0.006,
      phase1: random() * Math.PI * 2,
      phase2: random() * Math.PI * 2,
    });
  }

  // --- the river: a wide S-bend down leg 2 (River Crossing), big enough to
  // see curving away ahead of the plane. ---
  const river = [];
  for (let z = legLength; z <= legLength * 2 + 200; z += 120) {
    river.push({ z, x: Math.sin(z / 300) * 70 + Math.sin(z / 150) * 22 + (random() - 0.5) * 8 });
  }
  function riverX(z) {
    if (z < river[0].z || z > river[river.length - 1].z) return null;
    for (let i = 0; i < river.length - 1; i++) {
      const a = river[i];
      const b = river[i + 1];
      if (z >= a.z && z <= b.z) {
        const t = (z - a.z) / (b.z - a.z);
        return a.x + (b.x - a.x) * t;
      }
    }
    return river[river.length - 1].x;
  }

  // --- the town: a cluster of lit houses on the EAST bank of the river only,
  // with a church tower as the landmark the pilot steers by. No house ever
  // stands in the water: the river runs +-58 m around its centre (water to
  // +-48 m, tan bank to +-58 m), so every house sits at least 60 m east of
  // the river's centre at its own z. ---
  const town = [];
  for (let i = 0; i < 34; i++) {
    const z = legLength + 260 + random() * 1500;
    const rx = riverX(z) ?? 0;
    town.push({
      z,
      x: rx + 60 + random() * 40,
      w: 14 + random() * 12,
      h: 10 + random() * 9,
      lit: random() < 0.75,
    });
  }
  const churchZ = legLength + 980;
  const church = { z: churchZ, x: (riverX(churchZ) ?? 0) + 66, w: 18, h: 30 };

  // --- trees: seeded dots along the valley floor, denser in the green leg.
  // In the pass they lean with the wind (the renderer slants them). ---
  const trees = [];
  for (let z = 150; z < COURSE.lengthM - 300; z += 55) {
    const leg = Math.floor(z / legLength);
    const density = leg === 0 ? 0.75 : leg === 1 ? 0.5 : leg === 2 ? 0.22 : 0.3;
    if (random() > density) continue;
    const side = random() < 0.5 ? -1 : 1;
    trees.push({
      z,
      x: side * (18 + random() * 58),
      size: 7 + random() * 10,
      pine: random() < 0.6,
    });
  }

  // --- clouds: long thin STREAKS in the upper sky band only, never in the
  // ring lane's middle band, so a ring is never half-hidden behind a cloud.
  // In the pass the streaks slant with the wind. ---
  const clouds = [];
  for (let i = 0; i < 14; i++) {
    clouds.push({
      x: random() * 1280,
      y: 28 + random() * 118,
      scale: 0.7 + random() * 1.1,
      speed: 4 + random() * 7,
    });
  }

  // --- LARGE fields: a handful per leg, hundreds of metres across, each one
  // colour in a soft low-frequency patch. The renderer draws each as one
  // projected quad over the ground gradient; hedgerows run along their
  // edges. This is the v4 fix for the v3 quilt: no per-cell hash colour. ---
  const fields = [];
  for (let leg = 0; leg < 4; leg++) {
    const palette = COURSE.legs[leg].fields;
    const zStart = leg * legLength + 60;
    const zEnd = (leg + 1) * legLength - 40;
    let z = zStart;
    while (z < zEnd) {
      const len = 320 + random() * 380;
      // Two or three fields side by side across the valley floor.
      let x = -110;
      while (x < 110) {
        const w = 55 + random() * 75;
        fields.push({
          z0: z, z1: Math.min(z + len, zEnd),
          x0: x, x1: Math.min(x + w, 110),
          color: palette[Math.floor(random() * palette.length)],
          leg,
        });
        x += w;
      }
      z += len;
    }
  }

  // --- pass walls: in leg 2 the corridor narrows from +-70 m to +-34 m and
  // the walls rise, snow-capped. The crest is JAGGED (two extra sine terms)
  // and the face wobbles laterally, so the walls read as mountains, not
  // flat slabs. ---
  function wallHalfWidth(z) {
    const t = clamp((z - legLength * 2) / legLength, 0, 1);
    return 70 - 36 * t + 6 * Math.sin(z / 89);
  }
  function wallHeight(z) {
    const t = clamp((z - legLength * 2) / legLength, 0, 1);
    return 120 + 40 * Math.sin(t * Math.PI) + 20 * Math.sin(z / 211)
      + 30 * Math.sin(z / 47) + 15 * Math.sin(z / 23);
  }

  // --- rings: 23 down the course, weaving gently, altitudes a pilot can
  // reach. Spacing 350 m with a 60 m breather between legs, so the last ring
  // (8300 m) sits just before the runway (8600 m). Pass rings are drawn
  // bigger (38 m) because the walls are close and the corridor is narrow. ---
  const rings = [];
  const perLeg = [6, 6, 6, 5];
  let zCursor = 420;
  for (let leg = 0; leg < 4; leg++) {
    for (let i = 0; i < perLeg[leg]; i++) {
      const sway = Math.sin((leg * 2 + i) * 1.35) * 26;
      const jitter = (random() - 0.5) * 18;
      const alt = 120 + Math.sin(leg * 1.9 + i * 1.1) * 55 + random() * 70;
      rings.push({
        index: rings.length,
        leg,
        z: zCursor,
        x: clamp(sway + jitter, -44, 44),
        altM: clamp(alt, 90, 330),
        radius: leg === 2 ? RINGS.radiusPassM : RINGS.radiusM,
        hit: false,
        /** The last ring of leg 3 pays double even without NOS: the sunset gate. */
        golden: leg === 3 && i === perLeg[leg] - 1,
      });
      zCursor += 350;
    }
    zCursor += 60;
  }

  const world = {
    seed,
    rings,
    river,
    town,
    church,
    trees,
    clouds,
    ridges,
    fields,
    courseEndM: COURSE.lengthM,
    runwayStartM: COURSE.runwayStartM,
    legLengthM: legLength,

    legAt(z) {
      return clamp(Math.floor(z / legLength), 0, 3);
    },
    legName(z) {
      return COURSE.legs[world.legAt(z)].name;
    },
    legGoal(z) {
      return COURSE.legs[world.legAt(z)].goal;
    },
    corridorAt(z) {
      return COURSE.legs[world.legAt(z)].corridor;
    },
    /** The leg's true course bearing, in degrees — the heading is real. */
    headingAt(z) {
      return COURSE.legs[world.legAt(z)].headingDeg;
    },
    riverX,
    wallHalfWidth,
    wallHeight,

    /** The next ring the pilot has not passed yet, or null past the last one. */
    nextRing(z) {
      for (const ring of rings) {
        if (!ring.hit && ring.z >= z - 5) return ring;
      }
      return null;
    },
    /** The next rings ahead, nearest first, for the course guide. */
    nextRings(z, count) {
      const out = [];
      for (const ring of rings) {
        if (out.length >= count) break;
        if (!ring.hit && ring.z >= z - 5) out.push(ring);
      }
      return out;
    },
    ringsHit() {
      let n = 0;
      for (const ring of rings) if (ring.hit) n++;
      return n;
    },
    /** Ground height in metres at (x, z): flat valley floor, walls beyond
     *  the corridor — in the pass the walls are the pass walls themselves.
     *  The runway sits on the floor. */
    groundAt(x, z) {
      const corridor = world.corridorAt(z);
      const over = Math.abs(x) - corridor;
      if (over <= 0) return 0;
      if (world.legAt(z) === 2) return Math.min(280, over * over * 0.16);
      return Math.min(260, over * over * 0.09);
    },
    /** Reset every ring to unhit (fresh run, same valley). */
    resetRings() {
      for (const ring of rings) ring.hit = false;
    },
  };
  return world;
}

export { RINGS };
