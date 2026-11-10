// The shared building blocks of every layout: our markup, Steam's tokens and measured sizes, Steam's own focus.
import { Focusable, NavEntryPositionPreferences } from "@decky/ui";
import { createContext, CSSProperties, memo, ReactNode, useContext, useLayoutEffect, useRef, useState } from "react";
import { FaDownload, FaEllipsisH, FaPlay, FaStop } from "react-icons/fa";
import { Game, Progress } from "../../api";
import { formatSize } from "../../state";
import { ConsoleEntry, isBusy, openConsolePage, reveal, useGameActions } from "../hooks";
import { consoleLogo } from "../consoleLogos";
import { ConsoleFace } from "../store/Consoles";
import { coverOf, percent, prefetchDetails } from "../store/model";
import { Art } from "./art";
import { C, CAPSULE_W, FOOTER, GAP, GUTTER, KIT_CSS, WIDE_W } from "./tokens";

export * from "./tokens";
export * from "./media";
export * from "./art";
export { Title as Logo } from "../store/Title";
export { Summary, openLightbox } from "../game/parts";

const ellipsis: CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

interface PageProps {
  children: ReactNode;
  background?: string;
  /** Keeps what Steam scrolls into view clear of the top bar (and of a sticky header, when the layout has one). */
  scrollPaddingTop?: number;
}

export interface PageSize { width: number; height: number }
// The page at 1080p; the real size replaces it as soon as the page is laid out.
const PageSizeContext = createContext<PageSize>({ width: 1353, height: 719 });

/** The page's size in CSS px. It differs a lot between displays: about 1353 wide on a 1080p TV, 853 on a handheld. */
export const usePageSize = () => useContext(PageSizeContext);

/** How many tiles of at least `tile` px fit across the page, and the width that makes them fill it exactly. */
export function fitColumns(pageWidth: number, tile: number, gap = GAP, gutter = GUTTER): { columns: number; width: number } {
  const room = pageWidth - 2 * gutter;
  const columns = Math.max(2, Math.floor((room + gap) / (tile + gap)));
  return { columns, width: Math.floor((room - (columns - 1) * gap) / columns) };
}

/** The scrolling page. It ends above Steam's footer so a focused tile is never under it. */
export function Page({ children, background = C.page, scrollPaddingTop = 90 }: PageProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<PageSize>({ width: 1353, height: 719 });
  useLayoutEffect(() => {
    const el = ref.current;
    // The page lives in the Big Picture window, not in the window this script runs in.
    const Observer = (el?.ownerDocument.defaultView as any)?.ResizeObserver as typeof ResizeObserver | undefined;
    if (!el) return;
    const measure = () => setSize((s) => (s.width === el.clientWidth && s.height === el.clientHeight ? s : { width: el.clientWidth, height: el.clientHeight }));
    measure();
    if (!Observer) return;
    const o = new Observer(measure);
    o.observe(el);
    return () => o.disconnect();
  }, []);
  return (
    // Its own stacking context: Steam's focus ring (z-index 10000) then stays under Steam's top bar.
    <div
      ref={ref}
      className="ctk-page"
      // Steam scrolls focused things into view on both axes; the page itself must never move sideways.
      onScroll={(e) => {
        if (e.currentTarget.scrollLeft) e.currentTarget.scrollLeft = 0;
      }}
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: FOOTER, overflowY: "auto", overflowX: "hidden", scrollPaddingTop, scrollPaddingBottom: 16, background, isolation: "isolate", zIndex: 0 }}>
      <style>{KIT_CSS}</style>
      <PageSizeContext.Provider value={size}>{children}</PageSizeContext.Provider>
    </div>
  );
}

export type TileFocus = (game: Game, el: HTMLDivElement | null) => void;

interface TileProps {
  game: Game;
  progress?: Progress;
  width?: number;
  onFocus?: TileFocus;
  onOpen: (game: Game) => void;
  /** False for the store's flat tiles, which show focus by the ring alone. */
  lift?: boolean;
}

/** "ON THIS DEVICE" like the store's "IN LIBRARY" tag, or the download's progress along the bottom edge. */
export function TileStatus({ game, progress }: { game: Game; progress?: Progress }) {
  if (isBusy(game)) {
    return (
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 4, background: "rgba(0,0,0,.6)" }}>
        <div style={{ height: "100%", width: `${progress ? percent(progress) : 0}%`, background: C.blue, transition: "width .4s linear" }} />
      </div>
    );
  }
  if (game.status !== "installed") return null;
  return <div style={{ position: "absolute", left: 0, top: 0, padding: "1px 6px", background: C.lime, color: C.ink, fontSize: 11, fontWeight: 700, lineHeight: "16px", letterSpacing: 0.3 }}>ON THIS DEVICE</div>;
}

