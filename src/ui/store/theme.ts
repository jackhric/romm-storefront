export const BG = "#171a21";
export const TEXT = "#dfe3e6";
export const MUTED = "rgba(223,227,230,0.6)";
export const ACCENT = "#1a9fff";
export const PAGE_X = 40;
export const CARD_W = 128;
export const CARD_GAP = 12;

// Steam's design tokens exist in the main window; the fallbacks are Steam's classic palette.
const token = (name: string, fallback: string) => `var(--${name}, ${fallback})`;
export const STEAM = {
  accent: token("color-accent-8", "#1a9fff"),
  lightBlue: "#66c0f4",
  title: token("color-text-body-title", "#f1f2f3"),
  text: "#c7d5e0",
  muted: token("color-dull-11", "#8b929a"),
  deep: "#0e141b",
  surface: "#1b2838",
  surfaceRaised: "#2a475e",
  radius: token("radius-md", "4px"),
} as const;

export const TILE_FACE = `linear-gradient(160deg, #2a475e 0%, ${STEAM.surface} 55%, #141d27 100%)`;

/** Own class names only. */
export const CSS = `
.ct-card { transition: transform 0.15s ease-out; }
.ct-fade { animation: ct-fade 0.5s ease-out; }
@keyframes ct-fade { from { opacity: 0; } to { opacity: 1; } }
.ct-page::-webkit-scrollbar { display: none; }
.ct-strip::-webkit-scrollbar { display: none; }
`;

/** Design sizes are given in display pixels at 1080p; Big Picture's main window renders at 1.42 dpr. */
export const bpx = (n: number) => Math.round((n / 1.42) * 2) / 2;
