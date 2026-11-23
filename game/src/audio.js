// Sound, synthesized only: no audio files, no network. WebAudio oscillators and filtered
// noise make the engine hum, the two-tone siren, gunshots, chimes and a simple bass loop.
// Everything is guarded: if AudioContext is unavailable the game stays silent.
const NOTE = { C2: 65.41, E2: 82.41, G2: 98.0, A2: 110.0, D3: 146.83 };

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let musicTimer = 0;
  let musicStep = 0;
  let muted = false;
  let started = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineGain.connect(master);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 60;
      engineOsc.connect(engineGain);
      engineOsc.start();
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenGain.connect(master);
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'square';
      sirenOsc.frequency.value = 660;
      sirenOsc.connect(sirenGain);
      sirenOsc.start();
      started = true;
      return true;
    } catch {
      return false;
    }
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!ctx || muted) return;
    try {
      const t = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch { /* silent */ }
  }

  function noise(dur, vol, filterFreq) {
    if (!ctx || muted) return;
    try {
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      const gain = ctx.createGain();
      gain.gain.value = vol;
      source.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      source.start();
    } catch { /* silent */ }
  }

  const BASS_LINE = [NOTE.C2, NOTE.C2, NOTE.E2, NOTE.G2, NOTE.A2, NOTE.G2, NOTE.E2, NOTE.D3];

  return {
    unlock() {
      if (ensure()) resume();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    shoot() {
      noise(0.14, 0.5, 1800);
      blip(180, 0.08, 'square', 0.25);
    },
    punch() {
      noise(0.08, 0.35, 700);
    },
    pickup() {
      blip(880, 0.12, 'sine', 0.35);
      blip(1318, 0.18, 'sine', 0.3, 0.09);
    },
    crash() {
      noise(0.3, 0.6, 500);
    },
    explosion() {
      noise(0.8, 0.8, 300);
      blip(60, 0.6, 'sine', 0.5);
    },
    missionJingle() {
      [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.22, 'triangle', 0.35, i * 0.12));
    },
    fail() {
      [392, 330, 262].forEach((f, i) => blip(f, 0.3, 'sawtooth', 0.2, i * 0.16));
    },
    busted() {
      [220, 185, 147].forEach((f, i) => blip(f, 0.4, 'square', 0.25, i * 0.2));
    },
    /** Per-frame: engine pitch follows speed, siren wails while wanted, bass loop plays. */
    update(dt, speed, wanted) {
      if (!ctx || !started || muted) {
        if (engineGain) engineGain.gain.value = 0;
        if (sirenGain) sirenGain.gain.value = 0;
        return;
      }
      resume();
      const target = speed > 5 ? 0.05 + Math.min(0.09, speed / 7000) : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(55 + speed * 0.12, ctx.currentTime, 0.1);
      if (wanted > 0) {
        sirenTimer += dt;
        const high = Math.floor(sirenTimer * 1.6) % 2 === 0;
        sirenOsc.frequency.setTargetAtTime(high ? 880 : 660, ctx.currentTime, 0.05);
        sirenGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.2);
      } else {
        sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      }
      musicTimer += dt;
      if (musicTimer > 0.42) {
        musicTimer = 0;
        const freq = BASS_LINE[musicStep % BASS_LINE.length];
        musicStep += 1;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(musicGain);
        osc.start();
        osc.stop(ctx.currentTime + 0.42);
        if (musicStep % 4 === 0) blip(1760, 0.05, 'sine', 0.06);
      }
    },
  };
}
