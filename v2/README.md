# Illustrated Wedding Invitation — animated 9:16 video

A hand-illustrated, story-style wedding invitation that plays in the browser (1080 × 1920, about 30 seconds)
and can be exported as an MP4.

Scenes: tap-to-open front page (blurred) → **Groom** → **"meets"** → **Bride** → **Save the Date** (the couple together) → then a **scroll-down page** (celebrations + live countdown, schedule, location + map, families, RSVP) whose text appears one after another.

---

## 1. Folder layout

```
wedding-invite/
├── index.html                 page skeleton
├── css/style.css              look & layout
├── js/
│   ├── config.js              ★ the ONLY file you normally edit (all text, timing, colours, photo positions)
│   ├── app.js                 scenes + the GSAP master timeline
│   └── audio.js               music (your mp3, or a built-in synthesised melody)
├── assets/
│   ├── characters/groom.png, bride.png      transparent PNG bodies with an EMPTY gold frame
│   ├── photos/groom-child.jpg, bride-child.jpg
│   ├── backgrounds/bg1.jpg … bg6.jpg
│   └── music.mp3              (optional – add your own song)
├── scripts/
│   ├── export-video.js        MP4 exporter
│   └── static-server.js       tiny local web server
├── package.json
└── README.md
```

---

## 2. Preview it (no programming needed)

1. Install **Visual Studio Code** and open this folder (`File → Open Folder`).
2. Install the extension **Live Server** (Ritwick Dey): Extensions icon (left bar) → search "Live Server" → Install.
3. Right-click `index.html` → **Open with Live Server**. Your browser opens the invitation.
4. Tap **Tap to open** (browsers only allow sound after a tap). Use the buttons top-right for play/pause, replay and mute
   (keyboard: **Space**, **R**, **M**). Click the thin bar at the very top to jump around.

Whenever you save `js/config.js`, Live Server refreshes automatically.

> Internet is needed once per visit for the animation library (GSAP) and the Google Fonts. Everything else is local.

**Preview on your phone:** run `npm start` (see below) and open the printed address on a phone on the same Wi-Fi.

Handy URL options: `?reduced=1` (calm, no-motion version), `?t=20` (jump to 20 s), `?seed=3` (fixed shuffle in `random` background mode).

---

## 3. Export to MP4

You need two programs, installed once:

| Program | How (Windows PowerShell) |
|---|---|
| **Node.js** (LTS) | download from https://nodejs.org and install, or `winget install OpenJS.NodeJS.LTS` |
| **ffmpeg** | `winget install Gyan.FFmpeg` — then **close and re-open** VS Code / the terminal |

Then, in the VS Code terminal (`Terminal → New Terminal`) inside this folder:

```powershell
npm install          # one time; downloads Puppeteer + a private Chrome (~200 MB)
npm run export       # creates invite.mp4 in this folder
```

What happens: the page is opened invisibly at 1080 × 1920, the timeline is stepped **frame by frame at 30 fps**
(so the result is perfectly smooth and identical every time, even on a slow computer), PNG frames are saved to a temporary
`export-frames/` folder, and ffmpeg encodes `invite.mp4` with music mixed in and a 1.5 s fade-out.
Expect roughly 8–15 minutes for the 35-second film. The internet must be on (GSAP + fonts).

Options (put them after `--`):

```powershell
npm run export -- --fps 30 --out my-invite.mp4
npm run export -- --music "C:\path\to\song.mp3"     # use a different song just for this export
npm run export -- --keep-frames                      # keep the PNGs
```

Music rule: if `assets/music.mp3` exists it is used (looped/trimmed to the film length); otherwise the built-in
synthesised melody is rendered and used.

Troubleshooting
- *"ffmpeg was not found"* → install it (table above) and re-open the terminal.
- *Fonts look plain* → no internet during export; reconnect and run again.
- *Video too heavy for WhatsApp* → re-encode: `ffmpeg -i invite.mp4 -crf 26 -preset slow invite-small.mp4`.

---

## 4. Customise — cheat sheet

1. **Text** – open `js/config.js`. Names, dates, captions, venue, parents, labels ("SAVE THE DATE", button texts…) are all there.
2. **Captions** – (birth dates were removed) `groomCaption`, `brideCaption` (first line bold, the rest lighter). Urdu script works and flips to right-to-left automatically.
3. **Photos** – replace `assets/photos/groom-child.jpg` and `bride-child.jpg` (or list two paths in `photos: [...]`).
4. **Photo position inside the frame** – `framePos.groom` / `framePos.bride`: `x, y, w, h` (percent of the character image), `rotate`, `scale`, `zoom`, `focusX/focusY` (which part of the photo to keep).
5. **Characters** – replace `assets/characters/groom.png` / `bride.png` with transparent PNGs that have an empty frame; re-tune `framePos` to match. Missing PNG → a soft silhouette is shown.
6. **Backgrounds** – replace `assets/backgrounds/bg1…bg6.jpg`; in `config.backgrounds` set each one's `tone` (`"light"` or `"dark"`) so the text colour stays readable. Choose `bgMode: "perScene" | "random" | "single"`.
7. **Timing** – `timing: { groom, meets, bride, save, crossfade }` in seconds; the film length is their sum.
8. **Colours** – `theme` in `config.js` (ink, gold accent, watercolour stain).
9. **Music** – drop your song at `assets/music.mp3` (or change `music`). No file → built-in melody.
10. **Responses (RSVP)** – `whatsapp` number (digits, with country code). Optionally set `rsvpEndpoint` to a URL (e.g. a Google Apps Script web app) and each reply is also POSTed there as JSON.

---

## 5. Notes

- **MP4 export covers only the animated part** (front page → Save the Date). The scroll-down page is an interactive web page (countdown, map, RSVP) and is not part of the video.
- Scroll-down sections: edit texts in `config.js` (`labels`, `events`, `venue`, `area`, `groomParents`, `brideParents`, `closing`, `rsvpNote`); backgrounds in `scrollBackgrounds`; venue photo `venuePhoto`.

- The 9:16 stage is letterboxed on desktop and scaled to fit phones; a blurred copy of the wallpaper fills any spare screen.
- `prefers-reduced-motion` (or `?reduced=1`) swaps the ink-bleed, floating and typing for calm fades.
- No tracking, no analytics, no watermarks. Only external requests: GSAP (cdnjs) and Google Fonts.
- Uploading online: put the whole folder on any static host (Netlify, GitHub Pages, …).
