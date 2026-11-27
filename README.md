# best-flight-game-20261126-0057-v4

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/cryptorecceh/best-flight-game-20261126-0057-v4/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/cryptorecceh/best-flight-game-20261126-0057-v4/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**Sky Courier: Ridge Run** is a complete chase-view flight game, and the v4
of the entry (v3 ranked 3,277 / 17,578 in round 3, score 456.269; v1 ranked
3,585 / 6,258, score 472.785). You fly **Kestrel**, a courier plane, down a
valley that bends with every leg — a blue morning valley, a river with a lit
town on its east bank, a windy mountain pass between snow-capped walls, and
the sunset coast — threading big glowing rings, minding your fuel, burning
**NOS** on the straights, and landing slow and centred on the coast runway
to finish the run. The panel carries a lit attitude indicator and the HUD
shows altitude, speed and heading in big numbers — the heading is the leg's
true course bearing (valley 008°, river 352°, pass 018°, coast 002°), swung
by the bank while you turn. Four legs with their own goals, wind that pushes
the plane sideways in the pass — and shows it, with a tilted horizon,
slanted clouds, leaning trees and a crabbed plane — a low-and-fast bonus for
hedge-hopping, landing grades from PERFECT to OVERSHOT, three lives, a
3-minute mission clock, and a seeded course so every run is the same valley
until you change the seed.

## Run it

```sh
node serve.ts
```

Then open <http://localhost:8080> in a desktop browser.

| Input | Action |
| --- | --- |
| ← → or A D | Steer (bank) |
| ↑ / W | Climb |
| ↓ / S | Descend |
| Shift / E | Throttle up |
| Ctrl / Q | Throttle down |
| X / N | NOS boost (hold) |
| Mouse hold left/right | Steer toward that side |
| Space / click | Start, restart |
| R | Restart |
| P / Esc | Pause |
| M | Mute |

## The flight

- **Green Valley** — wide soft fields and the first six rings, learn the plane.
  Skim the fields low and fast for +25 a second.
- **River Crossing** — the river bends in a wide S across the course; the
  town's windows are already lit on the east bank, and the church tower
  marks the turn.
- **Mountain Pass** — the corridor narrows between snow-capped walls, the
  rings are bigger and squeezed between the rock, and the wind shoves the
  plane sideways: watch the wind chip, the tilted horizon and the gust
  arrow, and correct for it.
- **Sunset Coast** — sea on the left, sand on the right, the golden gate
  ahead, and the runway beyond it: come in under 145 kt, centred on the
  touchdown zone, for the best grade. On final the plane sits left of the
  centreline so the whole runway stays in view.

A ring pays 100 points times your streak (up to x5), doubled while NOS burns
or on the golden sunset gate. Every ring returns 8 fuel; only the golden
ring refills NOS. Fly low and fast (under 250 ft, over 120 kt) for +25 a
second — and mind the ridges: a close shave pays +50, a strike costs a
plane. Crash and you lose a plane and respawn behind your last ring; lose
all three and the run is over. Land on the runway for a graded bonus:
PERFECT +800, GOOD +500, HARD +200, plus fuel and time bonus. A centred
PERFECT touchdown pays +100 more.

## The staged shots (all scores exact per game/src/scoring.js)

- Valley: 4 rings with NOS burning — 200 + 400 + 600 + 800 = **2,000**, low
  and fast over the fields, climbing to the low 4th ring.
- River: 6 rings with NOS burning — **4,000**, over the S-bend river.
- Pass: 15 rings with NOS burning — **13,000**, between the walls.
- Coast: 22 rings banked, NOS off — **10,000**, golden gate (+1,000) ahead.

## Files

- `game/index.html` + `game/src/*.js` — the whole game, plain static files,
  no libraries, no network requests, all sound synthesised with WebAudio.
- `game/src/config.js` — every tuning number, the palette of each leg, and
  each leg's true course bearing.
- `game/src/world.js` — the seeded valley: legs, large soft fields, rings,
  river, town, trees, pass walls, ridges, runway.
- `game/src/wind.js` — the gust model: calm valley, gusts in the pass, sea
  breeze on the coast.
- `game/src/scoring.js` — ring points, landing grades, hedge-hop bonus.
- `game/src/main.js` — the fixed-step loop, flight physics, scoring, crashes.
- `game/src/render.js` — the pseudo-3D chase view, the Kestrel, HUD and panel.
- `game/src/audio.js` — synthesised engine, wind, chimes, crash and landing.
- `game/src/shots.js` — the four staged screenshot scenes.
- `screenshots/` — four real renders of the game's own code.
- `main.ts` — hands the game in: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json` with the vendored make.fun library.

## Tested

- `node test/playtest.cjs` — 22/22 headless-Chrome (CDP) checks, 27 Nov 2026:
  title → start → throttle/steer/NOS (494 kt) → ring scores → missed ring
  breaks the streak → pause/resume → crash costs a life and respawns →
  restart → PERFECT landing (+900) → overshoot → timeout → fuel-out →
  best score saved; no page errors. Log and screenshots in `test/`.
- Screenshots render at 1280×720 and stay readable at 300 px wide; the
  page scales to a 390 px phone viewport.
- `main.ts` run twice: byte-identical `dossier.json`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=cryptorecceh&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
