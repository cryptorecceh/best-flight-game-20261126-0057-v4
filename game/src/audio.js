// Synthesised sound: no audio files, everything is WebAudio. The engine
// hum follows speed and boost, rings chime up the streak, a missed ring
// thuds, the wind in the pass breathes, and landings and crashes get their
// own noise.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let windSrc = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 420;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      // Wind: looped noise through a band-pass, gain follows the pass wind.
      const len = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      windSrc = ctx.createBufferSource();
      windSrc.buffer = buffer;
      windSrc.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 480;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ctx.destination);
      windSrc.start();
      return true;
    } catch {
      ctx = null;
      return false;
    }
  }

  function tone(freq, dur, type, vol, when = 0) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noiseBurst(dur, vol, freq) {
    if (!ensure() || muted) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  }

  return {
    resume() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    click() {
      tone(660, 0.08, 'square', 0.05);
    },
    ring(streak) {
      const base = 520 + Math.min(streak, 12) * 36;
      tone(base, 0.16, 'sine', 0.12);
      tone(base * 1.5, 0.2, 'sine', 0.08, 0.06);
    },
    miss() {
      tone(180, 0.22, 'triangle', 0.1);
      tone(120, 0.28, 'triangle', 0.08, 0.08);
    },
    nearMiss() {
      noiseBurst(0.35, 0.22, 2400);
    },
    crash() {
      noiseBurst(0.7, 0.4, 900);
      tone(90, 0.5, 'sawtooth', 0.16);
    },
    land() {
      tone(392, 0.18, 'sine', 0.12);
      tone(523, 0.22, 'sine', 0.12, 0.12);
      tone(659, 0.3, 'sine', 0.12, 0.24);
    },
    /** Engine note follows speed (0..1) and boost; wind follows the pass. */
    setEngine(speed01, nosActive, wind01) {
      if (!ensure()) return;
      const target = muted ? 0 : 0.028 + speed01 * 0.05 + (nosActive ? 0.03 : 0);
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(58 + speed01 * 130 + (nosActive ? 42 : 0), ctx.currentTime, 0.08);
      windGain.gain.setTargetAtTime(muted ? 0 : wind01 * 0.06, ctx.currentTime, 0.15);
      windFilter.frequency.setTargetAtTime(380 + wind01 * 420, ctx.currentTime, 0.15);
    },
    toggleMute() {
      muted = !muted;
      if (ctx) {
        engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        windGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      }
      return muted;
    },
  };
}
