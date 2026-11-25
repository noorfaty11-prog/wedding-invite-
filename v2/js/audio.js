/* =============================================================================
   audio.js — background music.
   1. If assets/music.mp3 (config.music) exists, it is played and looped.
   2. Otherwise a soft, nostalgic waltz is SYNTHESISED with the Web Audio API
      (plucked strings + bell + warm pad + light reverb). No files needed.
   The same synth can render itself to a WAV (window.renderSynthWav) so that the
   MP4 export contains music even when you have no mp3.
   Public API (window.InviteAudio): init(src) start(t) pause() resume() seek(t)
                                     restart() setMuted(bool) isMuted()
   ============================================================================= */
(function () {
  'use strict';

  /* ---------- The score: 3/4 time, 72 bpm, key of D major ---------- */
  const BAR = 2.5;                               // seconds per bar (3 beats at 72 bpm)
  const BEAT = BAR / 3;
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // pad = sustained chord, arp = 6 plucked eighth notes, root = bass note (MIDI numbers)
  const PROG = [
    { root: 38, pad: [50, 57, 62, 66], arp: [62, 66, 69, 74, 69, 66] },   // D
    { root: 45, pad: [49, 57, 61, 64], arp: [61, 64, 69, 73, 69, 64] },   // A/C#
    { root: 35, pad: [47, 54, 59, 62], arp: [59, 62, 66, 71, 66, 62] },   // Bm
    { root: 42, pad: [49, 54, 57, 61], arp: [61, 66, 69, 73, 69, 66] },   // F#m
    { root: 43, pad: [43, 55, 59, 62], arp: [59, 62, 67, 71, 67, 62] },   // G
    { root: 42, pad: [50, 54, 57, 62], arp: [62, 66, 69, 74, 69, 66] },   // D/F#
    { root: 40, pad: [52, 55, 59, 64], arp: [59, 64, 67, 71, 67, 64] },   // Em
    { root: 45, pad: [49, 52, 57, 61], arp: [61, 64, 69, 73, 69, 64] }    // A
  ];
  // Bell melody: [beat offset, MIDI note]
  const LEAD = [
    [[0, 81], [1.5, 78], [2, 74]], [[0, 76], [1, 78], [2, 81]],
    [[0, 78], [1.5, 74], [2, 71]], [[0, 73], [1, 76], [2, 78]],
    [[0, 79], [1.5, 78], [2, 74]], [[0, 78], [1, 74], [2, 71]],
    [[0, 71], [1.5, 74], [2, 76]], [[0, 73], [1, 76], [2, 81]]
  ];

  /* ---------- Voices ---------- */
  function pluck(ctx, dest, when, m, vel, dur) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = midi(m);
    f.type = 'lowpass'; f.frequency.setValueAtTime(3400, when); f.frequency.exponentialRampToValueAtTime(800, when + dur);
    g.gain.setValueAtTime(0.0001, when); g.gain.linearRampToValueAtTime(vel, when + 0.012); g.gain.exponentialRampToValueAtTime(0.0008, when + dur);
    o.connect(f); f.connect(g); g.connect(dest); o.start(when); o.stop(when + dur + 0.05);
  }
  function bell(ctx, dest, when, m, vel) {
    [[1, 1], [2.01, 0.28], [3.98, 0.08]].forEach(([mul, amp]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = midi(m) * mul;
      g.gain.setValueAtTime(0.0001, when); g.gain.linearRampToValueAtTime(vel * amp, when + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0006, when + 2.4 / mul);
      o.connect(g); g.connect(dest); o.start(when); o.stop(when + 2.5);
    });
  }
  function bass(ctx, dest, when, m, vel) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = midi(m);
    g.gain.setValueAtTime(0.0001, when); g.gain.linearRampToValueAtTime(vel, when + 0.03); g.gain.exponentialRampToValueAtTime(0.001, when + 2.2);
    o.connect(g); g.connect(dest); o.start(when); o.stop(when + 2.3);
  }
  function pad(ctx, dest, when, notes, vel) {
    const end = when + BAR + 0.9;
    notes.forEach((m, i) => {
      [-6, 6].forEach((det) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = midi(m); o.detune.value = det + i;
        g.gain.setValueAtTime(0.0001, when); g.gain.linearRampToValueAtTime(vel, when + 0.8); g.gain.linearRampToValueAtTime(vel * 0.8, when + BAR);
        g.gain.linearRampToValueAtTime(0.0001, end);
        o.connect(g); g.connect(dest); o.start(when); o.stop(end + 0.05);
      });
    });
  }

  /* Schedules one whole bar. `now` lets us skip notes that are already in the past (after a seek). */
  function scheduleBar(ctx, dest, barIndex, when, now) {
    const c = PROG[barIndex % PROG.length], lead = LEAD[barIndex % LEAD.length];
    pad(ctx, dest, Math.max(when, now), c.pad, 0.016);
    if (when >= now - 0.02) bass(ctx, dest, when, c.root, 0.14);
    c.arp.forEach((m, i) => { const t = when + i * (BEAT / 2); if (t >= now - 0.02) pluck(ctx, dest, t, m, 0.085, 1.5); });
    lead.forEach(([b, m]) => { const t = when + b * BEAT; if (t >= now - 0.02) bell(ctx, dest, t, m, 0.07); });
  }

  /* Output chain: bus -> (dry + convolution reverb) -> master -> speakers */
  function buildChain(ctx) {
    const bus = ctx.createGain(), master = ctx.createGain(), wet = ctx.createGain(), conv = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    conv.buffer = ir; wet.gain.value = 0.38; master.gain.value = 0.9;
    bus.connect(master); bus.connect(conv); conv.connect(wet); wet.connect(master); master.connect(ctx.destination);
    return { bus, master };
  }

  /* ---------- Engine ---------- */
  const E = { mode: null, el: null, ctx: null, chain: null, session: null, muted: false, src: null, startedAt: 0 };

  function probeFile(src) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      let done = false;
      const a = new Audio();
      const fin = (ok) => { if (!done) { done = true; resolve(ok ? a : null); } };
      a.preload = 'auto'; a.loop = true;
      a.addEventListener('loadedmetadata', () => fin(true), { once: true });
      a.addEventListener('error', () => fin(false), { once: true });
      setTimeout(() => fin(false), 4000);
      a.src = src; a.load();
    });
  }

  async function init(src) {
    E.src = src;
    const a = await probeFile(src);
    if (a) { E.mode = 'file'; E.el = a; } else { E.mode = 'synth'; }
    return E.mode;
  }

  function ensureCtx() {
    if (!E.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      E.ctx = new AC(); E.chain = buildChain(E.ctx);
      E.chain.master.gain.value = E.muted ? 0 : 0.9;
    }
    return E.ctx;
  }

  function stopSession() {
    const s = E.session; if (!s) return;
    clearInterval(s.timer);
    try { s.g.gain.setTargetAtTime(0, E.ctx.currentTime, 0.05); } catch (e) { /* ignore */ }
    setTimeout(() => { try { s.g.disconnect(); } catch (e) { /* ignore */ } }, 500);
    E.session = null;
  }

  function startSession(from) {
    const ctx = ensureCtx(); stopSession();
    const g = ctx.createGain(); g.connect(E.chain.bus);
    const bar0 = Math.floor(from / BAR), into = from - bar0 * BAR;
    const s = { g, bar: bar0, next: ctx.currentTime - into, timer: null };
    const pump = () => {
      while (s.next < ctx.currentTime + 2.2) { scheduleBar(ctx, g, s.bar, s.next, ctx.currentTime); s.bar++; s.next += BAR; }
    };
    pump(); s.timer = setInterval(pump, 300); E.session = s;
  }

  function start(t) {
    t = t || 0;
    if (E.mode === 'file') {
      const d = E.el.duration; if (isFinite(d) && d > 0) t = t % d;
      try { E.el.currentTime = t; } catch (e) { /* ignore */ }
      E.el.muted = E.muted; const p = E.el.play(); if (p && p.catch) p.catch(() => {});
    } else if (E.mode === 'synth') {
      const ctx = ensureCtx(); if (ctx.state === 'suspended') ctx.resume();
      startSession(t);
    }
  }
  function pause() { if (E.mode === 'file') E.el.pause(); else if (E.ctx) E.ctx.suspend(); }
  function resume() { if (E.mode === 'file') { const p = E.el.play(); if (p && p.catch) p.catch(() => {}); } else if (E.ctx) E.ctx.resume(); }
  function seek(t) { if (E.mode === 'file') { const d = E.el.duration; try { E.el.currentTime = isFinite(d) && d > 0 ? t % d : t; } catch (e) { /* ignore */ } } else if (E.mode === 'synth' && E.session) startSession(t); }
  function restart() { start(0); }
  function setMuted(m) {
    E.muted = !!m;
    if (E.el) E.el.muted = E.muted;
    if (E.chain) E.chain.master.gain.setTargetAtTime(E.muted ? 0 : 0.9, E.ctx.currentTime, 0.05);
  }

  window.InviteAudio = { init, start, pause, resume, seek, restart, setMuted, isMuted: () => E.muted, mode: () => E.mode };

  /* ---------- Offline render for the MP4 export ---------- */
  function wavBase64(buf) {
    const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
    const bytes = new Uint8Array(44 + n * ch * 2), v = new DataView(bytes.buffer);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, sr, true);
    v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * ch * 2, true);
    const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
    let o = 44;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, data[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
    let bin = ''; const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(bin);
  }
  window.renderSynthWav = async function (seconds) {
    const sr = 44100, oc = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
    const chain = buildChain(oc);
    for (let b = 0; b * BAR < seconds + 0.5; b++) scheduleBar(oc, chain.bus, b, b * BAR, 0);
    return wavBase64(await oc.startRendering());
  };
})();
