import { CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { Game } from "../../api";
import { thumbsOf } from "./art";
import { C, FOOTER } from "./tokens";

const GRAIN = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 1.6 -.3"/></filter><rect width="128" height="128" filter="url(#n)"/></svg>`,
)}`;

// Pre-scale px drawn past each edge, so the blur does not fade to transparent at the borders.
const BLEED = 4;

// The store page's colour as r,g,b: the vignettes fade the art into it.
const BG = "15,25,36";
const vignette = (centre: string, clear: number, mid: number) =>
  `radial-gradient(ellipse at ${centre}, rgba(${BG},${clear}) 0%, rgba(${BG},${mid}) 55%, rgba(${BG},1) 100%)`;

interface Look {
  /** The image is drawn in a box 1/shrink of the layer and scaled back up, so the blur runs on few pixels. */
  shrink: number;
  filter: string;
  opacity: number;
  overlay: string;
  fadeMs: number;
  flip?: boolean;
}

const PAGE: Look = { shrink: 8, filter: "blur(2px) saturate(.35) brightness(.42)", opacity: 0.6, overlay: vignette("50% 35%", 0.15, 0.6), fadeMs: 1400 };

const CARD: Look = {
  shrink: 4,
  filter: "blur(2px) saturate(.3) brightness(.7)",
  opacity: 0.2,
  overlay: `linear-gradient(rgba(${BG},.3), rgba(${BG},.75))`,
  fadeMs: 600,
  flip: true,
};

/** The best art of a game for a backdrop; "" when it has none. */
export const backdropArt = (g: Game) => g.art.hero || g.art.wide || g.cover_large || g.cover;

/** The thumbnail of `src` (the full file if there is none), invisible until it has loaded, then faded in. */
function FadeImage({ src, fadeMs, onShown, onFailed }: { src: string; fadeMs: number; onShown?: () => void; onFailed?: () => void }) {
  const img = useRef<HTMLImageElement>(null);
  const shown = useRef(onShown);
  shown.current = onShown;
  const failed = useRef(onFailed);
  failed.current = onFailed;
  useEffect(() => {
    const el = img.current;
    if (!el) return;
    const sources = thumbsOf(src);
    let live = true;
    let done: ReturnType<typeof setTimeout> | undefined;
    const load = (i: number) => {
      if (!live) return;
      if (i >= sources.length) {
        failed.current?.();
        return;
      }
      el.onload = () => {
        if (!live) return;
        // A cached image can load before the first paint; without a computed starting point it would not fade.
        void el.offsetWidth;
        el.style.opacity = "1";
        done = setTimeout(() => live && shown.current?.(), fadeMs + 100);
      };
      el.onerror = () => load(i + 1);
      el.src = sources[i];
    };
    load(0);
    return () => {
      live = false;
      if (done !== undefined) clearTimeout(done);
    };
  }, [src]);
  return <img ref={img} alt="" decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0, transition: `opacity ${fadeMs}ms ease-out` }} />;
}

type Shown = { id: number; src: string };

/** `shown` are stacked oldest first inside one muted group, so a new image fades in over the last without a dip. */
interface LayerProps {
  shown: Shown[];
  look: Look;
  style?: CSSProperties;
  /** A picture has finished fading in. */
  onShown?: (id: number) => void;
  /** A picture could not be loaded at all. */
  onFailed?: (id: number) => void;
}

function Layer({ shown, look, style, onShown, onFailed }: LayerProps) {
  const { shrink, filter, opacity, overlay, fadeMs, flip } = look;
  const size = `calc(${100 / shrink}% + ${BLEED * 2}px)`;
  const fill: CSSProperties = { position: "absolute", inset: 0 };
  return (
    <div style={{ ...fill, overflow: "hidden", pointerEvents: "none", ...style }}>
      <div style={{ ...fill, transform: flip ? "scaleX(-1)" : undefined }}>
        <div style={{ position: "absolute", left: -BLEED, top: -BLEED, width: size, height: size, transformOrigin: `${BLEED}px ${BLEED}px`, transform: `scale(${shrink})`, filter, opacity }}>
          {shown.map((s) => <FadeImage key={s.id} src={s.src} fadeMs={fadeMs} onShown={onShown && (() => onShown(s.id))} onFailed={onFailed && (() => onFailed(s.id))} />)}
        </div>
      </div>
      <div style={{ ...fill, background: overlay }} />
      <div style={{ ...fill, opacity: 0.1, mixBlendMode: "overlay", backgroundSize: "128px 128px", backgroundImage: `url("${GRAIN}")` }} />
    </div>
  );
}

/** A faint, mirrored, grainy copy of an image behind a card's text. */
export function CardBackdrop({ src, style }: { src: string; style?: CSSProperties }) {
  return src ? <Layer shown={[{ id: 0, src }]} look={CARD} style={style} /> : null;
}

const pageStyle: CSSProperties = { height: `calc(100vh - ${FOOTER}px)`, bottom: "auto", background: C.storePage };

/** Fixed behind a page while its content scrolls over it. Must sit directly in a `Page`. */
export function PageBackdrop({ src }: { src: string }) {
  if (!src) return null;
  return (
    <div style={{ position: "sticky", top: 0, height: 0, zIndex: -1 }}>
      <Layer shown={[{ id: 0, src }]} look={PAGE} style={pageStyle} />
    </div>
  );
}

// Focus has to rest on a game this long before the backdrop follows it, so moving through a shelf does not flicker.
const SETTLE_MS = 600;

let focused = "";
let settling: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

/** Tells the Discover backdrop which game has focus; only the backdrop re-renders, and only once focus rests. */
export function showInBackdrop(game: Game) {
  const src = backdropArt(game);
  if (settling !== undefined) clearTimeout(settling);
  settling = undefined;
  if (!src || src === focused) return;
  settling = setTimeout(() => {
    settling = undefined;
    focused = src;
    listeners.forEach((l) => l());
  }, SETTLE_MS);
}

const TAB_FADE_MS = 900;

/**
 * The Discover page's backdrop: the focused game's art, each new one fading in over the one before. It stays
 * mounted while another tab is shown, so it fades out and back in with `visible`.
 */
export function FocusBackdrop({ visible }: { visible: boolean }) {
  // Starts hidden, so the first appearance fades in as well.
  const [on, setOn] = useState(false);
  useEffect(() => setOn(visible), [visible]);
  const [layers, setLayers] = useState<Shown[]>(focused ? [{ id: 0, src: focused }] : []);
  const nextId = useRef(1);
  useEffect(() => {
    // Every change is a new picture on top that fades in from nothing, also one that is shown again and one that
    // arrives while another is still fading: nothing already on screen is ever moved, restarted or taken away here.
    const l = () => setLayers((cur) => (cur[cur.length - 1]?.src === focused ? cur : [...cur, { id: nextId.current++, src: focused }]));
    listeners.add(l);
    l();
    return () => void listeners.delete(l);
  }, []);
  // Once a picture has loaded and faded in, the ones under it are no longer seen. Counting from the load, not from
  // the change of focus: a slow picture must not have the one before it taken away while it is still coming.
  const settled = useCallback((id: number) => setLayers((cur) => cur.filter((s) => s.id >= id)), []);
  const dropped = useCallback((id: number) => setLayers((cur) => cur.filter((s) => s.id !== id)), []);
  if (!layers.length) return null;
  return (
    <div style={{ position: "sticky", top: 0, height: 0, zIndex: -1, opacity: on ? 1 : 0, transition: `opacity ${TAB_FADE_MS}ms ease-out` }}>
      <Layer shown={layers} look={PAGE} style={pageStyle} onShown={settled} onFailed={dropped} />
    </div>
  );
}