/** The library's portrait capsule (2:3): art only, like Steam's. */
export const Capsule = memo(function Capsule({ game, progress, width = CAPSULE_W, onFocus, onOpen, lift = true }: TileProps) {
  const ref = useRef<HTMLDivElement>(null);
  const cover = coverOf(game);
  return (
    <Focusable
      ref={ref}
      className={`ctk-tile ctk-ring${lift ? " ctk-lift" : ""}`}
      noFocusRing
      data-rom={game.rom_id}
      onActivate={() => onOpen(game)}
      onOKActionDescription="View"
      onGamepadFocus={() => {
        reveal(ref.current);
        prefetchDetails(game.rom_id);
        onFocus?.(game, ref.current);
      }}
      style={{ width, height: Math.round(width * 1.5) }}
    >
      <Art src={cover} small alt={game.name} placeholder={<Untitled name={game.name} dim />} fallback={<Untitled name={game.name} />} />
      <TileStatus game={game} progress={progress} />
    </Focusable>
  );
});

function Untitled({ name, dim }: { name: string; dim?: boolean }) {
  return <div style={{ height: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", padding: 12, textAlign: "center", fontSize: 14, lineHeight: "18px", fontWeight: 500, color: dim ? C.note : C.subtitle }}>{name}</div>;
}

/** Wide art (460x215) for a game: SteamGridDB's wide capsule, else the cover over a blurred copy of itself. */
export function WideArt({ game, style }: { game: Game; style?: CSSProperties }) {
  const cover = coverOf(game);
  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "460 / 215", overflow: "hidden", background: C.ink, ...style }}>
      {game.art.wide ? (
        <Art src={game.art.wide} small alt={game.name} placeholder={<Untitled name={game.name} dim />} style={{ position: "absolute", inset: 0 }} />
      ) : cover ? (
        <>
          <Art src={cover} small bare style={{ position: "absolute", inset: "-20%", width: "140%", height: "140%" }} imgStyle={{ filter: "blur(18px) brightness(.6)" }} />
          <Art src={cover} small bare fit="contain" alt={game.name} style={{ position: "absolute", inset: 0 }} />
        </>
      ) : (
        <Untitled name={game.name} />
      )}
    </div>
  );
}

/** The store's wide capsule: art over a dark bar with the title and, where the store has its price, the size. */
export const WideCapsule = memo(function WideCapsule({ game, progress, width = WIDE_W, onFocus, onOpen, lift = false, note }: TileProps & { note?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <Focusable
      ref={ref}
      className={`ctk-tile ctk-ring${lift ? " ctk-lift" : ""}`}
      noFocusRing
      data-rom={game.rom_id}
      onActivate={() => onOpen(game)}
      onOKActionDescription="View"
      onGamepadFocus={() => {
        reveal(ref.current);
        prefetchDetails(game.rom_id);
        onFocus?.(game, ref.current);
      }}
      style={{ width }}
    >
      <WideArt game={game} />
      <TileStatus game={game} progress={progress} />
      <div className="ctk-caption" style={{ display: "flex", alignItems: "center", gap: 8, height: 34, padding: "0 8px", boxSizing: "border-box" }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 14, ...ellipsis }}>{note || game.name}</div>
        <div style={{ flex: "0 0 auto", fontSize: 12, color: C.body }}>{game.status === "installed" ? "Installed" : formatSize(game.size_bytes)}</div>
      </div>
    </Focusable>
  );
});

export function SectionHeader({ children, subtitle, size = 22, gutter = GUTTER, right }: { children: ReactNode; subtitle?: string; size?: number; gutter?: number; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, padding: `0 ${gutter}px` }}>
      <div style={{ fontSize: size, fontWeight: size >= 22 ? 600 : 500, lineHeight: "28px", color: "#fff" }}>{children}</div>
      {subtitle && <div style={{ flex: 1, minWidth: 0, fontSize: 14, color: C.description, ...ellipsis }}>{subtitle}</div>}
      {right}
    </div>
  );
}

interface ShelfProps {
  title?: ReactNode;
  subtitle?: string;
  /** Names the shelf for focus restoring (data-section). */
  section: string;
  gutter?: number;
  gap?: number;
  headerSize?: number;
  children: ReactNode;
}

