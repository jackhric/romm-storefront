// Video and screenshots: the muted autoplaying trailer, the hero art it plays over, and the store's media slides.
import { Focusable, GamepadButton, GamepadEvent, ModalRoot, NavEntryPositionPreferences, showModal } from "@decky/ui";
import { CSSProperties, ReactNode, RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FaPlay } from "react-icons/fa";
import { videoBroke, VideoSource } from "../hooks";
import { Art, thumbsOf } from "./art";
import { C, FONT, GAP, GUTTER } from "./tokens";

const START_AT = 0.25;
const YT = "https://www.youtube-nocookie.com/embed/";

/** False while the Steam window is hidden: a video left alive in a hidden window has frozen Steam for other plugins. */
function useWindowShown(ref: RefObject<HTMLElement | null>): boolean {
  const [shown, setShown] = useState(true);
  useEffect(() => {
    const doc = ref.current?.ownerDocument;
    if (!doc) return;
    const update = () => setShown(doc.visibilityState !== "hidden");
    update();
    doc.addEventListener("visibilitychange", update);
    return () => doc.removeEventListener("visibilitychange", update);
  }, []);
  return shown;
}

/** True while the element is inside the page's visible area. */
function useOnScreen(ref: RefObject<HTMLElement | null>): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    // The page lives in the Big Picture window, not in the window this script runs in.
    const Observer = (el?.ownerDocument.defaultView as any)?.IntersectionObserver as typeof IntersectionObserver | undefined;
    if (!el || !Observer) return;
    const o = new Observer(([entry]) => setOn(entry.isIntersecting), { threshold: 0.5 });
    o.observe(el);
    return () => o.disconnect();
  }, []);
  return on;
}

// The embed draws its title, logo and transport bar along its own top and bottom edges. Making the frame this much
// taller than the picture pushes them outside the visible box (the picture stays centred, letterboxed).
const CHROME = 220;
// Suggested videos cover the picture near the end, so the loop turns back before then.
const END_GUARD_S = 14;

/** A muted, looping video that fills its box and starts a quarter of the way in. It never takes focus. */
export function Trailer({ source, onVisible }: { source: VideoSource; onVisible?: (visible: boolean) => void }) {
  const [broken, setBroken] = useState(false);
  if (source.kind === "file" && !broken) {
    return (
      <FileTrailer
        src={source.src}
        onVisible={onVisible}
        onBroken={() => {
          videoBroke(source.src);
          setBroken(true);
        }}
      />
    );
  }
  const embed = source.kind === "file" ? source.fallback : source;
  return embed?.kind === "youtube" ? <EmbedTrailer id={embed.id} onVisible={onVisible} /> : null;
}

function FileTrailer({ src, onVisible, onBroken }: { src: string; onVisible?: (visible: boolean) => void; onBroken: () => void }) {
  const startAt = useRef(0);
  const shown = useRef(false);
  return (
    <video
      src={src}
      muted
      autoPlay
      loop
      playsInline
      tabIndex={-1}
      onLoadedMetadata={(e) => {
        const v = e.currentTarget;
        if (isFinite(v.duration) && v.duration > 8) v.currentTime = startAt.current = v.duration * START_AT;
      }}
      // Shown on the first frame past the start point, never on the opening frame the seek replaces.
      onTimeUpdate={(e) => {
        if (shown.current || e.currentTarget.currentTime < startAt.current) return;
        shown.current = true;
        onVisible?.(true);
      }}
      onError={onBroken}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }}
    />
  );
}

