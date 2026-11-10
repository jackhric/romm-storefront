// Artwork loading: SteamGridDB's own thumbnails for anything shown small, and one queue that loads what is on screen
// first and then the rest of the page from the top down, so a row is ready before it is scrolled to.
import { CSSProperties, ReactNode, useEffect, useMemo, useRef, useState } from "react";

const SGDB = /^(https:\/\/cdn\d*\.steamgriddb\.com)\/(grid|hero|logo|icon)\/([0-9a-f]+)\.(\w+)$/;

/** The URLs to try for a small rendition of an image, smallest first; the original is always last. */
export function thumbsOf(url: string): string[] {
  const m = SGDB.exec(url);
  if (!m) return [url];
  const [, origin, kind, hash, ext] = m;
  // Measured on the CDN: grid thumbs are 267x400 or 419x196 JPEGs, hero thumbs 850x274, logo thumbs 500 px wide.
  const thumb = kind === "grid" ? `thumb/${hash}.jpg` : kind === "hero" ? `hero_thumb/${hash}.${ext}` : `${kind}_thumb/${hash}.png`;
  return [`${origin}/${thumb}`, url];
}

const PARALLEL = 12;

interface Waiting { el: HTMLElement; start: () => void }
const waiting = new Set<Waiting>();
let loading = 0;

// Lower loads sooner: on screen, then below the screen from the top down, then what was scrolled past.
function rank(el: HTMLElement): number {
  const view = el.ownerDocument.defaultView;
  if (!view || !el.isConnected) return Infinity;
  const r = el.getBoundingClientRect();
  if (!r.width && !r.height) return 3e6;
  const below = r.top >= view.innerHeight;
  const above = r.bottom <= 0;
  const aside = r.left >= view.innerWidth || r.right <= 0;
  if (!below && !above && !aside) return r.top + r.left / 1e4;
  if (above) return 2e6 - r.top;
  return 1e6 + r.top + (aside ? 0.5 : 0) + r.left / 1e5;
}

function pump() {
  while (loading < PARALLEL && waiting.size) {
    let next: Waiting | undefined;
    let best = Infinity;
    for (const w of waiting) {
      const k = rank(w.el);
      if (k < best || !next) {
        best = k;
        next = w;
      }
    }
    if (!next) return;
    waiting.delete(next);
    loading++;
    next.start();
  }
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  // A microtask, not a timer: this script runs in Steam's hidden context, where timers are throttled to one a second.
  // It still runs after the commit, so every image registered in this render is ranked by where it ended up.
  void Promise.resolve().then(() => {
    scheduled = false;
    pump();
  });
}

function finished() {
  loading = Math.max(0, loading - 1);
  pump();
}

interface ArtProps {
  src?: string;
  /** Load the thumbnail rendition (tiles, rows, small logos). */
  small?: boolean;
  alt?: string;
  fit?: "cover" | "contain";
  position?: string;
  /** No placeholder behind the image (logos over other art). */
  bare?: boolean;
  /** Skip the queue: the one image the page is about (a hero). */
  eager?: boolean;
  style?: CSSProperties;
  imgStyle?: CSSProperties;
  /** Shown under the image until it has loaded, e.g. the game's name. */
  placeholder?: ReactNode;
  /** Shown when there is no image or it cannot be loaded. */
  fallback?: ReactNode;
}

/** An image that fills its box: a placeholder until it has loaded, a short fade in, the full file if the thumbnail is missing. */
export function Art(props: ArtProps) {
  return <ArtInner key={props.src ?? ""} {...props} />;
}

function ArtInner({ src, small, alt = "", fit = "cover", position, bare, eager, style, imgStyle, placeholder, fallback }: ArtProps) {
  const sources = useMemo(() => (src ? (small ? thumbsOf(src) : [src]) : []), [src, small]);
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const under = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  // The image is driven on the DOM, not through React state: this script runs in Steam's hidden context, where a
  // state update per image start and finish held a grid to a few dozen images a second.
  useEffect(() => {
    const el = img.current;
    const wrap = box.current;
    if (!el || !wrap || !sources.length) return;
    let held = false;
    let live = true;
    const release = () => {
      if (!held) return;
      held = false;
      finished();
    };
    const load = (index: number) => {
      if (!live) return;
      if (index >= sources.length) {
        release();
        setFailed(true);
        return;
      }
      el.onload = () => {
        if (!live) return;
        el.style.opacity = "1";
        wrap.classList.remove("ctk-skel");
        if (under.current) under.current.style.display = "none";
        release();
      };
      el.onerror = () => load(index + 1);
      el.src = sources[index];
    };
    if (eager) {
      load(0);
      return () => {
        live = false;
      };
    }
    const entry: Waiting = {
      el: wrap,
      start: () => {
        held = true;
        load(0);
      },
    };
    waiting.add(entry);
    schedule();
    return () => {
      live = false;
      waiting.delete(entry);
      release();
    };
  }, []);

  if (!sources.length || failed) return <>{fallback}</>;
  return (
    <div ref={box} className={bare ? undefined : "ctk-skel"} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", ...style }}>
      {placeholder && <div ref={under} style={{ position: "absolute", inset: 0 }}>{placeholder}</div>}
      <img
        ref={img}
        alt={alt}
        decoding={small ? "sync" : "async"}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: fit, objectPosition: position, display: "block", opacity: 0, transition: "opacity .2s ease-out", ...imgStyle }}
      />
    </div>
  );
}
