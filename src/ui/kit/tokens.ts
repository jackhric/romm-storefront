// Steam's own design tokens (custom properties on :root in Big Picture) with the values measured on the client as
// fallbacks. Sizes are CSS px in the Big Picture window (1353 wide at 1.42 dpr). See docs/reference/steam/.
const v = (name: string, fallback: string) => `var(--${name}, ${fallback})`;

export const C = {
  page: v("color-greyneutral-4", "#171d25"),
  storePage: "#0f1924",
  surface: v("color-greyneutral-6", "#23262e"),
  surfaceFocus: "#3d4450",
  control: "rgba(172,178,201,.14)",
  controlPrimary: "rgba(220,222,223,.17)",
  selected: "rgba(255,255,255,.15)",
  ink: v("color-greyneutral-2", "#0e141b"),
  title: v("color-text-light-title", "#f1f2f3"),
  subtitle: v("color-text-light-subtitle", "#d6d9dc"),
  body: v("color-text-light-body", "#acb2b8"),
  description: v("color-text-light-description", "#9a9fa5"),
  note: v("color-text-light-note", "#636b74"),
  storeText: "#ccd8e3",
  label: "rgba(255,255,255,.7)",
  blue: v("color-blue-8", "#1a9fff"),
  green: v("color-storegreen-7", "#59bf40"),
  lime: "#a1cd44",
  storePanel: "linear-gradient(rgb(27,56,87), rgba(65,98,135,.5))",
  storeRow: "rgba(103,193,245,.1)",
  storeChip: "rgba(103,193,245,.2)",
  priceChip: "rgb(7,29,53)",
} as const;

export const FONT = v("font-family", '"Motiva Sans", Arial, sans-serif');
export const EASE = "cubic-bezier(.16,.86,.43,.99)";

/** Native page gutter; the store's own pages use 50. */
export const GUTTER = 38;
export const STORE_GUTTER = 50;
export const TOP_BAR = 40;
export const FOOTER = 42;
export const GAP = 12;

export const CAPSULE_W = 172;
export const WIDE_W = 317;
export const WIDE_SMALL_W = 251;

export const STORE_GLOW = "radial-gradient(circle at 50% 5%, rgba(94,174,255,.35) 0%, rgba(94,174,255,.08) 30%, rgba(94,174,255,0) 70%)";

// Steam marks the element with gamepad focus with .gpfocus, so focus needs no React state.
export const KIT_CSS = `
.ctk-page { font-family: ${FONT}; font-size: 16px; line-height: 22px; color: ${C.subtitle}; }
.ctk-page::-webkit-scrollbar, .ctk-strip::-webkit-scrollbar { display: none; }
.ctk-fade { animation: ctk-fade .4s ease-out; }
.ctk-skel { background: #2a2e37; }
@keyframes ctk-fade { from { opacity: 0; } to { opacity: 1; } }

/* Steam's focus ring, drawn on the element itself: Steam's own ring is an overlay placed once at focus time, so it
   neither follows a gliding scroll nor stays under the top bar. Values measured from the client. */
.ctk-ring.gpfocus { outline: 1.4px solid rgba(255,255,255,.6); outline-offset: 2px; animation: ctk-ring-in .4s ease-out, ctk-ring-blink 1.2s ease-in-out .4s 20; }
@keyframes ctk-ring-in { from { outline-offset: 12px; outline-color: rgba(255,255,255,0); } to { outline-offset: 2px; outline-color: rgba(255,255,255,.6); } }
@keyframes ctk-ring-blink { 50% { outline-color: rgba(255,255,255,.24); } }

.ctk-tile { position: relative; flex: 0 0 auto; background: ${C.surface}; }
.ctk-lift { transition: transform .3s ${EASE}, box-shadow .3s ${EASE}; }
.ctk-lift.gpfocus { transform: scale(1.05); box-shadow: 0 16px 24px rgba(0,0,0,.5); z-index: 2; }
img.ctk-art { width: 100%; height: 100%; object-fit: cover; display: block; }
.ctk-banner { background: ${C.ink}; }
.ctk-banner-art { filter: grayscale(1) brightness(.45); transition: filter .2s ease-out; }
.ctk-banner.gpfocus .ctk-banner-art { filter: grayscale(1) brightness(.7); }
.ctk-banner-tint { background: linear-gradient(160deg, rgba(42,110,170,.42) 0%, rgba(27,56,87,.5) 60%, rgba(14,25,40,.6) 100%); transition: opacity .2s ease-out; }
.ctk-banner.gpfocus .ctk-banner-tint { opacity: .8; }
.ctk-caption { background: ${C.priceChip}; color: ${C.storeText}; }
.ctk-tile.gpfocus .ctk-caption { color: #fff; }

.ctk-action { display: flex; align-items: center; justify-content: center; gap: 12px; box-sizing: border-box; height: 48px; padding: 8px 16px;
  border-radius: 2px; font-size: 16px; font-weight: 500; color: #fff; background: ${C.controlPrimary}; white-space: nowrap; position: relative; overflow: hidden;
  transition: background .2s ease-out, color .2s ease-out; }
.ctk-action.gpfocus { background: ${C.green}; }
.ctk-action.ctk-blue { background: ${C.blue}; }
.ctk-action.ctk-blue.gpfocus { background: #fff; color: ${C.ink}; }
.ctk-icon { display: flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 48px; height: 48px; border-radius: 2px;
  background: ${C.control}; color: #dcdedf; transition: background-color .12s; }
.ctk-icon.gpfocus { background: #fff; color: ${C.ink}; }
.ctk-button { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; height: 36px; padding: 0 16px; border-radius: 2px;
  font-size: 14px; color: #fff; background: ${C.storeChip}; white-space: nowrap; transition: background-color .12s, color .12s; }
.ctk-button.gpfocus { background: #fff; color: ${C.ink}; }

.ctk-pill { box-sizing: border-box; height: 34px; padding: 6px 16px; border-radius: 64px; font-size: 12px; font-weight: 700; line-height: 22px;
  letter-spacing: .5px; text-transform: uppercase; color: #dcdedf; white-space: nowrap; transition: background-color .1s, color .1s, box-shadow .1s; }
.ctk-pill.ctk-on { background: ${C.selected}; color: #fff; }
.ctk-pill.gpfocus { background: #fff; color: ${C.surface}; box-shadow: 0 3px 6px rgba(0,0,0,.32); }

.ctk-tag { box-sizing: border-box; padding: 2px 8px; border-radius: 3px; font-size: 14px; line-height: 20px; color: ${C.blue}; background: ${C.storeChip}; white-space: nowrap; }
.ctk-tag.gpfocus { background: #fff; color: ${C.ink}; }

.ctk-row { transition: background-color .12s; background: ${C.storeRow}; }
.ctk-row.gpfocus, .ctk-row.ctk-on { background: rgba(103,193,245,.28); }
.ctk-slide { position: relative; flex: 0 0 auto; background: #000; overflow: hidden; }
.ctk-slide img { width: 100%; height: 100%; object-fit: contain; display: block; image-rendering: pixelated; }
.ctk-text.gpfocus { background: rgba(255,255,255,.06); }
`;
