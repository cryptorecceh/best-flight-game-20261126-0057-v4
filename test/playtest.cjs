// Sky Courier v4 — full-loop CDP playtest (headless Chrome, real key events).
// Keys per game/src/input.js: Space/Enter = confirm, Shift/E = throttle up,
// Q = throttle down, ArrowLeft/Right (A/D) = steer, ArrowUp/Down (W/S) =
// climb/descend, X/N = NOS, P/Esc = pause, R = restart, M = mute.
// Drives title -> play -> ring -> miss -> crash -> restart -> land ->
// overshoot -> timeout -> fuel-out, plus negative inputs and the v4 heading
// check (leg bearing + bank, not a lateral-position number).
// Evidence: /tmp/v4-playtest.log, screenshots /tmp/v4-pt-*.png
const CHROME = process.env.CHROME || '/home/hatch/workspace/tools/chrome/opt/google/chrome/google-chrome';
const PORT = 9224;
const URL = 'http://localhost:8080/';
const fs = require('fs');
const { spawn } = require('child_process');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu',
    `--remote-debugging-port=${PORT}`, '--window-size=1280,720', 'about:blank'],
    { stdio: 'ignore' });
  let ws;
  const errors = [];
  try {
    let target = null;
    for (let i = 0; i < 40; i++) {
      try {
        const res = await fetch(`http://localhost:${PORT}/json/version`);
        if (res.ok) break;
      } catch { /* not up yet */ }
      await sleep(500);
    }
    const list = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
      if (msg.method === 'Runtime.exceptionThrown') {
        errors.push('exception: ' + JSON.stringify(msg.params.exceptionDetails).slice(0, 300));
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        errors.push('console.error: ' + JSON.stringify(msg.params.args).slice(0, 300));
      }
    };
    const send = (method, params = {}) => new Promise((resolve) => {
      const mid = ++id;
      pending.set(mid, resolve);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const evalJs = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      if (r.result?.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400));
      return r.result?.result?.value;
    };
    const shot = async (name) => {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(`/tmp/v4-pt-${name}.png`, Buffer.from(r.result.data, 'base64'));
    };
    const key = async (type, keyName, code, vk) => send('Input.dispatchKeyEvent',
      { type, key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    const keyDown = (k, c, v) => key('rawKeyDown', k, c, v);
    const keyUp = (k, c, v) => key('keyUp', k, c, v);
    const statusText = () => evalJs(`document.getElementById('status').textContent`);

    await send('Runtime.enable');
    await send('Page.enable');
    await send('Log.enable');
    await send('Page.navigate', { url: URL });
    await sleep(2500);
    const e0 = await evalJs(`__skyCourier.state.elapsed`);
    await sleep(1000);
    const e1 = await evalJs(`__skyCourier.state.elapsed`);
    check('frame loop advances in real time', e1 - e0 > 0.5, `elapsed ${e0.toFixed(2)} -> ${e1.toFixed(2)}`);
    await evalJs(`window.__kd = 0; window.addEventListener('keydown', () => { window.__kd++; });`);

    // --- 1. title screen ---
    check('title screen shown', (await evalJs(`__skyCourier.screen`)) === 'title');
    await shot('01-title');

    // --- 2. negative: bad ?shot= must not throw the page ---
    await evalJs(`location.href = 'http://localhost:8080/?shot=bogus&seed=7'`);
    await sleep(1500);
    check('bad ?shot= does not crash page', (await evalJs(`typeof __skyCourier`)) === 'object',
      await evalJs(`__skyCourier.screen`));
    await evalJs(`location.href = 'http://localhost:8080/?seed='`);
    await sleep(1500);
    check('empty ?seed= loads title', (await evalJs(`__skyCourier.screen`)) === 'title');
    // Re-install the key probe AFTER the navigations (a navigation wipes it).
    await evalJs(`window.__kd = 0; window.addEventListener('keydown', () => { window.__kd++; });`);

    // --- 3. odd keys on the title screen do nothing bad ---
    // (No F1: it is a browser shortcut — it opens a help tab and hides the
    // game. KeyZ / BracketLeft are unmapped in input.js and harmless.)
    await keyDown('z', 'KeyZ', 90); await keyUp('z', 'KeyZ', 90);
    await keyDown('[', 'BracketLeft', 219); await keyUp('[', 'BracketLeft', 219);
    await sleep(300);
    check('odd keys harmless on title', (await evalJs(`__skyCourier.screen`)) === 'title');

    // --- 4. start with Space (real key event) ---
    await keyDown(' ', 'Space', 32); await keyUp(' ', 'Space', 32);
    await sleep(400);
    let screenAfterSpace = await evalJs(`__skyCourier.screen`);
    if (screenAfterSpace !== 'play') {
      // One retry: a dispatch racing the page load after navigation can drop.
      await keyDown(' ', 'Space', 32); await keyUp(' ', 'Space', 32);
      await sleep(400);
      screenAfterSpace = await evalJs(`__skyCourier.screen`);
    }
    check('Space starts the run', screenAfterSpace === 'play',
      `keys seen by page: ${await evalJs(`window.__kd`)}, screen: ${screenAfterSpace}`);
    // v4: heading is the valley leg's true course bearing (008) at level flight.
    const st0 = await statusText();
    check('heading is the leg bearing at level flight', /heading 008/.test(st0), st0.slice(0, 160));
    const z0 = await evalJs(`__skyCourier.state.plane.z`);

    // --- 5. fly forward: throttle up with Shift, climb with ArrowUp ---
    await keyDown('Shift', 'ShiftLeft', 16);
    await sleep(2500);
    await keyUp('Shift', 'ShiftLeft', 16);
    const z1 = await evalJs(`__skyCourier.state.plane.z`);
    const spd1 = await evalJs(`__skyCourier.state.plane.speed`);
    check('plane advances and accelerates', z1 > z0 + 100 && spd1 > 180, `z ${z0.toFixed(0)} -> ${z1.toFixed(0)}, speed ${spd1.toFixed(0)} kt`);
    await shot('02-flying');

    // --- 6. steer left/right changes bank AND heading ---
    await keyDown('ArrowLeft', 'ArrowLeft', 37);
    await sleep(600);
    const bankL = await evalJs(`__skyCourier.state.plane.bank`);
    await keyUp('ArrowLeft', 'ArrowLeft', 37);
    await keyDown('ArrowRight', 'ArrowRight', 39);
    await sleep(900);
    const bankR = await evalJs(`__skyCourier.state.plane.bank`);
    await keyUp('ArrowRight', 'ArrowRight', 39);
    check('steering banks the plane', bankL < -0.2 && bankR > 0.2, `bank L ${bankL.toFixed(2)} R ${bankR.toFixed(2)}`);
    const st1 = await statusText();
    const hdg = Number((st1.match(/heading (\d+)/) || [])[1]);
    check('banking swings the heading off the course', hdg > 8, `heading ${hdg}° (course 008°)`);
    await shot('02b-banked');

    // --- 7. NOS boost (hold X while flying) ---
    const nos0 = await evalJs(`__skyCourier.state.plane.nos`);
    await keyDown('x', 'KeyX', 88);
    await sleep(1500);
    const nosActive = await evalJs(`__skyCourier.state.plane.nosActive`);
    const spdNos = await evalJs(`__skyCourier.state.plane.speed`);
    await keyUp('x', 'KeyX', 88);
    const nos1 = await evalJs(`__skyCourier.state.plane.nos`);
    check('NOS boosts speed and drains', nosActive === true && spdNos > spd1 && nos1 < nos0,
      `speed ${spdNos.toFixed(0)} kt, nos ${nos0.toFixed(0)} -> ${nos1.toFixed(0)}`);

    // --- 8. thread a ring (teleport just before the current next ring, on line).
    // Rings may already have been hit while flying in steps 5-7, so the
    // expectation is relative to the baseline, not absolute.
    const baseRings = await evalJs(`__skyCourier.state.ringsHit`);
    const baseScore = await evalJs(`__skyCourier.state.score`);
    const ring = await evalJs(`(() => { const r = __skyCourier.world.nextRing(); return { z: r.z, x: r.x, alt: r.alt }; })()`);
    await evalJs(`__skyCourier.state.plane.z = ${ring.z - 8}; __skyCourier.state.plane.x = ${ring.x}; __skyCourier.state.plane.alt = ${ring.alt};`);
    let ringsHit = baseRings;
    for (let i = 0; i < 10; i++) { await sleep(200); ringsHit = await evalJs(`__skyCourier.state.ringsHit`); if (ringsHit === baseRings + 1) break; }
    const score = await evalJs(`__skyCourier.state.score`);
    const banner = await evalJs(`__skyCourier.state.banner`);
    check('ring scores', ringsHit === baseRings + 1 && score > baseScore && /RING!/.test(banner),
      `rings ${baseRings} -> ${ringsHit}, score ${baseScore} -> ${score}, banner "${banner}"`);
    await shot('03-ring');

    // --- 9. miss the next ring: streak resets, ring count unchanged ---
    const ringsBeforeMiss = await evalJs(`__skyCourier.state.ringsHit`);
    const ring2 = await evalJs(`(() => { const r = __skyCourier.world.nextRing(); return { z: r.z, x: r.x, alt: r.alt }; })()`);
    await evalJs(`__skyCourier.state.plane.z = ${ring2.z - 8}; __skyCourier.state.plane.x = ${ring2.x + 60}; __skyCourier.state.plane.alt = ${ring2.alt};`);
    await sleep(700);
    check('missed ring breaks streak', (await evalJs(`__skyCourier.state.combo`)) === 0 &&
      (await evalJs(`__skyCourier.state.ringsHit`)) === ringsBeforeMiss, await evalJs(`__skyCourier.state.banner`));

    // --- 10. pause / resume ---
    await keyDown('p', 'KeyP', 80); await keyUp('p', 'KeyP', 80);
    await sleep(300);
    check('P pauses', (await evalJs(`__skyCourier.screen`)) === 'paused');
    await keyDown('p', 'KeyP', 80); await keyUp('p', 'KeyP', 80);
    await sleep(300);
    check('P resumes', (await evalJs(`__skyCourier.screen`)) === 'play');

    // --- 11. crash into the ground (lives 3 -> 2, respawn) ---
    // alt 0.5 m guarantees clearance < 1 m whatever the ground height is.
    await evalJs(`__skyCourier.state.plane.alt = 0.5; __skyCourier.state.plane.invulnerable = 0;`);
    let lives = 3;
    for (let i = 0; i < 10; i++) { await sleep(200); lives = await evalJs(`__skyCourier.state.lives`); if (lives === 2) break; }
    check('ground crash costs a life and respawns', lives === 2 &&
      (await evalJs(`__skyCourier.screen`)) === 'play', await evalJs(`__skyCourier.state.banner`));
    await shot('04-crash');

    // --- 12. restart with R ---
    await keyDown('r', 'KeyR', 82); await keyUp('r', 'KeyR', 82);
    await sleep(400);
    check('R restarts the run', (await evalJs(`__skyCourier.state.score`)) === 0 &&
      (await evalJs(`__skyCourier.state.plane.z`)) < 100 && (await evalJs(`__skyCourier.state.lives`)) === 3);

    // --- 13. land: PERFECT tier (slow, centred) ---
    // throttle 20 holds ~96 kt, under the PERFECT ceiling of 110 kt.
    await evalJs(`__skyCourier.state.plane.z = 8950; __skyCourier.state.plane.alt = 8; __skyCourier.state.plane.speed = 95; __skyCourier.state.plane.x = 2; __skyCourier.state.plane.throttle = 20;`);
    let over1 = null;
    for (let i = 0; i < 12; i++) {
      await sleep(200);
      over1 = await evalJs(`({ screen: __skyCourier.screen, reason: __skyCourier.state.reason, landing: __skyCourier.state.landing, score: __skyCourier.state.score })`);
      if (over1.screen === 'over') break;
    }
    check('landing grades PERFECT', over1.screen === 'over' && over1.reason === 'landed' &&
      over1.landing && over1.landing.tier === 'PERFECT' && over1.score > 800,
      JSON.stringify(over1));
    await shot('05-landed');

    // --- 14. Space on the over screen starts a new run ---
    await keyDown(' ', 'Space', 32); await keyUp(' ', 'Space', 32);
    await sleep(400);
    check('Space restarts from game-over', (await evalJs(`__skyCourier.screen`)) === 'play' &&
      (await evalJs(`__skyCourier.state.score`)) === 0);

    // --- 15. overshoot: too fast / too high at the end ---
    await evalJs(`__skyCourier.state.plane.z = 8950; __skyCourier.state.plane.alt = 120; __skyCourier.state.plane.speed = 200; __skyCourier.state.plane.x = 0;`);
    await sleep(800);
    check('overshoot ends the run', (await evalJs(`__skyCourier.screen`)) === 'over' &&
      (await evalJs(`__skyCourier.state.reason`)) === 'overshot');
    await keyDown(' ', 'Space', 32); await keyUp(' ', 'Space', 32);
    await sleep(300);

    // --- 16. clock runs out ---
    await evalJs(`__skyCourier.state.timeLeft = 0.05;`);
    await sleep(500);
    check('timeout ends the run', (await evalJs(`__skyCourier.screen`)) === 'over' &&
      (await evalJs(`__skyCourier.state.reason`)) === 'time');
    await keyDown(' ', 'Space', 32); await keyUp(' ', 'Space', 32);
    await sleep(300);

    // --- 17. fuel-out crash on last life ---
    await evalJs(`__skyCourier.state.lives = 1; __skyCourier.state.plane.fuel = 0; __skyCourier.state.plane.alt = 0.5; __skyCourier.state.plane.invulnerable = 0;`);
    let fuelOver = null;
    for (let i = 0; i < 10; i++) {
      await sleep(200);
      fuelOver = await evalJs(`({ screen: __skyCourier.screen, reason: __skyCourier.state.reason })`);
      if (fuelOver.screen === 'over') break;
    }
    check('fuel-out crash ends the run', fuelOver.screen === 'over' && fuelOver.reason === 'fuel',
      JSON.stringify(fuelOver));
    await shot('06-fuel-out');

    // --- 18. best score persisted (key from config.js: BEST_KEY) ---
    const best = await evalJs(`Number(localStorage.getItem('sky-courier-ridge.best') || 0)`);
    check('best score saved to localStorage', best > 0, `best ${best}`);

    // --- console / page errors ---
    check('no page exceptions or console errors', errors.length === 0, errors.join(' | ').slice(0, 400));
  } catch (e) {
    check('playtest script itself', false, String(e).slice(0, 300));
  } finally {
    if (ws) ws.close();
    chrome.kill();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) { console.log('FAILED:', failed.map((f) => f.name).join(', ')); process.exitCode = 1; }
})();