/** A titled horizontal row. Up and down keep the column (MAINTAIN_X); the strip scrolls with focus. */
export function Shelf({ title, subtitle, section, gutter = GUTTER, gap = GAP, headerSize, children }: ShelfProps) {
  return (
    <div className="ctk-shelf" data-section={section} style={{ marginBottom: 22 }}>
      {title && <SectionHeader subtitle={subtitle} size={headerSize} gutter={gutter}>{title}</SectionHeader>}
      <Focusable
        className="ctk-strip"
        flow-children="row"
        navEntryPreferPosition={NavEntryPositionPreferences.MAINTAIN_X}
        style={{ display: "flex", gap, overflowX: "hidden", padding: `12px ${gutter}px 16px`, scrollPaddingLeft: gutter, scrollPaddingRight: gutter }}
      >
        {children}
      </Focusable>
    </div>
  );
}

const ACTION_ICONS = { download: <FaDownload />, resume: <FaDownload />, stop: <FaStop />, play: <FaPlay /> };

interface ActionButtonProps {
  game: Game;
  progress?: Progress;
  width?: number;
  /** Marks the button as the page's first focus (see useReturnFocus). */
  autoFocus?: boolean;
  /** The store's blue button instead of the library's grey-then-green one. */
  blue?: boolean;
  style?: CSSProperties;
}

/** The primary action, shaped like the library's Play button: grey at rest, green with focus. */
export function ActionButton({ game, progress, width = 210, autoFocus, blue, style }: ActionButtonProps) {
  const { kind, label, act, pending } = useGameActions(game);
  const pct = progress ? Math.round(percent(progress)) : 0;
  return (
    <Focusable
      className={`ctk-action${blue ? " ctk-blue" : ""}`}
      noFocusRing
      {...(autoFocus ? { "data-autofocus": "" } : {})}
      onActivate={() => !pending && act()}
      onOKActionDescription={label}
      style={{ minWidth: width, flex: "0 0 auto", justifyContent: "flex-start", paddingLeft: 24, opacity: pending ? 0.6 : 1, ...style }}
    >
      <span style={{ display: "flex", fontSize: 18 }}>{ACTION_ICONS[kind]}</span>
      <span>{kind === "stop" && progress?.status === "downloading" ? `Downloading ${pct}%` : label}</span>
      {kind === "stop" && <div style={{ position: "absolute", left: 0, bottom: 0, height: 3, width: `${pct}%`, background: "#fff", transition: "width .4s linear" }} />}
    </Focusable>
  );
}

export function IconButton({ label, onClick, children, style }: { label: string; onClick: (el: HTMLDivElement | null) => void; children: ReactNode; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <Focusable ref={ref} className="ctk-icon" noFocusRing onActivate={() => onClick(ref.current)} onOKActionDescription={label} style={style}>
      {children}
    </Focusable>
  );
}

/** "...": the game's other actions in Steam's context menu. */
export function MoreButton({ game, serverUrl }: { game: Game; serverUrl: string }) {
  const { openMenu } = useGameActions(game, serverUrl);
  return <IconButton label="More" onClick={openMenu}><FaEllipsisH size={20} /></IconButton>;
}

/** A small secondary button in the store's style. */
export function Button({ children, label, onClick, style }: { children: ReactNode; label?: string; onClick: (el: HTMLDivElement | null) => void; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <Focusable ref={ref} className="ctk-button" noFocusRing onActivate={() => onClick(ref.current)} onOKActionDescription={label ?? "Select"} style={style}>
      {children}
    </Focusable>
  );
}

/** The play bar's label-over-value pair. */
export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, lineHeight: "22px", letterSpacing: 0.5, textTransform: "uppercase", color: C.label, whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 500, lineHeight: "20px", color: "#fff", ...ellipsis }}>{value}</div>
    </div>
  );
}

export function Stats({ items, gap = 20 }: { items: [string, ReactNode | undefined | ""][]; gap?: number }) {
  const shown = items.filter(([, value]) => value);
  if (!shown.length) return null;
  return <div style={{ display: "flex", gap, minWidth: 0 }}>{shown.map(([label, value]) => <Stat key={label} label={label} value={value} />)}</div>;
}

interface PillTabsProps<K extends string> {
  tabs: { key: K; label: string }[];
  active: K;
  /** Called when a tab gets focus (Steam's tabs switch on focus) or is pressed. */
  onChange: (key: K) => void;
  style?: CSSProperties;
}

/** The library game page's pill tab row. */
export function PillTabs<K extends string>({ tabs, active, onChange, style }: PillTabsProps<K>) {
  return (
    <Focusable flow-children="row" style={{ display: "flex", gap: 4, ...style }}>
      {tabs.map((t) => (
        <Focusable key={t.key} className={`ctk-pill${t.key === active ? " ctk-on" : ""}`} data-tab={t.key} noFocusRing onGamepadFocus={() => onChange(t.key)} onActivate={() => onChange(t.key)}>
          {t.label}
        </Focusable>
      ))}
    </Focusable>
  );
}

