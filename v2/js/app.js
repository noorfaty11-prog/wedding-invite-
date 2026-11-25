/* =============================================================================
   app.js — builds the scenes from config.js and drives them with ONE GSAP master timeline.

   How it works (so you can tweak it with confidence):
   • Every animated effect is a tiny function of progress  v (0 → 1)  that sets styles or SVG
     attributes.  anim(tl, startTime, duration, fn, options)  puts it on the master timeline.
   • Because every effect is a pure function of v, the whole film can be scrubbed to any time
     (window.seek(t)) — this is what makes the frame-by-frame MP4 export deterministic.
   • Scenes: groom → "meets" → bride → save the date → (scroll page).  Durations come from config.timing.
   ============================================================================= */
(function () {
  'use strict';

  /* ---------------------------------------------------------------------------
     0. Settings, flags, small helpers
     --------------------------------------------------------------------------- */
  const C = window.INVITE || {};
  const Q = new URLSearchParams(location.search);
  const EXPORT = Q.get('export') === '1';                                   // ?export=1 → used by scripts/export-video.js
  const REDUCED = Q.get('reduced') === '1' ||
    (!EXPORT && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  document.body.classList.toggle('export', EXPORT);

  const T = Object.assign({ groom: 9, meets: 3, bride: 9, save: 9, crossfade: 0.9 }, C.timing || {});
  const DEFAULT_LABELS = {
    tapToOpen: 'Tap to open', tapHint: 'Sound on for the full experience', loading: 'Loading…', meets: 'meets',

    saveTheDate: 'SAVE THE DATE', weddingOf: 'The Valima Reception of', program: 'Programme', venue: 'Venue',
    openMaps: 'Open in Google Maps', groomSide: "Groom's parents", brideSide: "Bride's parents",
    countdown: 'Counting down', days: 'Days', hours: 'Hours', minutes: 'Min', seconds: 'Sec',
    countdownDone: 'The celebration has begun', rsvpAccept: "Yes, I'll be there", rsvpDecline: 'Regretfully decline',
    rsvpThanksYes: 'Thank you!', rsvpThanksNo: 'Thank you for letting us know.',
    rsvpMessageYes: 'Assalam o Alaikum, I will be attending the wedding of {groom} & {bride}',
    rsvpMessageNo: 'Assalam o Alaikum, I regret that I will not be able to attend the wedding of {groom} & {bride}',
    play: 'Play', pause: 'Pause', replay: 'Replay', mute: 'Mute', unmute: 'Unmute',
    pageTitle: '{groom} & {bride} — Wedding Invitation',
    noGsap: 'The animation library could not be loaded. Please check your internet connection and reload.'
  };
  const L = Object.assign({}, DEFAULT_LABELS, C.labels || {});
  const fill = (s) => String(s).replace(/\{groom\}/g, C.groom || '').replace(/\{bride\}/g, C.bride || '');

  const $ = (s, r) => (r || document).querySelector(s);
  const clamp = (v, a, b) => Math.min(b === undefined ? 1 : b, Math.max(a === undefined ? 0 : a, v));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const NS = 'http://www.w3.org/2000/svg';

  function h(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) setText(n, text);
    return n;
  }
  /* Right-to-left detection (Urdu / Arabic / Persian). Switches font + direction automatically. */
  const isRTL = (s) => /[֐-ࣿﭐ-﷿ﹰ-﻿]/.test(s || '');
  function setText(node, text) {
    node.textContent = text;
    if (isRTL(text)) { node.classList.add('rtl'); node.setAttribute('dir', 'rtl'); node.setAttribute('lang', 'ur'); }
  }
  /* Seeded random numbers: the "hand-drawn" jitter is identical on every run (important for export). */
  function rng(seed) {
    let a = seed | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const splitChars = (s) => (window.Intl && Intl.Segmenter)
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s), (x) => x.segment)
    : Array.from(s);
  function vis(node, o) { node.style.opacity = o; node.style.visibility = o <= 0.002 ? 'hidden' : 'visible'; }
  const loadImg = (src) => new Promise((res) => {
    if (!src) return res(null);
    const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
  });

  /* Shrinks a text block's font until it fits its box (handles very long names / captions). */
  function fitText(node, minPx) {
    if (!node) return;
    node.style.whiteSpace = 'nowrap';
    let fs = parseFloat(getComputedStyle(node).fontSize), guard = 0;
    while (node.scrollWidth > node.clientWidth + 1 && fs > (minPx || 30) && guard++ < 80) { fs -= 2; node.style.fontSize = fs + 'px'; }
    if (node.scrollWidth > node.clientWidth + 1) { node.style.whiteSpace = 'normal'; }   // last resort: wrap
  }

  /* ---------------------------------------------------------------------------
     1. Theme colours from config → CSS variables
     --------------------------------------------------------------------------- */
  (function applyTheme() {
    const t = C.theme || {}, r = document.documentElement.style;
    [['inkLight', '--ink-light'], ['inkDark', '--ink-dark'], ['accentLight', '--accent-light'],
     ['accentDark', '--accent-dark'], ['washLight', '--wash-light'], ['washDark', '--wash-dark']]
      .forEach(([k, v]) => { if (t[k]) r.setProperty(v, t[k]); });
    document.title = fill(L.pageTitle);
  })();

  /* ---------------------------------------------------------------------------
     2. Timeline helper
     --------------------------------------------------------------------------- */
  let tl = null;
  /* anim(): runs fn(v) while v moves from 0 to 1 (or opt.from → opt.to) starting at `pos` seconds. */
  function anim(pos, dur, fn, opt) {
    opt = opt || {};
    const o = { v: 0 };
    tl.fromTo(o, { v: opt.from || 0 }, {
      v: opt.to === undefined ? 1 : opt.to, duration: Math.max(dur, 0.001), ease: opt.ease || 'none',
      immediateRender: false, repeat: opt.repeat || 0, yoyo: !!opt.yoyo, onUpdate: () => fn(o.v)
    }, pos);
  }
  /* Gentle looping float (3–4 px) + sway for the whole length of a scene. */
  function idle(pos, dur, floatFn, swayFn, seed) {
    if (REDUCED) return;
    const c1 = 2.4 + (seed % 3) * 0.3, c2 = 3.1 + (seed % 2) * 0.4;
    anim(pos, c1, floatFn, { ease: 'sine.inOut', repeat: Math.ceil(dur / c1), yoyo: true });
    if (swayFn) anim(pos, c2, swayFn, { ease: 'sine.inOut', repeat: Math.ceil(dur / c2), yoyo: true });
  }

  /* ---------------------------------------------------------------------------
     3. Illustrated character with photo frame (inline SVG)
        - the character PNG, the childhood photo in the frame, gold overlay, paper grain
        - an ink-bleed MASK (feTurbulence + feDisplacementMap) that grows from the frame outward
        - hand-drawn "burst" lines
     --------------------------------------------------------------------------- */
  const DEF_FRAME = {
    groom: { x: 49.9, y: 29.68, w: 43.69, h: 24.62, rotate: 0, scale: 1, focusX: 50, focusY: 50, zoom: 1, burst: 'right' },
    bride: { x: 47.92, y: 33.52, w: 44.37, h: 28.34, rotate: 0, scale: 1, focusX: 55, focusY: 45, zoom: 1.12, burst: 'left' }
  };

  /* Soft placeholder used when a character PNG is missing */
  function placeholder(kind, nw, nh, fcx, fcy, fw, fh, behind) {
    const g = kind === 'bride';
    const suit = g ? '#f1e8db' : '#b98f66', hair = g ? '#b98a5e' : '#5b4331', skin = '#e8c9a8';
    const top = fcy + fh * 0.5 + 40;
    return `<g opacity=".96">
      ${g ? `<path d="M${fcx - fw * .62} ${fcy - fh * .55} Q${fcx - fw * .95} ${nh * .62} ${fcx - fw * .55} ${nh * .72} L${fcx + fw * .55} ${nh * .72} Q${fcx + fw * .95} ${nh * .62} ${fcx + fw * .62} ${fcy - fh * .55} Z" fill="${hair}"/>` : ''}
      <ellipse cx="${fcx}" cy="${fcy}" rx="${fw * .42}" ry="${fh * .62}" fill="${skin}"/>
      ${g ? '' : `<path d="M${fcx - fw * .44} ${fcy - fh * .35} Q${fcx} ${fcy - fh * .95} ${fcx + fw * .44} ${fcy - fh * .35} Q${fcx} ${fcy - fh * .6} ${fcx - fw * .44} ${fcy - fh * .35}Z" fill="${hair}"/>`}
      <path d="M${nw * .1} ${nh} C${nw * .1} ${top + nh * .18} ${nw * .28} ${top} ${nw * .5} ${top} C${nw * .72} ${top} ${nw * .9} ${top + nh * .18} ${nw * .9} ${nh}Z" fill="${suit}"/>
      ${g ? '' : `<path d="M${nw * .5 - 36} ${top + 6} l36 22 l36 -22 l0 34 l-36 -14 l-36 14z" fill="#8c4a2b"/>`}
      <circle cx="${fcx - fw * .56}" cy="${fcy + fh * .46}" r="${fw * .12}" fill="${skin}"/><circle cx="${fcx + fw * .56}" cy="${fcy + fh * .46}" r="${fw * .12}" fill="${skin}"/>
      <rect x="${fcx - fw / 2 - 26}" y="${fcy - fh / 2 - 26}" width="${fw + 52}" height="${fh + 52}" rx="8" fill="none" stroke="#c49a45" stroke-width="30"/>
      ${behind ? '' : `<rect x="${fcx - fw / 2}" y="${fcy - fh / 2}" width="${fw}" height="${fh}" fill="#f3ead8"/>`}</g>`;
  }

  function buildArt(o) {
    const id = o.id, f = o.frame;
    const nw = o.char ? o.char.naturalWidth : 928, nh = o.char ? o.char.naturalHeight : 1152;
    const fw = nw * f.w / 100, fh = nh * f.h / 100, fcx = nw * f.x / 100, fcy = nh * f.y / 100;
    const rnd = rng(o.seed || 1);

    /* ink-bleed blobs: the first one (centred on the frame) alone covers the whole picture; the rest add irregularity */
    const Rmax = Math.hypot(nw, nh) * 0.68;
    const blobs = [{ cx: fcx, cy: fcy, R: Rmax, d: 0 }];
    for (let i = 0; i < 6; i++) blobs.push({ cx: nw * (0.12 + 0.76 * rnd()), cy: nh * (0.2 + 0.75 * rnd()), R: Rmax * (0.75 + 0.35 * rnd()), d: 0.04 + 0.26 * rnd() });

    /* Where does the photo go?
       "behind": the PNG has a TRANSPARENT frame opening -> the photo sits BEHIND the painting (slightly larger than the opening so no gap shows)
       "front" : the PNG has an opaque (cream) opening -> the photo is laid ON TOP, clipped to the opening and given a thin gold edge */
    const behind = (C.photoLayer || 'behind') !== 'front';
    const mxu = behind ? nw * (f.margin == null ? 1.8 : f.margin) / 100 : 0, myu = behind ? nh * (f.margin == null ? 1.8 : f.margin) / 100 : 0;
    const bx = fcx - fw / 2 - mxu, by = fcy - fh / 2 - myu, bw = fw + 2 * mxu, bh = fh + 2 * myu;
    const fx = bx, fy = by, cw = bw, ch = bh;                       // clip box
    let photoSvg;
    if (o.photo) {   // "object-fit: cover" + focus point + zoom (zoom grows around the focus point)
      const pw = o.photo.naturalWidth, ph = o.photo.naturalHeight, fxp = (f.focusX == null ? 50 : f.focusX) / 100, fyp = (f.focusY == null ? 50 : f.focusY) / 100, z = f.zoom || 1;
      const s0 = Math.max(bw / pw, bh / ph), w0 = pw * s0, h0 = ph * s0;
      const x0 = bx - (w0 - bw) * fxp, y0 = by - (h0 - bh) * fyp, ox = bx + bw * fxp, oy = by + bh * fyp;
      photoSvg = `<image href="${o.photo.src}" x="${ox + (x0 - ox) * z}" y="${oy + (y0 - oy) * z}" width="${w0 * z}" height="${h0 * z}" preserveAspectRatio="none"
        style="${behind ? '' : 'mix-blend-mode:multiply;filter:sepia(.2) saturate(.88) contrast(1.05) brightness(1.04)'}"/>`;
    } else {   // missing photo → soft silhouette
      photoSvg = `<g opacity=".8"><circle cx="${fcx}" cy="${fcy - fh * .12}" r="${fh * .2}" fill="#cdb893"/>
        <path d="M${fcx - fw * .34} ${fcy + fh / 2} Q${fcx} ${fcy - fh * .02} ${fcx + fw * .34} ${fcy + fh / 2}Z" fill="#cdb893"/></g>`;
    }

    const tf = `translate(${fcx} ${fcy}) rotate(${f.rotate || 0}) scale(${f.scale || 1}) translate(${-fcx} ${-fcy})`;

    /* hand-drawn burst lines beside the frame */
    const sides = f.burst === 'both' ? ['right', 'left'] : (f.burst === 'none' ? [] : [f.burst || 'right']);
    const burstD = [];
    sides.forEach((side) => {
      const dir = side === 'left' ? -1 : 1, px = fcx + dir * (fw / 2 + nw * 0.055), py = fcy - fh / 2 + fh * 0.12;
      for (let i = 0; i < 5; i++) {
        const a = (-80 + i * 22) * Math.PI / 180, r1 = nw * (0.075 + 0.012 * rnd()), r2 = r1 + nw * (0.085 + 0.045 * rnd());
        const x1 = px + dir * Math.cos(a) * r1, y1 = py + Math.sin(a) * r1, x2 = px + dir * Math.cos(a) * r2, y2 = py + Math.sin(a) * r2;
        const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), bend = (rnd() - 0.5) * 16;
        burstD.push(`M${x1.toFixed(1)} ${y1.toFixed(1)} Q${((x1 + x2) / 2 - dy / len * bend).toFixed(1)} ${((y1 + y2) / 2 + dx / len * bend).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`);
      }
    });

    const charSvg = o.char ? `<image href="${o.char.src}" x="0" y="0" width="${nw}" height="${nh}"/>` : placeholder(o.kind, nw, nh, fcx, fcy, fw, fh, behind);
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${nw} ${nh}`); svg.setAttribute('class', 'art'); svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `
      <defs>
        <filter id="${id}-ink" filterUnits="userSpaceOnUse" x="0" y="0" width="${nw}" height="${nh}" color-interpolation-filters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.016" numOctaves="3" seed="${(o.seed || 1) % 40 + 2}" result="n"/>
          <feDisplacementMap id="${id}-disp" in="SourceGraphic" in2="n" scale="160" xChannelSelector="R" yChannelSelector="G" result="d"/>
          <feGaussianBlur in="d" stdDeviation="2.5"/>
        </filter>
        <mask id="${id}-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${nw}" height="${nh}">
          <g filter="url(#${id}-ink)">${blobs.map((b, i) => `<circle id="${id}-c${i}" cx="${b.cx}" cy="${b.cy}" r="0" fill="#fff"/>`).join('')}</g>
        </mask>
        <filter id="${id}-wf" filterUnits="userSpaceOnUse" x="${-nw * .2}" y="${-nh * .2}" width="${nw * 1.4}" height="${nh * 1.4}">
          <feTurbulence type="fractalNoise" baseFrequency="0.009" numOctaves="2" seed="11" result="n"/>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="90" xChannelSelector="R" yChannelSelector="G"/>
          <feGaussianBlur stdDeviation="10"/>
        </filter>
        <clipPath id="${id}-clip"><rect x="${fx}" y="${fy}" width="${cw}" height="${ch}"/></clipPath>
        <linearGradient id="${id}-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#f0d995"/><stop offset=".45" stop-color="#b8863a"/><stop offset=".7" stop-color="#e9cf8a"/><stop offset="1" stop-color="#a5782c"/>
        </linearGradient>
      </defs>
      <g id="${id}-wash" filter="url(#${id}-wf)" style="mix-blend-mode:multiply;fill:var(--wash)" opacity="0">
        <ellipse id="${id}-w1" cx="${nw * .5}" cy="${nh * .5}" rx="${nw * .5}" ry="${nh * .5}"/>
        <ellipse id="${id}-w2" cx="${nw * .5}" cy="${nh * .3}" rx="${nw * .36}" ry="${nh * .26}"/>
      </g>
      <g id="${id}-main" mask="url(#${id}-mask)">
        ${behind ? '' : charSvg}
        <g transform="${tf}">
          <g clip-path="url(#${id}-clip)">
            <rect x="${fx}" y="${fy}" width="${cw}" height="${ch}" fill="#efe4cf"/>
            <g id="${id}-sway">${photoSvg}</g>
            <rect x="${fx}" y="${fy}" width="${cw}" height="${ch}" fill="#d9b98a" opacity="${behind ? .08 : .16}" style="mix-blend-mode:multiply"/>
            <rect x="${fx}" y="${fy}" width="${cw}" height="${ch}" filter="url(#photoGrain)" opacity="${behind ? .3 : .6}" style="mix-blend-mode:multiply"/>
            ${behind ? '' : `<rect x="${fx - 4}" y="${fy - 4}" width="${cw + 8}" height="${ch + 8}" fill="none" stroke="rgba(70,45,10,.4)" stroke-width="14"/>`}
          </g>
          ${behind ? '' : `<rect x="${fx}" y="${fy}" width="${cw}" height="${ch}" fill="none" stroke="url(#${id}-gold)" stroke-width="5"/>`}
        </g>
        ${behind ? charSvg : ''}
      </g>
      <g fill="none" stroke-linecap="round" filter="url(#rough)" style="stroke:var(--ink)" stroke-width="${Math.max(5, nw * 0.0068).toFixed(1)}">
        ${burstD.map((d, i) => `<path id="${id}-b${i}" d="${d}"/>`).join('')}
      </g>`;

    const api = { svg, burstCount: burstD.length };
    /* must be called after the svg is in the document (needs path lengths + element lookups) */
    api.init = function () {
      const g = (s) => document.getElementById(id + '-' + s);
      const circles = blobs.map((b, i) => g('c' + i)), disp = g('disp'), main = g('main'), wash = g('wash'), w1 = g('w1'), w2 = g('w2'), sway = g('sway');
      const washMax = parseFloat(getComputedStyle(svg).getPropertyValue('--wash-o')) || 0.3;   // set per tone in style.css
      const bursts = burstD.map((d, i) => { const p = g('b' + i), len = p.getTotalLength() || 200; p.style.strokeDasharray = len; p.style.strokeDashoffset = len; return { p, len }; });
      /* ink bleed: p = 0 (nothing) … 1 (fully revealed) */
      api.setReveal = function (p) {
        blobs.forEach((b, i) => circles[i].setAttribute('r', (b.R * clamp((p - b.d) / (1 - b.d))).toFixed(1)));
        disp.setAttribute('scale', (160 * (1 - p) + 18).toFixed(1));
        const k = 0.55 + 0.45 * p; w1.setAttribute('rx', nw * .5 * k); w1.setAttribute('ry', nh * .5 * k); w2.setAttribute('rx', nw * .36 * k); w2.setAttribute('ry', nh * .26 * k);
        wash.setAttribute('opacity', (washMax * clamp(p * 1.8)).toFixed(3));
        main.setAttribute('mask', p >= 0.995 ? 'none' : `url(#${id}-mask)`);
      };
      api.setBurst = (i, v) => { if (bursts[i]) bursts[i].p.style.strokeDashoffset = bursts[i].len * (1 - v); };
      api.setSway = (deg) => sway.setAttribute('transform', `translate(${fcx} ${fcy}) rotate(${deg.toFixed(3)}) scale(1.06) translate(${-fcx} ${-fcy})`);
      api.setReveal(0); api.setSway(0);
    };
    return api;
  }

  /* ---------------------------------------------------------------------------
     4. State filled in by main()
     --------------------------------------------------------------------------- */
  const stage = $('#stage'), scenesRoot = $('#scenes');
  const S = {};            // scene objects
  const bgLayers = [];     // [{stage, back}]
  let assets = {}, DUR = 0, EXPORT_NOW = Date.now();
  const SEQ = ['groom', 'meets', 'bride', 'save'];

  function pickBackgrounds() {
    const list = (C.backgrounds && C.backgrounds.length) ? C.backgrounds : [{ src: '', tone: 'light' }];
    const mode = C.bgMode || 'perScene', n = SEQ.length;
    if (mode === 'single') return Array(n).fill(list[0]);
    if (mode === 'random') {
      const r = rng(Q.get('seed') ? +Q.get('seed') : (Date.now() & 0xffffff)), pool = list.slice();
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
      return Array.from({ length: n }, (_, i) => pool[i % pool.length]);
    }
    return Array.from({ length: n }, (_, i) => list[i % list.length]);
  }

  function buildBackgrounds(bgs) {
    const fallback = (tone) => tone === 'dark'
      ? 'radial-gradient(ellipse at 50% 40%, #26345c, #11172e 75%)'
      : 'radial-gradient(ellipse at 50% 40%, #fbf6ea, #eadfc8 80%)';
    const wrap = $('#bgs'), back = $('#backdrop');
    bgs.forEach((b, i) => {
      const css = (b.src ? `url("${b.src}"), ` : '') + fallback(b.tone);
      const a = h('div', 'bg'), z = h('div', 'bg');
      a.style.backgroundImage = z.style.backgroundImage = css;
      a.style.opacity = i === 0 ? 1 : 0; z.style.opacity = i === 0 ? 1 : 0;
      wrap.appendChild(a); if (!EXPORT) back.appendChild(z);
      bgLayers.push({ a, z });
    });
  }
  const setBg = (i, v) => { bgLayers[i].a.style.opacity = v; bgLayers[i].z.style.opacity = v; };
  const drift = (v) => {      // slow floating motion of the wallpapers
    const tr = REDUCED ? 'scale(1.03)' : `translate3d(${(12 * Math.sin(v * 10.7)).toFixed(2)}px,${(9 * Math.cos(v * 8.2)).toFixed(2)}px,0) scale(1.04)`;
    bgLayers.forEach((l) => { l.a.style.transform = tr; });
  };

  /* ---------------------------------------------------------------------------
     5. Scene builders (DOM)
     --------------------------------------------------------------------------- */
  function typedLine(text, cls) {
    const node = h('div', 'cap ' + cls), on = h('span', 'on'), off = h('span', 'off');
    node.append(on, off);
    if (isRTL(text)) { node.classList.add('rtl'); node.setAttribute('dir', 'rtl'); node.setAttribute('lang', 'ur'); }
    const chars = splitChars(text);
    const set = (n) => { on.textContent = chars.slice(0, n).join(''); off.textContent = chars.slice(n).join(''); };
    set(0);
    return { node, chars, set };
  }

  function photoFor(kind) {
    const p = C.photos || [];
    return kind === 'groom' ? (p[0] || 'assets/photos/groom-child.jpg') : (p[1] || 'assets/photos/bride-child.jpg');
  }
  /* on-screen size of a character = natural PNG size x a scale factor (config.layout), centred */
  const LAY = Object.assign({ soloScale: 0.82, pairScale: 0.58 }, C.layout || {});
  const natW = (kind) => { const c = assets[kind + 'Char']; return c ? c.naturalWidth : 928; };
  const frameFor = (kind) => Object.assign({}, DEF_FRAME[kind], ((C.framePos || {})[kind]) || {});

  function personScene(kind, tone) {
    const sec = h('section', 'scene person ' + kind); sec.dataset.tone = tone;
    const wrap = h('div', 'art-wrap'), plate = h('div', 'plate');
    const wpx = natW(kind) * LAY.soloScale; wrap.style.width = wpx + 'px'; wrap.style.left = ((1080 - wpx) / 2) + 'px';
    const art = buildArt({ id: 'a-' + kind, kind, char: assets[kind + 'Char'], photo: assets[kind + 'Photo'], frame: frameFor(kind), seed: kind === 'groom' ? 7 : 19 });
    wrap.appendChild(art.svg);
    const name = kind === 'groom' ? C.groom : C.bride;
    const cap = (kind === 'groom' ? C.groomCaption : C.brideCaption) || [];
    const who = h('div', 'who', C.showNamesOnStory === false ? '' : (name || ''));
    const caps = h('div', 'caps'), lines = cap.map((t, i) => typedLine(t, i === 0 ? 'bold' : 'light'));
    lines.forEach((l) => caps.appendChild(l.node));
    sec.append(plate, wrap, who, caps); scenesRoot.appendChild(sec);
    art.init();
    return { sec, wrap, art, who, lines, caps };
  }

  function meetsScene(tone) {
    const sec = h('section', 'scene meets'); sec.dataset.tone = tone;
    const word = h('div', 'meets-word', L.meets);
    const sw = document.createElementNS(NS, 'svg'); sw.setAttribute('class', 'swash'); sw.setAttribute('viewBox', '0 0 600 80');
    sw.innerHTML = '<path id="meets-swash" d="M8 52 C120 18 210 70 330 40 S520 22 592 46"/>';
    sec.append(word, sw); scenesRoot.appendChild(sec);
    const p = sw.querySelector('path'), len = p.getTotalLength() || 620; p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
    return { sec, word, p, len };
  }

  function saveScene(tone) {
    const sec = h('section', 'scene save'); sec.dataset.tone = tone;
    const arc = document.createElementNS(NS, 'svg'); arc.setAttribute('class', 'arc'); arc.setAttribute('viewBox', '0 0 1080 560');
    const label = L.saveTheDate, chars = splitChars(label);
    arc.innerHTML = `<defs><path id="arcPath" d="M150 520 A520 520 0 0 1 930 520"/></defs>
      <text id="arcText" text-anchor="middle"><textPath href="#arcPath" startOffset="50%">${chars.map((c) => `<tspan>${c === ' ' ? '&#160;' : c.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</tspan>`).join('')}</textPath></text>
      <path class="swash" id="arcSwash" d="M225 515 A470 470 0 0 1 855 515"/>`;
    const bigDate = h('div', 'big-date', C.dateShort || '');
    const gArt = buildArt({ id: 'a-sg', kind: 'groom', char: assets.groomChar, photo: assets.groomPhoto, frame: Object.assign(frameFor('groom'), { burst: 'none' }), seed: 7 });
    const bArt = buildArt({ id: 'a-sb', kind: 'bride', char: assets.brideChar, photo: assets.bridePhoto, frame: Object.assign(frameFor('bride'), { burst: 'none' }), seed: 19 });
    const gw = h('div', 'pair g'), bw = h('div', 'pair b'); gw.appendChild(gArt.svg); bw.appendChild(bArt.svg);
    const gW = natW('groom') * LAY.pairScale, bW = natW('bride') * LAY.pairScale, x0 = (1080 - (gW + bW - 30)) / 2;
    gw.style.width = gW + 'px'; gw.style.left = x0 + 'px'; bw.style.width = bW + 'px'; bw.style.left = (x0 + gW - 30) + 'px';
    const names = h('div', 'pair-names', `${C.groom || ''} & ${C.bride || ''}`), pdate = h('div', 'pair-date', C.dateLong || '');
    sec.append(arc, bigDate, gw, bw, names, pdate); scenesRoot.appendChild(sec);
    const hint = $('#hint');
    gArt.init(); bArt.init();
    const text = arc.querySelector('#arcText'), tsp = Array.from(arc.querySelectorAll('tspan')), path = arc.querySelector('#arcPath'), sw = arc.querySelector('#arcSwash');
    const swLen = sw.getTotalLength() || 900; sw.style.strokeDasharray = swLen; sw.style.strokeDashoffset = swLen;
    return { sec, arc, text, tsp, path, sw, swLen, bigDate, gArt, bArt, gw, bw, names, pdate };
  }

  /* ---------------------------------------------------------------------------
     Scroll page (the part you scroll down to after the animated story)
     The markup lives in index.html (#more); every text is filled from config.js.
     Elements fade + rise ONE AFTER ANOTHER as they scroll into view.
     --------------------------------------------------------------------------- */
  const cdEl = {};
  function closingParts() {              // "Awaiting to welcome all family members" -> two lines
    const c = C.closing;
    if (Array.isArray(c)) return [c[0] || '', c[1] || ''];
    const w = String(c || '').split(/\s+/);
    return [w.slice(0, 3).join(' '), w.slice(3).join(' ')];
  }
  const waNumber = () => { const d = String(C.whatsapp || '').replace(/[\s+\-]/g, ''); return /^\d{8,15}$/.test(d) ? d : ''; };
  const mapQ = () => encodeURIComponent(C.mapQuery || ((C.venue || '') + ' ' + (C.area || '')));
  function buildScroll() {
    const root = $('#more');
    document.querySelectorAll('#more [data-l], #hint [data-l]').forEach((n) => setText(n, L[n.dataset.l] || ''));
    root.querySelectorAll('[data-k]').forEach((n) => setText(n, C[n.dataset.k] || ''));
    const cp = closingParts(); setText($('#closeA'), cp[0]); setText($('#closeB'), cp[1]);
    ['days', 'hours', 'minutes', 'seconds'].forEach((k) => { cdEl[k] = $('#cd-' + k); });

    (C.events || []).forEach((e) => {
      const d = h('div', 'schedule-item'); d.append(h('span', 'schedule-time', e.time), h('span', 'schedule-label', e.label)); $('#tl').appendChild(d);
    });

    const img = $('#venueImg'), box = img.parentElement;
    img.addEventListener('error', () => { img.style.display = 'none'; box.classList.add('venue-placeholder'); });
    img.src = C.venuePhoto || 'assets/venue.jpg';
    $('#mapbtn').href = 'https://www.google.com/maps/search/?api=1&query=' + mapQ();

    const sel = $('#guests');
    for (let n = 1; n <= 8; n++) { const o = document.createElement('option'); o.value = n; o.textContent = n + ' ' + (n === 1 ? L.guestOne : L.guestMany); sel.appendChild(o); }
    $('#name').placeholder = L.rsvpName;
      
    const form = $('#form'), thanks = $('#thanks'); let sending = false, thanksTimer = null;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (sending) return;
      const f = new FormData(form), attending = f.get('att') === 'yes', name = String(f.get('name') || '').trim(), guests = f.get('guests');
      if (!name) return;
      let msg = fill(attending ? L.rsvpMessageYes : L.rsvpMessageNo) + '\n' + L.rsvpName + ': ' + name;
      if (attending) msg += '\n' + L.rsvpGuests + ': ' + guests + ' ' + (guests === '1' ? L.guestOne : L.guestMany);
      const btn = form.querySelector('button[type=submit]'); sending = true; btn.disabled = true;
      if (C.rsvpEndpoint) {
        try {
          await fetch(C.rsvpEndpoint, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ groom: C.groom, bride: C.bride, name, reply: attending ? 'Attending' : 'Declined', guests: attending ? +guests : 0, message: msg, at: new Date().toISOString() }) });
        } catch (err) {}
      }
      form.reset();
      setText(thanks, attending ? L.rsvpThanksYes : L.rsvpThanksNo); thanks.hidden = false;
      clearTimeout(thanksTimer); thanksTimer = setTimeout(() => { thanks.hidden = true; }, 8000);
      sending = false; btn.disabled = false;
      if (C.rsvpWhatsapp === true && waNumber()) window.open('https://wa.me/' + waNumber() + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
    });
    /* RSVP: opens WhatsApp with a pre-filled message; optionally also POSTs JSON to config.rsvpEndpoint */
  }

  /* one-after-another reveal while scrolling */
  const STEP = 200;                       // milliseconds between two elements
  const revealQueue = []; let draining = false;
  function drain() {
    if (draining) return; draining = true;
    (function next() {
      const el = revealQueue.shift();
      if (!el) { draining = false; return; }
      el.classList.add('in');
      setTimeout(next, revealQueue.length > 2 ? 70 : STEP);   // catch up if the guest scrolls fast
    })();
  }
  const io = ('IntersectionObserver' in window) ? new IntersectionObserver((es) => {
    const seen = es.filter((e) => e.isIntersecting).map((e) => e.target);
    seen.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1);
    seen.forEach((el) => { io.unobserve(el); revealQueue.push(el); });
    drain();
  }, { threshold: 0.1, rootMargin: '0px 0px -4% 0px' }) : null;

  let scrollOpen = false;
  function openScroll() {
    if (scrollOpen || EXPORT) return; scrollOpen = true;
    document.body.classList.add('scrolling');
    $('#scrollwrap').style.visibility = 'visible';
    const m = $('#map'); if (!m.src) m.src = 'https://www.google.com/maps?q=' + mapQ() + '&output=embed';
    $('#hint').classList.add('live');
    document.querySelectorAll('#more .rv').forEach((e) => { if (io) io.observe(e); else e.classList.add('in'); });
  }
  function closeScroll() {                // used by Replay
    if (!scrollOpen) return; scrollOpen = false;
    document.body.classList.remove('scrolling'); window.scrollTo(0, 0);
    $('#scrollwrap').style.visibility = 'hidden'; $('#hint').classList.remove('live'); stage.style.visibility = 'visible';
    revealQueue.length = 0; draining = false;
    document.querySelectorAll('#more .rv').forEach((e) => { e.classList.remove('in'); if (io) io.unobserve(e); });
  }
  window.addEventListener('scroll', () => { if (scrollOpen) stage.style.visibility = window.scrollY > window.innerHeight * 0.98 ? 'hidden' : 'visible'; }, { passive: true });
  $('#hint').addEventListener('click', () => { openScroll(); window.scrollTo({ top: window.innerHeight, behavior: 'smooth' }); });
  /* Countdown (live: real clock; export has no scroll page) */
  function renderCountdown(nowMs) {
    if (!cdEl.days) return;
    const target = Date.parse(C.dateISO), diff = isNaN(target) ? 0 : Math.max(0, target - nowMs);
    const p2 = (n) => String(n).padStart(2, '0');
    cdEl.days.textContent = p2(Math.floor(diff / 864e5)); cdEl.hours.textContent = p2(Math.floor(diff / 36e5) % 24);
    cdEl.minutes.textContent = p2(Math.floor(diff / 6e4) % 60); cdEl.seconds.textContent = p2(Math.floor(diff / 1e3) % 60);
    const dn = $('#cdDone'); const msg = diff <= 0 && !isNaN(target) ? L.countdownDone : '';
    if (dn.textContent !== msg) setText(dn, msg);
  }

  /* ---------------------------------------------------------------------------
     6. Master timeline
     --------------------------------------------------------------------------- */
  function buildTimeline() {
    const dur = SEQ.map((k) => T[k]), start = []; let acc = 0;
    dur.forEach((d) => { start.push(acc); acc += d; });
    DUR = acc;
    const cf = T.crossfade, fo = Math.min(0.6, cf * 0.7);
    tl = gsap.timeline({ paused: true, onComplete: () => document.dispatchEvent(new Event('invite:complete')) });

    /* wallpapers: cross-fade across each scene boundary + slow drift */
    for (let i = 1; i < SEQ.length; i++) anim(start[i] - cf / 2, cf, (v) => setBg(i, v), { ease: 'sine.inOut' });
    anim(0, DUR, drift);

    /* ---- Person scenes ---- */
    function person(key, s, t0, d, seed) {
      const a = s.art;
      anim(t0, 0.5, (v) => vis(s.sec, v), { ease: 'sine.out' });
      anim(t0 + d - fo, fo, (v) => vis(s.sec, 1 - v), { ease: 'sine.in' });
      /* 1. watercolour ink-bleed reveal of character + photo */
      if (REDUCED) { a.setReveal(1); anim(t0 + 0.2, 0.8, (v) => { s.wrap.style.opacity = v; }); }
      else anim(t0 + 0.15, 1.0, (v) => a.setReveal(v), { ease: 'power2.out' });
      /* 2. hand-drawn burst lines */
      for (let i = 0; i < a.burstCount; i++) anim(t0 + (REDUCED ? 0.6 : 0.8 + i * 0.06), REDUCED ? 0.2 : 0.3, (v) => a.setBurst(i, v), { ease: 'power2.out' });
      /* 3. name */
      anim(t0 + 0.9, 0.5, (v) => { s.who.style.opacity = v; s.who.style.transform = `translateY(${((1 - v) * 18).toFixed(1)}px)`; }, { ease: 'power3.out' });
      /* 4. typewriter captions */
      const total = s.lines.reduce((n, l) => n + l.chars.length, 0), t1 = 1.2, t2 = Math.min(d - 1.0, t1 + 1.8), gap = 0.12;
      const rate = REDUCED ? 0.004 : Math.max(0.006, Math.min(0.03, (t2 - t1 - gap * (s.lines.length - 1)) / Math.max(total, 1)));
      let cur = t1;
      s.lines.forEach((l) => { const dd = Math.max(0.05, l.chars.length * rate); anim(t0 + cur, dd, (v) => l.set(Math.round(v * l.chars.length))); cur += dd + gap; });
      /* 5. idle: breathing float 4 px + photo sways ±1.4° */
      idle(t0 + 0.3, d, (v) => { s.wrap.style.transform = `translateY(${(-4 * v).toFixed(2)}px) scale(${(1 + 0.005 * v).toFixed(4)})`; },
        (v) => a.setSway(-1.4 + 2.8 * v), seed);
    }
    person('groom', S.groom, start[0], dur[0], 1);
    person('bride', S.bride, start[2], dur[2], 2);

    /* ---- "meets" ---- */
    (function () {
      const s = S.meets, t0 = start[1], d = dur[1];
      anim(t0, 0.3, (v) => vis(s.sec, v)); anim(t0 + d - 0.35, 0.35, (v) => vis(s.sec, 1 - v));
      anim(t0 + 0.15, 1.15, (v) => { s.word.style.opacity = clamp(v * 1.6); s.word.style.transform = `translateX(${((v - 1) * 430).toFixed(1)}px)`; }, { ease: 'power3.out' });
      anim(t0 + 0.9, 0.8, (v) => { s.p.style.strokeDashoffset = s.len * (1 - v); }, { ease: 'power2.inOut' });
      anim(t0 + d - 1.0, 0.85, (v) => {
        s.word.style.opacity = 1 - v; s.word.style.transform = `translateX(${(v * 110).toFixed(1)}px)`; s.p.style.opacity = 1 - v;
      }, { ease: 'power2.in' });
      idle(t0, d, (v) => { s.word.style.marginTop = (-3 * v).toFixed(2) + 'px'; }, null, 3);
    })();

    /* ---- Save the date ---- */
    (function () {
      const s = S.save, t0 = start[3], d = dur[3];
      anim(t0, 0.5, (v) => vis(s.sec, v));                    // stays on screen: the scroll page continues from here
      /* curved text: outline draws on, then the letters fade in one by one */
      const n = s.tsp.length;
      anim(t0 + 0.2, REDUCED ? 0.4 : 1.5, (v) => {
        s.text.style.strokeDasharray = 700; s.text.style.strokeDashoffset = 700 * (1 - clamp(v / 0.6));
        s.text.style.strokeOpacity = 1 - clamp((v - 0.7) / 0.3);
        s.tsp.forEach((t, i) => t.setAttribute('fill-opacity', clamp((v - (0.3 + 0.5 * i / n)) / 0.25).toFixed(3)));
      }, { ease: 'sine.inOut' });
      anim(t0 + 1.3, 0.7, (v) => { s.sw.style.strokeDashoffset = s.swLen * (1 - v); }, { ease: 'power2.inOut' });
      anim(t0 + 1.2, 0.9, (v) => { s.bigDate.style.opacity = v; s.bigDate.style.transform = `translateY(${((1 - v) * 30).toFixed(1)}px)`; }, { ease: 'power3.out' });
      /* both characters, side by side */
      if (REDUCED) { s.gArt.setReveal(1); s.bArt.setReveal(1); anim(t0 + 0.6, 0.8, (v) => { s.gw.style.opacity = v; s.bw.style.opacity = v; }); }
      else { anim(t0 + 0.4, 1.8, (v) => s.gArt.setReveal(v), { ease: 'power2.inOut' }); anim(t0 + 0.7, 1.8, (v) => s.bArt.setReveal(v), { ease: 'power2.inOut' }); }
      anim(t0 + 2.4, 0.8, (v) => { s.names.style.opacity = v; s.names.style.transform = `translateY(${((1 - v) * 20).toFixed(1)}px)`; }, { ease: 'power3.out' });
      anim(t0 + 2.7, 0.8, (v) => { s.pdate.style.opacity = v; s.pdate.style.transform = `translateY(${((1 - v) * 16).toFixed(1)}px)`; }, { ease: 'power3.out' });
      idle(t0 + 0.4, d, (v) => { s.gw.style.transform = `translateY(${(-4 * v).toFixed(2)}px)`; }, (v) => s.gArt.setSway(-1.4 + 2.8 * v), 1);
      idle(t0 + 0.4, d, (v) => { s.bw.style.transform = `translateY(${(-3.5 * (1 - v)).toFixed(2)}px)`; }, (v) => s.bArt.setSway(1.4 - 2.8 * v), 2);
    })();

    /* "scroll down" hint appears when the story has finished */
    anim(start[3] + 2.0, 0.4, (v) => { $('#hint').style.opacity = v; $('#hint').classList.toggle('live', v > 0.3); if (v > 0.5) openScroll(); else if (v <= 0) closeScroll(); });

    /* make the timeline exactly DUR seconds long */
    tl.to({}, { duration: 0.01 }, DUR - 0.01);

    /* Put every effect into its starting state: jump to the end, then back to 0. */
    tl.time(DUR, false); tl.time(0, false);
    setBg(0, 1);
  }

  /* ---------------------------------------------------------------------------
     7. Controls, audio, start overlay
     --------------------------------------------------------------------------- */
  const ICO = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    replay: '<svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7a6 6 0 11-6 6H4a8 8 0 108-8z"/></svg>',
    vol: '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4zM14 3.2v2.1a7 7 0 010 13.4v2.1a9 9 0 000-17.6z"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M16.5 12a4.5 4.5 0 00-2.5-4v2.2l2.5 2.5zM19 12c0 .9-.2 1.8-.6 2.6l1.5 1.5A8.8 8.8 0 0021 12a9 9 0 00-7-8.8v2.1A7 7 0 0119 12zM4.3 3L3 4.3 7.7 9H3v6h4l5 5v-6.7l4.2 4.2c-.7.5-1.4.9-2.2 1.1v2.1a9 9 0 003.7-1.8l2 2 1.3-1.3L4.3 3zM12 4L9.9 6.1 12 8.2V4z"/></svg>'
  };

  function setupControls() {
    const bPlay = $('#btnPlay'), bRe = $('#btnReplay'), bMute = $('#btnMute'), bar = $('#bar'), fillBar = $('#bar i');
    const au = window.InviteAudio;
    let started = false, ended = false;
    const label = (b, t) => { b.setAttribute('aria-label', t); b.title = t; };
    const paintPlay = () => { const playing = started && !tl.paused() && !ended; bPlay.innerHTML = playing ? ICO.pause : ICO.play; label(bPlay, playing ? L.pause : L.play); };
    const paintMute = () => { const m = au.isMuted(); bMute.innerHTML = m ? ICO.mute : ICO.vol; label(bMute, m ? L.unmute : L.mute); };
    bRe.innerHTML = ICO.replay; label(bRe, L.replay); paintPlay(); paintMute();

    function begin() {
      if (started) return; started = true;
      $('#start').classList.add('hide');
      au.start(0); tl.play(0); paintPlay();
    }
    const finished = () => { ended = true; openScroll(); paintPlay(); };
    function replay() {
      started = true; ended = false; $('#start').classList.add('hide'); closeScroll();
      tl.pause(); tl.time(0, false); tl.play(); au.start(0); paintPlay();
    }
    function toggle() {
      if (!started) return begin();
      if (ended) return replay();
      if (tl.paused()) { tl.play(); au.resume(); } else { tl.pause(); au.pause(); }
      paintPlay();
    }
    document.addEventListener('invite:complete', finished);
    $('#startBtn').addEventListener('click', begin);
    bPlay.addEventListener('click', toggle); bRe.addEventListener('click', replay);
    bMute.addEventListener('click', () => { au.setMuted(!au.isMuted()); paintMute(); });
    window.addEventListener('keydown', (e) => {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.code === 'Space' && !scrollOpen && !/^(A|BUTTON)$/.test(e.target.tagName)) { e.preventDefault(); toggle(); }
      else if (e.key === 'm' || e.key === 'M') { au.setMuted(!au.isMuted()); paintMute(); }
      else if (e.key === 'r' || e.key === 'R') replay();
    });
    /* click the progress bar to jump */
    bar.addEventListener('pointerdown', (e) => {
      if (!started) return;
      const t = clamp((e.clientX - bar.getBoundingClientRect().left) / bar.clientWidth) * DUR;
      ended = false; closeScroll(); tl.time(t, false); au.seek(t); if (t >= DUR - 0.05) finished(); paintPlay();
    });
    (function loop() {
      const t = tl.time(); fillBar.style.width = (clamp(t / DUR) * 100).toFixed(2) + '%';
      bar.setAttribute('aria-valuenow', Math.round(clamp(t / DUR) * 100));
      requestAnimationFrame(loop);
    })();
    setInterval(() => renderCountdown(Date.now()), 1000);
  }

  /* ---------------------------------------------------------------------------
     8. Stage scaling (letter-boxed 9:16 on desktop, fills phones)
     --------------------------------------------------------------------------- */
  function fit() {
    const s = EXPORT ? 1 : Math.min(window.innerWidth / 1080, window.innerHeight / 1920);
    stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  }
  window.addEventListener('resize', fit); fit();

  /* ---------------------------------------------------------------------------
     9. Boot
     --------------------------------------------------------------------------- */
  async function main() {
    const startBtn = $('#startBtn');
    setText($('.s-eventinvite'), C.event || '');
    setText($('.s-names'), `${C.groom || ''} & ${C.bride || ''}`);
    startBtn.textContent = L.loading; $('.s-hint').textContent = L.tapHint;

    if (!window.gsap) { startBtn.textContent = '!'; $('.s-hint').textContent = L.noGsap; console.error(L.noGsap); return; }
    if (gsap.ticker && gsap.ticker.lagSmoothing) gsap.ticker.lagSmoothing(0);

    /* load every asset; anything missing simply becomes null and a placeholder is drawn */
    const chars = C.characters || {};
    const [gc, bc, gp, bp] = await Promise.all([
      loadImg(chars.groom || 'assets/characters/groom.png'), loadImg(chars.bride || 'assets/characters/bride.png'),
      loadImg(photoFor('groom')), loadImg(photoFor('bride'))
    ]);
    assets = { groomChar: gc, brideChar: bc, groomPhoto: gp, bridePhoto: bp };
    const bgs = pickBackgrounds();
    await Promise.all(bgs.map((b) => loadImg(b.src)));
    if (!gc || !bc) console.warn('[invite] character PNG missing → using placeholder silhouette');
    if (!gp || !bp) console.warn('[invite] childhood photo missing → using placeholder');

    buildBackgrounds(bgs);
    const tone = (i) => bgs[i].tone === 'dark' ? 'dark' : 'light';
    S.groom = personScene('groom', tone(0));
    S.meets = meetsScene(tone(1));
    S.bride = personScene('bride', tone(2));
    S.save = saveScene(tone(3));
    buildScroll();

    /* fonts first, so text measuring is correct */
    if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, sleep(4000)]);
    try { await Promise.race([Promise.all([document.fonts.load('700 80px Caveat'), document.fonts.load('300 80px "Cormorant Garamond"'), document.fonts.load('500 40px "Cormorant Garamond"')]), sleep(2500)]); } catch (e) { /* offline */ }

    ['groom', 'bride'].forEach((k) => {
      const s = S[k]; fitText(s.who, 22); s.lines.forEach((l, i) => fitText(l.node, i === 0 ? 44 : 32));
    });
    fitText(S.save.bigDate, 90); fitText(S.save.names, 40); fitText(S.save.pdate, 24);
    /* shrink the curved text if a translation is too long for the arc */
    const pl = S.save.path.getTotalLength() * 0.96; let fs = 124, g = 0;
    while (S.save.text.getComputedTextLength() > pl && fs > 40 && g++ < 60) { fs -= 3; S.save.text.style.fontSize = fs + 'px'; }

    buildTimeline();
    renderCountdown(Date.now());

    /* ?t=12  → jump to 12 s (handy for screenshots / debugging) */
    window.DURATION = DUR;
    window.seek = function (t) {
      tl.pause(); tl.time(clamp(t, 0, DUR), false);
    };
    window.timeline = tl;

    if (EXPORT) { window.__ready = true; return; }

    await window.InviteAudio.init(C.music);
    setupControls();
    if (Q.get('t')) { window.seek(+Q.get('t')); $('#start').classList.add('hide'); }
    startBtn.disabled = false; startBtn.textContent = L.tapToOpen;
    window.__ready = true;
  }

  main().catch((e) => { console.error(e); const b = $('#startBtn'); if (b) b.textContent = '!'; });
})();