function EmbedTrailer({ id, onVisible }: { id: string; onVisible?: (visible: boolean) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const el = frame.current;
    const win = el?.ownerDocument.defaultView;
    if (!el || !win) return;
    let duration = 0;
    let startAt = 0;
    let turning = false;
    let reveal: ReturnType<typeof setTimeout> | undefined;
    const send = (msg: object) => el.contentWindow?.postMessage(JSON.stringify(msg), "*");
    const command = (func: string, ...args: unknown[]) => send({ event: "command", func, args });
    const listen = () => send({ event: "listening", id: 1, channel: "widget" });
    // The embed flashes its transport controls after a seek; the picture stays hidden until they are gone.
    const seek = (hideMs: number) => {
      onVisible?.(false);
      command("seekTo", startAt, true);
      clearTimeout(reveal);
      reveal = setTimeout(() => {
        turning = false;
        onVisible?.(true);
      }, hideMs);
    };
    const captionsOff = () => {
      command("unloadModule", "captions");
      command("unloadModule", "cc");
      command("setOption", "captions", "track", {});
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source !== el.contentWindow || typeof e.data !== "string") return;
      let info: any;
      try {
        info = JSON.parse(e.data)?.info;
      } catch {
        return;
      }
      if (!info) return;
      if (!duration && info.duration > 0) {
        duration = info.duration;
        startAt = Math.floor(duration * START_AT);
        captionsOff();
        seek(3500);
      }
      if (info.playerState === 1) captionsOff();
      if (duration > 3 * END_GUARD_S && !turning && info.currentTime > duration - END_GUARD_S) {
        turning = true;
        seek(2500);
      }
    };
    win.addEventListener("message", onMessage);
    el.addEventListener("load", listen);
    return () => {
      clearTimeout(reveal);
      win.removeEventListener("message", onMessage);
      el.removeEventListener("load", listen);
    };
  }, [id]);

  const params = `autoplay=1&mute=1&controls=0&playsinline=1&loop=1&playlist=${id}&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1&fs=0&cc_load_policy=0&enablejsapi=1`;
  return (
    // Every box this plays in is at least as wide as 16:9, so a full-width 16:9 picture covers it.
    <div style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", width: "100%", aspectRatio: "16 / 9", overflow: "hidden", pointerEvents: "none" }}>
      <iframe ref={frame} src={`${YT}${id}?${params}`} allow="autoplay; encrypted-media" tabIndex={-1} style={{ position: "absolute", left: 0, top: -CHROME, width: "100%", height: `calc(100% + ${2 * CHROME}px)`, border: 0, pointerEvents: "none" }} />
    </div>
  );
}

