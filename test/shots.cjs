// Sky Courier v4 — capture the four staged screenshots via headless Chrome
// (CDP). Loads each ?shot= URL from shots.json, waits for __shotReady,
// captures PNG, downscales to JPEG quality 82 (must stay under 256 KiB each).
// Also renders a 300 px-wide copy of each shot for the readability check.
// Evidence: screenshots/*.jpg + /tmp/v4-shots-300/*.jpg, log to stdout.
const CHROME = process.env.CHROME || '/home/hatch/workspace/tools/chrome/opt/google/chrome/google-chrome';
const PORT = 9225;
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOTS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'shots.json'), 'utf8'));
const OUT = path.join(__dirname, '..', 'screenshots');
const OUT300 = '/tmp/v4-shots-300';
fs.mkdirSync(OUT300, { recursive: true });

(async () => {
  const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', '--disable-gpu',
    `--remote-debugging-port=${PORT}`, '--window-size=1280,720', 'about:blank'],
    { stdio: 'ignore' });
  let ws;
  try {
    for (let i = 0; i < 40; i++) {
      try { const res = await fetch(`http://localhost:${PORT}/json/version`); if (res.ok) break; } catch { /* wait */ }
      await sleep(500);
    }
    const list = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
    const target = list.find((t) => t.type === 'page');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let id = 0;
    const pending = new Map();
    const errors = [];
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
      if (msg.method === 'Runtime.exceptionThrown') errors.push('exception: ' + JSON.stringify(msg.params.exceptionDetails).slice(0, 300));
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push('console.error: ' + JSON.stringify(msg.params.args).slice(0, 300));
    };
    const send = (method, params = {}) => new Promise((resolve) => {
      const mid = ++id;
      pending.set(mid, resolve);
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const evalJs = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      return r.result?.result?.value;
    };
    await send('Runtime.enable');
    await send('Page.enable');
    for (const shot of SHOTS) {
      await send('Page.navigate', { url: 'http://localhost:8080/' + shot.query });
      let ready = false;
      for (let i = 0; i < 30; i++) {
        await sleep(300);
        ready = await evalJs(`window.__shotReady === true`);
        if (ready) break;
      }
      const state = await evalJs(`({ score: __skyCourier.state.score, rings: __skyCourier.state.ringsHit, combo: __skyCourier.state.combo, banner: __skyCourier.state.banner, wind: __skyCourier.state.wind, alt: __skyCourier.state.plane.alt, speed: __skyCourier.state.plane.speed })`);
      console.log(`${shot.name}: ready=${ready} state=${JSON.stringify(state)} errors=${errors.length}`);
      if (!ready) throw new Error(`shot ${shot.name} never became ready`);
      await sleep(400);
      const png = await send('Page.captureScreenshot', { format: 'png' });
      const pngPath = `/tmp/v4-shot-${shot.name}.png`;
      fs.writeFileSync(pngPath, Buffer.from(png.result.data, 'base64'));
      // PNG -> JPEG quality 82 (PIL; no ImageMagick on this VM), plus a
      // 300px-wide readability copy.
      execFileSync('python3', ['-c',
        `from PIL import Image
import sys
im = Image.open(sys.argv[1]).convert('RGB')
im.save(sys.argv[2], 'JPEG', quality=82)
im.resize((300, 169)).save(sys.argv[3], 'JPEG', quality=82)`,
        pngPath, path.join(OUT, shot.name), path.join(OUT300, shot.name)], { stdio: 'inherit' });
      const size = fs.statSync(path.join(OUT, shot.name)).size;
      console.log(`  wrote screenshots/${shot.name} ${size} bytes (cap 262144) ${size <= 262144 ? 'OK' : 'TOO BIG'}`);
    }
    if (errors.length) console.log('PAGE ERRORS:', errors.join(' | '));
  } finally {
    if (ws) ws.close();
    chrome.kill();
  }
})().catch((e) => { console.error('SHOT SCRIPT FAILED:', e.message); process.exitCode = 1; });