/** A store tag. Focusable only when it does something. */
export function TagChip({ children, onActivate }: { children: ReactNode; onActivate?: () => void }) {
  if (!onActivate) return <div className="ctk-tag">{children}</div>;
  return <Focusable className="ctk-tag" noFocusRing onActivate={onActivate} onOKActionDescription="Browse">{children}</Focusable>;
}

/** The store page's summary box: an uppercase heading with a rule, then rows. */
export function InfoBox({ title, children, style }: { title: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: "rgba(0,0,0,.2)", padding: "10px 12px 12px", boxSizing: "border-box", minWidth: 0, ...style }}>
      <div style={{ fontSize: 13, fontWeight: 700, lineHeight: "22px", textTransform: "uppercase", color: C.title, borderBottom: "1px solid rgba(255,255,255,.1)", marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  if (!children) return null;
  return (
    <div style={{ display: "flex", gap: 12, fontSize: 14, lineHeight: "24px" }}>
      <div style={{ flex: "0 0 42%", color: C.description, ...ellipsis }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0, color: C.title, ...ellipsis }}>{children}</div>
    </div>
  );
}

/** A square console tile that opens the console's page. */
export function ConsoleTile({ entry, size = 160, onFocus }: { entry: ConsoleEntry; size?: number; onFocus?: (platformId: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { platform, count } = entry;
  return (
    <Focusable
      ref={ref}
      className="ctk-tile ctk-ring ctk-lift"
      noFocusRing
      data-platform={platform.id}
      onActivate={() => openConsolePage(platform.id)}
      onOKActionDescription="Open"
      onGamepadFocus={() => {
        reveal(ref.current);
        onFocus?.(platform.id);
      }}
      style={{ background: "none" }}
    >
      <ConsoleFace platform={platform} size={size}>
        <div style={{ fontSize: 13, fontWeight: 500, lineHeight: "16px", color: C.title, ...ellipsis }}>{platform.name}</div>
        <div style={{ fontSize: 11, lineHeight: "14px", color: C.description }}>{count} {count === 1 ? "game" : "games"}</div>
      </ConsoleFace>
    </Focusable>
  );
}

/** A console as Steam shows a collection: art from its library behind its logo, the name and count underneath. */
export function ConsoleBanner({ entry, width, height = 150, onFocus }: { entry: ConsoleEntry; width: number; height?: number; onFocus?: (platformId: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { platform, count, art } = entry;
  const logo = consoleLogo(platform.slug);
  return (
    <Focusable
      ref={ref}
      className="ctk-tile ctk-ring ctk-banner"
      noFocusRing
      data-platform={platform.id}
      onActivate={() => openConsolePage(platform.id)}
      onOKActionDescription="Open"
      onGamepadFocus={() => {
        reveal(ref.current);
        onFocus?.(platform.id);
      }}
      style={{ width, height, overflow: "hidden" }}
    >
      <div className="ctk-banner-art" style={{ position: "absolute", inset: 0 }}><Art src={art} small bare /></div>
      <div className="ctk-banner-tint" style={{ position: "absolute", inset: 0 }} />
      <div style={{ position: "absolute", left: 20, right: 20, top: 16, bottom: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {logo
          ? <img src={logo} alt={platform.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block", filter: "drop-shadow(0 2px 6px rgba(0,0,0,.7))" }} />
          : <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", textAlign: "center" }}>{platform.name}</div>}
      </div>
      <div style={{ position: "absolute", left: 12, right: 12, bottom: 9, display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 500, color: C.title, ...ellipsis }}>{platform.name}</div>
        <div style={{ flex: "0 0 auto", fontSize: 12, color: C.body }}>{count} {count === 1 ? "game" : "games"}</div>
      </div>
    </Focusable>
  );
}

/** A grid of tiles laid out as focusable lines, so left/right stay in a line and up/down keep the column. */
export function TileGrid<T>({ items, columns, gap = GAP, gutter = GUTTER, render }: { items: T[]; columns: number; gap?: number; gutter?: number; render: (item: T) => ReactNode }) {
  const lines: T[][] = [];
  for (let i = 0; i < items.length; i += columns) lines.push(items.slice(i, i + columns));
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {lines.map((line, i) => (
        <Focusable key={i} flow-children="row" navEntryPreferPosition={NavEntryPositionPreferences.MAINTAIN_X} style={{ display: "flex", gap, padding: `${Math.round(gap / 2) + 2}px ${gutter}px` }}>
          {line.map(render)}
        </Focusable>
      ))}
    </div>
  );
}
