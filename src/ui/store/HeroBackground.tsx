// Backdrop that behaves like the Big Picture library home's: a crossfade with a sideways exit when the
// image changes and a slow zoom that drifts from the bottom-left towards the centre.
//
//   const { index, setIndex } = useRotation(featured, 8000, heroFocused || selectedId !== undefined);
//   const game = featured[index];
//   <HeroBackground src={details?.screenshots[0] || game.cover_large} direction={1} style={{ height: HERO_H }}>
//     <HeroText game={game} />
//   </HeroBackground>
import { CSSProperties, ReactNode, useEffect, useRef, useState } from "react";

// Measured on Steam client 1792618285: 25 s ease, 2 iterations alternate, scale 1 -> 1.1 while the
// transform-origin moves from left bottom to the centre; enter/exit 0.3 s on Steam's curve below.
const DRIFT_MS = 25000;
const SWAP_MS = 300;
const EASE = "cubic-bezier(0.17, 0.45, 0.14, 0.83)";

const CSS = `
@keyframes ct-hb-drift { 0% { transform-origin: left bottom; transform: scale(1); } 100% { transform: scale(1.1); } }
@keyframes ct-hb-in { 0% { transform: scale(1.03); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
@keyframes ct-hb-out-l { 0% { transform: translateX(0) scale(1); opacity: 1; } 100% { transform: translateX(-32px) scale(1.08); opacity: 0; } }
@keyframes ct-hb-out-r { 0% { transform: translateX(0) scale(1); opacity: 1; } 100% { transform: translateX(32px) scale(1.08); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .ct-hb-drift { animation: none !important; } }
`;

interface Layer {
  id: number;
  src: string;
  leaving?: 1 | -1;
}

interface Props {
  src?: string;
  /** One zoom-in (and the same back out) in ms. */
  durationMs?: number;
  /** 1: the old image leaves to the left (focus moved right), -1: to the right. */
  direction?: 1 | -1;
  /** Image brightness; Steam's home uses 0.5. */
  brightness?: number;
  /** Colour the bottom fades into, normally the page background. */
  fadeTo?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export function HeroBackground({ src, durationMs = DRIFT_MS, direction = 1, brightness = 0.5, fadeTo = "#171a21", style, children }: Props) {
  const [layers, setLayers] = useState<Layer[]>([]);
  const nextId = useRef(0);
  const dir = useRef(direction);
  dir.current = direction;

  useEffect(() => {
    if (!src) return;
    let live = true;
    // Swap only once the image is decoded, so the fade never goes to an empty frame.
    const img = new Image();
    const show = () => {
      if (!live) return;
      setLayers((prev) => {
        if (prev.length && prev[prev.length - 1].src === src && !prev[prev.length - 1].leaving) return prev;
        const kept = prev.filter((l) => !l.leaving).slice(-2).map((l) => ({ ...l, leaving: dir.current }));
        return [...kept, { id: nextId.current++, src }];
      });
    };
    img.onload = show;
    img.onerror = show;
    img.src = src;
    if (img.complete) show();
    return () => {
      live = false;
      img.onload = img.onerror = null;
    };
  }, [src]);

  const drop = (id: number) => setLayers((prev) => prev.filter((l) => l.id !== id));

  return (
    <div style={{ position: "relative", overflow: "hidden", ...style }}>
      <style>{CSS}</style>
      <div style={{ position: "absolute", inset: 0, maskImage: "radial-gradient(75% 83% at 50% 18%, #000 0%, rgba(0,0,0,0.6) 76%, transparent 100%)", WebkitMaskImage: "radial-gradient(75% 83% at 50% 18%, #000 0%, rgba(0,0,0,0.6) 76%, transparent 100%)" }}>
        {layers.map((l) => (
          <div key={l.id} className="ct-hb-drift" style={{ position: "absolute", inset: 0, animation: `ct-hb-drift ${durationMs}ms ease 0s 2 alternate` }}>
            <img
              src={l.src}
              alt=""
              onAnimationEnd={l.leaving ? () => drop(l.id) : undefined}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                filter: `brightness(${brightness})`,
                willChange: "transform, opacity",
                animation: l.leaving
                  ? `${l.leaving === 1 ? "ct-hb-out-l" : "ct-hb-out-r"} ${SWAP_MS}ms ${EASE} forwards`
                  : `ct-hb-in ${SWAP_MS}ms ${EASE} backwards`,
              }}
            />
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, transparent 40%, ${fadeTo} 100%), linear-gradient(to right, rgba(0,0,0,0.55) 0%, transparent 60%)` }} />
      <div style={{ position: "relative", height: "100%" }}>{children}</div>
    </div>
  );
}

/** Cycles through items every intervalMs while not paused; any index change (manual or timed) restarts the wait. */
export function useRotation<T>(items: readonly T[], intervalMs: number, pausedWhen: boolean) {
  const [index, setIndex] = useState(0);
  const count = items.length;
  const current = count ? index % count : 0;

  useEffect(() => {
    if (pausedWhen || count < 2) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => clearTimeout(timer);
  }, [current, count, intervalMs, pausedWhen]);

  return { index: current, item: count ? items[current] : undefined, setIndex };
}
