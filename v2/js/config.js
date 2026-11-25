/* =============================================================================
   config.js  —  EVERYTHING you normally need to edit lives in this one file.
   Every word shown on screen comes from here. Save the file and refresh the page.
   ============================================================================= */
window.INVITE = {
  
  rsvpEndpoint: "https://script.google.com/macros/s/AKfycbxEK3IF--430yVIJ8RAGU2n8yPJR3EV5BqObWNQS5W3yseu_GkEQTOKA2JrQhrc04-p/exec",
   rsvpWhatsapp: false,

  /* ---------- People & event (your data) ---------- */
  groom: "Pir Muhammad",
  bride: "Khansa Maqsood",
  dateISO: "2026-12-19T19:30:00+05:00",          // used by the live countdown
  dateShort: "19.12.26",                          // big date on the Save-the-Date scene
  dateLong: "Saturday, 19 December 2026",
  events: [{ time: "7:30 PM", label: "Gathering" }, { time: "9:00 PM", label: "Dinner" }],
  venue: "Bella Vista",
  area: "Gulistan-e-Jauhar, Karachi",
  mapQuery: "Bella Vista Gulistan-e-Jauhar Karachi",
  whatsapp: "923331539727",                       // digits only, with country code
  rsvpNote: "Kindly let us know if you can join us",
  groomParents: "Mrs & Lt Col Irshad Ahmed, TI(Mil)",
  brideParents: "Mr & Mrs Maqsood Hussain Soomro",
  closing: "Awaiting to welcome all family members",   // shown on two lines (first 3 words / the rest); or give an array of 2 lines
  event: "Valima Reception",
  eventinvite: "Valima Reception Invite of",                      // small line on the opening screen

  /* ---------- Story scenes (edit these!) ----------
     First line is drawn bold; every following line is lighter and smaller.
     Urdu / Arabic script works too (it switches to a Nastaliq font and right-to-left automatically). */
  groomCaption: ["AKA ghar ka bada beta","sabka ladla n calm"],
  brideCaption: ["AKA ghar ki bari beti", "confident n unbothered"],
  showNamesOnStory: true,                         // small name line under each picture

  /* ---------- Photos ----------
     Leave [] to use assets/photos/groom-child.jpg and assets/photos/bride-child.jpg.
     Or list two paths: [ "assets/photos/a.jpg", "assets/photos/b.jpg" ]  (groom first, bride second) */
  photos: [],

  /* ---------- Character artwork ----------
     Painted figures with a TRANSPARENT frame opening: the photo is placed BEHIND them.
     (If your PNG has a solid cream opening instead, set photoLayer: "front".) */
  characters: {
    groom: "assets/characters/groom.png",
    bride: "assets/characters/bride.png"
  },
  photoLayer: "behind",                           // "behind" | "front"

  /* Where the childhood photo sits in the frame. All numbers are PERCENT of the character PNG.
       x, y        centre of the frame opening      w, h    size of the opening
       margin      how far the photo reaches under the frame edge (percent)
       rotate      tilt in degrees                  scale   extra size multiplier
       focusX/Y    which part of the photo stays visible (0-100)    zoom  zoom into the photo
       burst       side of the hand-drawn "pop" lines: "left" | "right" | "both" | "none" */
  framePos: {
    groom: { x: 49.9,  y: 29.68, w: 43.69, h: 24.62, margin: 1.8, rotate: 0, scale: 1, focusX: 50, focusY: 50, zoom: 1,    burst: "right" },
    bride: { x: 47.92, y: 33.52, w: 44.37, h: 28.34, margin: 1.8, rotate: 0, scale: 1, focusX: 55, focusY: 45, zoom: 1.12, burst: "left"  }
  },
  /* On-screen size of the figures = PNG size x factor (solo pages / couple page) */
  layout: { soloScale: 0.82, pairScale: 0.58 },

  /* ---------- Backgrounds ----------
     bgMode: "perScene" -> background i is used for scene i (groom, meets, bride, save the date)
             "random"   -> backgrounds are shuffled on every page load
             "single"   -> only the first background is used
     tone:   "light" (dark ink on pale paper) or "dark" (light ink on navy). Sets the text colour. */
  bgMode: "perScene",
  backgrounds: [
    { src: "assets/backgrounds/bg1.jpg", tone: "light" },   // groom
    { src: "assets/backgrounds/bg2.jpg", tone: "dark"  },   // "meets"
    { src: "assets/backgrounds/bg3.jpg", tone: "light" },   // bride
    { src: "assets/backgrounds/bg4.jpg", tone: "dark"  }    // couple / save the date
  ],
  /* Backgrounds of the scroll-down part */
  scrollBackgrounds: {
    celebrations: "assets/backgrounds/scroll-celebrations.jpg",   // celebrations + schedule
    location: "assets/backgrounds/scroll-location.jpg",           // venue + map
    welcome: "assets/backgrounds/scroll-welcome.jpg"              // families + RSVP
  },
  venuePhoto: "assets/venue.jpg",                 // photo of the venue (optional)

  /* ---------- Music ----------
     If this file is missing, a soft melody is synthesised in the browser instead. */
  music: "assets/music.mpeg",

  /* ---------- Timing in seconds (total = sum, about 35 s) ---------- */
  timing: { groom: 4, meets: 1.8, bride: 4, save: 6, crossfade: 0.6 },

  /* ---------- Colours ---------- */
  theme: {
    inkLight: "#172e50",     // text on light backgrounds
    inkDark: "#e9eefb",      // text on dark backgrounds
    accentLight: "#a88a59",  // gold accent on light backgrounds
    accentDark: "#e6c56c",   // gold accent on dark backgrounds
    washLight: "#9db6e3",    // watercolour stain behind characters (light)
    washDark: "#6f86b3"      // watercolour stain behind characters (dark)
  },

  /* ---------- Every other word on screen ---------- */
  labels: {
    tapToOpen: "Tap to open",
    tapHint: "Sound on for the full experience",
    loading: "Loading…",
    meets: "meets",
    saveTheDate: "SAVE THE DATE",
    scrollDown: "Scroll down",
    // scroll-down part
    togetherWith: "Together with their families",
    celebrationsBegin: "The celebrations begins",
    days: "days", hours: "hrs", minutes: "mins", seconds: "secs",
    countdownDone: "The celebration has begun",
    joinUsFor: "Join us for",
    scheduleTitle: "Schedule of Events",
    celebratingAt: "We will be celebrating at",
    locationTitle: "Location",
    openMaps: "Open in Google Maps",
    venueFallback: "Venue",
    mapTitle: "Venue location on Google Maps",
    blessings: "With the blessings of",
    and: "and",
    rsvpPresence: "Your presence means the world to us",
    rsvpTitle: "RSVP",
    rsvpName: "Your name",
    rsvpAccept: "Accept with pleasure",
    rsvpDecline: "Decline with regret",
    rsvpGuests: "Guests",
    guestOne: "guest", guestMany: "guests",
    rsvpSend: "Send my reply",
    rsvpThanksYes: "Thank you! Your reply is on its way.",
    rsvpThanksNo: "Thank you for letting us know. You will be missed.",
    play: "Play", pause: "Pause", replay: "Replay", mute: "Mute", unmute: "Unmute",
    pageTitle: "{groom} & {bride} — Wedding Invitation",
    noGsap: "The animation library could not be loaded. Please check your internet connection and reload."
  }
};
