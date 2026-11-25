/* =============================================================================
   export-video.js — turns the animated invitation into a real MP4.

   How: opens index.html?export=1 in headless Chrome at 1080x1920, steps the GSAP master
   timeline frame by frame (window.seek(t)), saves a PNG for every frame, then asks ffmpeg to
   encode them to invite.mp4 with your music (or the built-in synthesised music) and a
   1.5 s fade-out. Because nothing runs in real time, the result is identical on every run.

   NOTE: only the animated story is exported; the scroll-down page is not part of the video.

   Usage:   npm run export
   Options: npm run export -- --fps 30 --out invite.mp4 --keep-frames --music path/to/song.mp3
   ============================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { startServer, ROOT } = require('./static-server');

/* ---------- options ---------- */
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def; };
const FPS = Number(opt('fps', 30));
const OUT = path.resolve(ROOT, opt('out', 'invite.mp4'));
const KEEP = argv.includes('--keep-frames');
const W = 1080, H = 1920, FADE = 1.5;
const FRAMES_DIR = path.join(ROOT, 'export-frames');
const TMP_AUDIO = path.join(ROOT, 'export-frames', 'synth-music.wav');

function die(msg) { console.error('\n✖ ' + msg + '\n'); process.exit(1); }

/* ---------- checks ---------- */
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { die('Puppeteer is not installed. Run:  npm install'); }
const ff = spawnSync('ffmpeg', ['-version']);
if (ff.error || ff.status !== 0) {
  die('ffmpeg was not found. Install it first:\n   Windows (PowerShell):  winget install Gyan.FFmpeg   (then close and re-open the terminal)\n   macOS: brew install ffmpeg      Linux: sudo apt install ffmpeg');
}

(async () => {
  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  const server = await startServer(0);
  const url = `http://127.0.0.1:${server.address().port}/index.html?export=1`;
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--font-render-hinting=none', '--autoplay-policy=no-user-gesture-required'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.warn('page error:', e.message));
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });
    await page.waitForFunction('window.__ready === true', { timeout: 90000 })
      .catch(() => die('The page did not become ready. Is your internet on (GSAP + fonts load from a CDN)?'));
    const duration = await page.evaluate('window.DURATION');
    const total = Math.round(duration * FPS);
    console.log(`Film length ${duration}s -> ${total} frames at ${FPS} fps (${W}x${H})`);

    /* ---------- 1. frames ---------- */
    const t0 = Date.now();
    for (let i = 0; i < total; i++) {
      await page.evaluate((t) => window.seek(t), i / FPS);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.screenshot({ path: path.join(FRAMES_DIR, `frame_${String(i + 1).padStart(5, '0')}.png`), type: 'png' });
      if (i % 15 === 0 || i === total - 1) {
        const pct = ((i + 1) / total * 100).toFixed(0), eta = ((Date.now() - t0) / (i + 1) * (total - i - 1) / 1000).toFixed(0);
        process.stdout.write(`\r  frame ${i + 1}/${total}  (${pct}%)  ~${eta}s left   `);
      }
    }
    process.stdout.write('\n');

    /* ---------- 2. audio ---------- */
    let audio = opt('music', null);
    if (audio) audio = path.resolve(audio);
    else {
      const cfg = await page.evaluate('window.INVITE && window.INVITE.music');
      const candidate = cfg ? path.resolve(ROOT, cfg) : null;
      if (candidate && fs.existsSync(candidate)) audio = candidate;
    }
    if (audio) console.log('Music: ' + path.relative(ROOT, audio));
    else {
      console.log('Music: no assets/music.mp3 found -> rendering the built-in synthesised melody');
      const b64 = await page.evaluate((d) => window.renderSynthWav(d), duration);
      fs.writeFileSync(TMP_AUDIO, Buffer.from(b64, 'base64'));
      audio = TMP_AUDIO;
    }

    /* ---------- 3. encode ---------- */
    const fadeStart = Math.max(0, duration - FADE).toFixed(3);
    const args = [
      '-y', '-framerate', String(FPS), '-i', path.join(FRAMES_DIR, 'frame_%05d.png'),
      '-stream_loop', '-1', '-i', audio,                                    // loop short music so it always covers the film
      '-filter_complex',
      `[0:v]fade=t=out:st=${fadeStart}:d=${FADE},format=yuv420p[v];[1:a]atrim=0:${duration},afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeStart}:d=${FADE}[a]`,
      '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-r', String(FPS), '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', String(duration), OUT
    ];
    console.log('Encoding with ffmpeg…');
    await new Promise((resolve, reject) => {
      const p = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'inherit'] });
      p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error('ffmpeg exited with code ' + c))));
      p.on('error', reject);
    });
    console.log(`\n✔ Done: ${OUT}`);
  } finally {
    await browser.close();
    server.close();
    if (!KEEP) fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  }
})().catch((e) => die(e.message || String(e)));