/** Plays `source` over its parent once `active` has held for a moment, fading in when the first frame shows. */
export function AmbientVideo({ source, active, delayMs = 1200 }: { source?: VideoSource; active: boolean; delayMs?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const shown = useWindowShown(box);
  const onScreen = useOnScreen(box);
  const [armed, setArmed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const key = source ? (source.kind === "file" ? source.src : source.id) : "";
  const want = !!source && active && shown && onScreen;
  useEffect(() => {
    setArmed(false);
    setPlaying(false);
    if (!want) return;
    const t = setTimeout(() => setArmed(true), delayMs);
    return () => clearTimeout(t);
  }, [key, want, delayMs]);
  useEffect(() => {
    if (!armed || !source) return;
    // The embed reports back only when it answers; show it anyway after a wait.
    const t = setTimeout(() => setPlaying(true), 7000);
    return () => clearTimeout(t);
  }, [armed, key]);
  return (
    <div ref={box} style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", opacity: playing ? 1 : 0, transition: "opacity .6s ease-out", background: "#000" }}>
      {armed && source && <Trailer key={key} source={source} onVisible={setPlaying} />}
    </div>
  );
}

interface HeroArtProps {
  src?: string;
  height: number;
  video?: VideoSource;
  /** Whether the video may play (e.g. only while the hero's game is settled). */
  playVideo?: boolean;
  /** The colour the bottom fades into. */
  fadeTo: string;
  /** Darkens the left side for text placed over the art. */
  shadeLeft?: boolean;
  style?: CSSProperties;
  children?: ReactNode;
}

/** Full-width hero art like the library game page's header: the image, Steam's top gradient, a fade into the page. */
export function HeroArt({ src, height, video, playVideo = true, fadeTo, shadeLeft, style, children }: HeroArtProps) {
  return (
    <div style={{ position: "relative", height, overflow: "hidden", background: C.ink, ...style }}>
      {/* The thumbnail shows at once; the full picture fades in over it. */}
      {src && thumbsOf(src)[0] !== src && <Art src={src} small eager style={{ position: "absolute", inset: 0 }} />}
      <Art src={src} bare eager style={{ position: "absolute", inset: 0 }} />
      <AmbientVideo source={video} active={playVideo} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 75, background: "linear-gradient(rgba(0,0,0,.5) 0%, rgba(0,0,0,0) 100%)" }} />
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to bottom, transparent 55%, ${fadeTo} 100%)${shadeLeft ? ", linear-gradient(to right, rgba(0,0,0,.75) 0%, rgba(0,0,0,.45) 35%, transparent 70%)" : ""}` }} />
      <div style={{ position: "relative", height: "100%" }}>{children}</div>
    </div>
  );
}

export type ViewerItem = { kind: "image"; src: string } | { kind: "video"; source: VideoSource };

/** Opens pictures and videos over the whole screen; left and right (or the bumpers) flip through them. */
export function openViewer(items: ViewerItem[], start: number, title: string, logo?: string) {
  if (items.length) showModal(<Viewer items={items} start={start} title={title} logo={logo} />);
}

function Viewer({ items, start, title, logo, closeModal }: { items: ViewerItem[]; start: number; title: string; logo?: string; closeModal?: () => void }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const [index, setIndex] = useState(Math.min(start, items.length - 1));
  const video = useRef<HTMLVideoElement>(null);
  const item = items[index];
  const go = (d: number) => setIndex((n) => (n + d + items.length) % items.length);
  // Outside the dialog's own DOM, so the dialog's B and Steam's direction handling do not reach it: all handled here.
  const onButton = (e: GamepadEvent) => {
    const b = e.detail.button;
    if (b === GamepadButton.DIR_LEFT || b === GamepadButton.BUMPER_LEFT) go(-1);
    else if (b === GamepadButton.DIR_RIGHT || b === GamepadButton.BUMPER_RIGHT) go(1);
    else if (b === GamepadButton.CANCEL) closeModal?.();
  };
  const playing = item.kind === "video" && item.source.kind === "file";
  const act = () => {
    const v = video.current;
    if (!playing || !v) return closeModal?.();
    if (v.paused) void v.play();
    else v.pause();
  };
  // Steam's dialog frame is transformed, which would confine anything "fixed" to the small box. The viewer is drawn
  // straight into the window's body instead; it stays in Steam's focus tree, which follows React, not the DOM.
  const anchor = useRef<HTMLSpanElement>(null);
  const [body, setBody] = useState<HTMLElement>();
  useLayoutEffect(() => setBody(anchor.current?.ownerDocument.body), []);
  return (
    <ModalRoot bAllowFullSize bHideCloseIcon closeModal={closeModal} onCancel={closeModal}>
      <span ref={anchor} />
      {body && createPortal(
      <Focusable
        onActivate={act}
        onGamepadDirection={onButton}
        onButtonDown={onButton}
        onCancelButton={() => closeModal?.()}
        onCancelActionDescription="Back"
        onOKActionDescription={playing ? "Pause" : "Close"}
        noFocusRing
        style={{ position: "fixed", inset: 0, zIndex: 100000, background: "#000", color: C.subtitle, fontFamily: FONT }}
      >
        {item.kind === "image"
          ? <img key={item.src} src={item.src} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", imageRendering: "pixelated" }} />
          : <FullVideo key={index} source={item.source} videoRef={video} />}
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, padding: "90px 32px 26px", background: "linear-gradient(to top, rgba(0,0,0,.8), rgba(0,0,0,0))", pointerEvents: "none" }}>
          {logo && !logoFailed
            ? <img src={logo} alt={title} onError={() => setLogoFailed(true)} style={{ maxWidth: 340, maxHeight: 110, objectFit: "contain", objectPosition: "left bottom", display: "block", filter: "drop-shadow(0 2px 8px rgba(0,0,0,.8))" }} />
            : <span style={{ fontSize: 26, fontWeight: 700, color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,.8)" }}>{title}</span>}
          {items.length > 1 && (
            <span style={{ padding: "6px 16px", borderRadius: 2, background: "rgba(0,0,0,.75)", fontSize: 20, fontWeight: 700, lineHeight: "28px", color: "#fff", whiteSpace: "nowrap" }}>
              {index + 1} <span style={{ color: C.body, fontWeight: 500 }}>/ {items.length}</span>
            </span>
          )}
        </div>
      </Focusable>,
      body)}
    </ModalRoot>
  );
}

/** The video from its beginning, with sound. The direct streams are silent, so their audio track plays alongside. */
function FullVideo({ source, videoRef }: { source: VideoSource; videoRef: RefObject<HTMLVideoElement | null> }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [broken, setBroken] = useState(false);
  const fill: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", border: 0 };
  if (source.kind === "file" && !broken) {
    const follow = () => {
      const v = videoRef.current;
      const a = audio.current;
      if (!v || !a) return;
      if (Math.abs(a.currentTime - v.currentTime) > 0.25) a.currentTime = v.currentTime;
      if (v.paused || v.readyState < 3) a.pause();
      else if (a.paused) void a.play().catch(() => {});
    };
    return (
      <>
        <video ref={videoRef} src={source.src} autoPlay playsInline muted={!!source.audio} onPlaying={follow} onPause={follow} onWaiting={follow} onSeeked={follow} onTimeUpdate={follow} onError={() => { videoBroke(source.src); setBroken(true); }} style={{ ...fill, objectFit: "contain" }} />
        {source.audio && <audio ref={audio} src={source.audio} />}
      </>
    );
  }
  const embed = source.kind === "file" ? source.fallback : source;
  if (embed?.kind !== "youtube") return null;
  return <iframe src={`${YT}${embed.id}?autoplay=1&rel=0&modestbranding=1&playsinline=1`} allow="autoplay; encrypted-media" tabIndex={-1} style={{ ...fill, pointerEvents: "none" }} />;
}

interface MediaSlidesProps {
  video?: VideoSource;
  shots: string[];
  title: string;
  /** The game's logo, shown in the full-screen viewer in place of the title. */
  logo?: string;
  width?: number;
  height?: number;
  /** Space kept right of the last slide, so it ends in line with the page content. */
  gutter?: number;
  /** Space left of the first slide when the strip does not start at the page gutter. */
  padLeft?: number;
}

/** The store page's media strip: the video first, then screenshots, one large slide each; A opens it full size. */
export function MediaSlides({ video, shots, title, logo, width = 813, height = 457, gutter = GUTTER, padLeft = gutter }: MediaSlidesProps) {
  if (!video && !shots.length) return null;
  const items: ViewerItem[] = [...(video ? [{ kind: "video" as const, source: video }] : []), ...shots.map((src) => ({ kind: "image" as const, src }))];
  return (
    // Clipped, not scrollable: Steam scrolls any scrollable box to a newly focused slide in its own time, which left
    // the pictures lagging behind the focus and resting wherever that scroll stopped. The row is moved instead.
    <div className="ctk-slides" style={{ overflow: "clip", padding: "4px 0" }}>
      <Focusable
        className="ctk-track"
        flow-children="row"
        navEntryPreferPosition={NavEntryPositionPreferences.MAINTAIN_X}
        data-lead={padLeft}
        data-trail={gutter}
        style={{ position: "relative", display: "flex", gap: GAP - 1, paddingLeft: padLeft, willChange: "transform" }}
      >
        {video && <VideoSlide source={video} poster={shots[0]} width={width} height={height} onOpen={() => openViewer(items, 0, title, logo)} />}
        {shots.map((src, i) => <Slide key={src} width={width} height={height} label="View" onActivate={() => openViewer(items, i + (video ? 1 : 0), title, logo)}><img src={src} alt="" loading="lazy" /></Slide>)}
      </Focusable>
    </div>
  );
}

let lastSlideMove = 0;

/**
 * Moves the row so the focused slide starts where the first one does; the last slide stops with its right edge
 * `trail` px short of the strip's, in line with the page content below. A single press glides, quick presses jump.
 */
function showSlide(el: HTMLElement | null) {
  const track = el?.closest<HTMLElement>(".ctk-track");
  const view = track?.parentElement;
  const last = track?.lastElementChild as HTMLElement | null;
  if (!el || !track || !view || !last) return;
  // Steam still asks the page to scroll a far-off slide into view; the page must not move sideways for it.
  const page = el.closest<HTMLElement>(".ctk-page");
  if (page && !page.dataset.sideLock) {
    page.dataset.sideLock = "1";
    page.addEventListener("scroll", () => {
      if (page.scrollLeft) page.scrollLeft = 0;
    });
  }
  const lead = Number(track.dataset.lead) || 0;
  const trail = Number(track.dataset.trail) || 0;
  const furthest = Math.max(0, last.offsetLeft + last.offsetWidth + trail - view.clientWidth);
  const x = Math.max(0, Math.min(furthest, el.offsetLeft - lead));
  const now = performance.now();
  const quick = now - lastSlideMove < 220;
  lastSlideMove = now;
  track.style.transition = quick ? "none" : "transform .25s ease-out";
  track.style.transform = `translateX(${-x}px)`;
}

function Slide({ width, height, label, onActivate, onFocusChange, children }: { width: number; height: number; label: string; onActivate: () => void; onFocusChange?: (focused: boolean) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <Focusable
      ref={ref}
      className="ctk-slide ctk-ring"
      noFocusRing
      onActivate={onActivate}
      onOKActionDescription={label}
      onGamepadFocus={() => {
        showSlide(ref.current);
        onFocusChange?.(true);
      }}
      onGamepadBlur={() => onFocusChange?.(false)}
      style={{ width, height }}
    >
      {children}
    </Focusable>
  );
}

function VideoSlide({ source, poster, width, height, onOpen }: { source: VideoSource; poster?: string; width: number; height: number; onOpen: () => void }) {
  return (
    <Slide width={width} height={height} label="Play with sound" onActivate={onOpen}>
      {poster && <img src={poster} alt="" style={{ opacity: 0.6 }} />}
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.85)" }}><FaPlay size={44} /></div>
      <AmbientVideo source={source} active delayMs={600} />
    </Slide>
  );
}
