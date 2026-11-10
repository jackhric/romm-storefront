// What the game page is built from: data, the primary action, facts, media, "More like this". The layout in
// (PageSteam, PagePlayStation, PageXbox) only lay these out, so they behave the same.
import { ConfirmModal, DialogButton, Focusable, GamepadButton, GamepadEvent, Menu, MenuItem, ModalRoot, Navigation, NavEntryPositionPreferences, ProgressBar, showContextMenu, showModal } from "@decky/ui";
import { CSSProperties, ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { FaEllipsisH } from "react-icons/fa";
import { cancelDownload, download, Game, GameDetails, gameRoute, Progress, Recommendation, similarGames } from "../../api";
import { removeFromDevice } from "../../actions";
import { formatSize, useBackendState, useProgress } from "../../state";
import { reveal } from "../store/Card";
import { actionLabel, backdropOf, percent, Row as RowModel, similarRow, useDetailsState } from "../store/model";
import { Row } from "../store/Row";
import { ACCENT, MUTED, PAGE_X, TEXT } from "../store/theme";
import { bpx } from "../store/theme";

export interface GameData {
  game: Game;
  details?: GameDetails;
  /** Details are known (or failed): decide art that depends on them only when this is true. */
  settled: boolean;
  progress: Record<number, Progress>;
  more?: RowModel;
  shots: string[];
  /** SteamGridDB's hero, else the first screenshot (sharp landscape art); the cover only once details say there are no screenshots. */
  backdrop?: string;
  serverUrl: string;
}

export function useGameData(romId: number) {
  const state = useBackendState();
  const progress = useProgress();
  const game = state?.library.games.find((g) => g.rom_id === romId);
  const { details, settled } = useDetailsState(romId, true);
  const [similar, setSimilar] = useState<Recommendation[]>();
  useEffect(() => {
    let live = true;
    similarGames(romId).then((r) => live && setSimilar(r)).catch(() => live && setSimilar([]));
    return () => {
      live = false;
    };
  }, [romId]);
  const games = state?.library.games;
  const more = useMemo(() => (games && similar ? similarRow(games, similar, romId) : undefined), [games, similar, romId]);
  const shots = details?.screenshots ?? [];
  const data: GameData | undefined = game && {
    game,
    details,
    settled,
    progress,
    more,
    shots,
    backdrop: backdropOf(game, details),
    serverUrl: state?.server.url ?? "",
  };
  return { state, data };
}

// RomM's screenshots are mostly native-resolution captures of old consoles; smoothing them up to 1080p blurs them.
const SHARP_CSS = ".ct-sharp img:not(.ct-smooth) { image-rendering: pixelated; }";

/** Wraps screenshot art (backdrop, slides, thumbnails) so it scales with hard pixels. */
export function Sharp({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="ct-sharp" style={style}>
      <style>{SHARP_CSS}</style>
      {children}
    </div>
  );
}

export const isBusy = (g: Game) => g.status === "queued" || g.status === "downloading";

const join = (v?: string[]) => (v && v.length ? v.join(", ") : undefined);

/** Every fact the pages can show, by label; variants pick the ones their layout has room for. */
export function facts(game: Game, details?: GameDetails) {
  return {
    Size: `${formatSize(game.size_bytes)}${game.multi ? " · several files" : ""}`,
    Year: game.release_year ? String(game.release_year) : undefined,
    Players: details?.player_count || undefined,
    Rating: game.rating !== null ? `★ ${game.rating}` : undefined,
    Region: join(game.regions),
    Genres: join(game.genres),
    Developer: join(details?.developers),
    Publisher: join(details?.publishers),
    Modes: join(details?.game_modes),
    Series: join(details?.franchises),
    File: details?.fs_name || undefined,
  };
}
export type FactKey = keyof ReturnType<typeof facts>;

export function pick(all: ReturnType<typeof facts>, keys: FactKey[]): [string, string][] {
  return keys.flatMap((k) => (all[k] ? [[k, all[k] as string] as [string, string]] : []));
}

export const LABEL: CSSProperties = { fontSize: bpx(13), letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED, lineHeight: 1.3 };
export const VALUE: CSSProperties = { fontSize: bpx(18), color: TEXT, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

/** A short LABEL over its value. */
export function Fact({ label, value, style }: { label: string; value: string; style?: CSSProperties }) {
  return (
    <div style={{ minWidth: 0, ...style }}>
      <div style={LABEL}>{label}</div>
      <div style={VALUE}>{value}</div>
    </div>
  );
}

export function FactStrip({ items, gap }: { items: [string, string][]; gap: number }) {
  return (
    <div style={{ display: "flex", gap, minWidth: 0, alignItems: "flex-start" }}>
      {items.map(([k, v]) => <Fact key={k} label={k} value={v} style={{ maxWidth: bpx(320) }} />)}
    </div>
  );
}

/** Label/value pairs in fixed columns, filled row by row. */
export function FactGrid({ items, columns, colWidth, rowGap = bpx(20) }: { items: [string, string][]; columns: number; colWidth: number; rowGap?: number }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, ${colWidth}px)`, columnGap: bpx(32), rowGap }}>
      {items.map(([k, v]) => <Fact key={k} label={k} value={v} />)}
    </div>
  );
}

function useAction(game: Game) {
  const [pending, setPending] = useState(false);
  const act = useCallback(() => {
    const run = (fn: () => Promise<unknown>) => {
      setPending(true);
      fn().catch(() => {}).finally(() => setPending(false));
    };
    if (game.status === "installed") {
      showModal(
        <ConfirmModal
          strTitle={game.name}
          strDescription="Remove this game from the device? Its files and its Steam shortcut are deleted; the game stays on your RomM server."
          strOKButtonText="Remove"
          bDestructiveWarning
          onOK={() => run(() => removeFromDevice(game.rom_id))}
        />,
      );
    } else if (isBusy(game)) {
      run(() => cancelDownload(game.rom_id));
    } else {
      run(() => download(game.rom_id));
    }
  }, [game]);
  return { act, pending };
}

/** The one big button (Download / Resume / Stop / Remove). focusOnMount hands Steam's gamepad focus to it. */
export function PrimaryButton({ game, width, height, fontSize, focusOnMount, style }: { game: Game; width: number; height: number; fontSize: number; focusOnMount?: boolean; style?: CSSProperties }) {
  const { act, pending } = useAction(game);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // A freshly mounted route page has no gamepad focus and ignores preferredFocus; a DOM focus() hands it over.
  useEffect(() => {
    if (focusOnMount) ref.current?.querySelector("button")?.focus();
  }, []);
  const primary = game.status !== "installed" && !isBusy(game);
  return (
    <div ref={ref} style={{ flex: "0 0 auto" }}>
      <DialogButton
        disabled={pending}
        onClick={act}
        onGamepadFocus={() => setFocused(true)}
        onGamepadBlur={() => setFocused(false)}
        onOKActionDescription={actionLabel(game)}
        style={{ width: "auto", minWidth: width, height, padding: "0 24px", fontSize, fontWeight: 600, whiteSpace: "nowrap", ...(focused || !primary ? {} : { background: ACCENT, color: "#fff" }), ...style }}
      >
        {actionLabel(game)}
      </DialogButton>
    </div>
  );
}

export function RoundButton({ size, label, onClick, children }: { size: number; label: string; onClick: (e: any) => void; children: ReactNode }) {
  return (
    <DialogButton
      onClick={onClick}
      onOKActionDescription={label}
      style={{ width: size, minWidth: size, height: size, padding: 0, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}
    >
      {children}
    </DialogButton>
  );
}

/** "...": the game's other actions in a Steam context menu. */
export function MoreButton({ data, size }: { data: GameData; size: number }) {
  const { game, serverUrl } = data;
  const { act } = useAction(game);
  const open = (e: any) =>
    showContextMenu(
      <Menu label={game.name}>
        <MenuItem onSelected={act}>{actionLabel(game)}</MenuItem>
        {serverUrl && <MenuItem onSelected={() => Navigation.NavigateToExternalWeb(`${serverUrl.replace(/\/$/, "")}/rom/${game.rom_id}`)}>Open in RomM</MenuItem>}
      </Menu>,
      e?.currentTarget ?? window,
    );
  return (
    <RoundButton size={size} label="More" onClick={open}>
      <FaEllipsisH size={Math.round(size * 0.4)} />
    </RoundButton>
  );
}

/** Download progress, or a one-line state, for the space next to or under the button; null when there is nothing to say. */
export function ProgressNote({ game, progress, width, fontSize = bpx(15) }: { game: Game; progress?: Progress; width: number; fontSize?: number }) {
  if (isBusy(game)) {
    return (
      <div style={{ width, fontSize, color: MUTED }}>
        <ProgressBar nProgress={percent(progress)} indeterminate={!progress} />
        <div style={{ marginTop: 4, whiteSpace: "nowrap" }}>
          {progress && progress.status === "downloading"
            ? `${Math.round(percent(progress))}% · ${formatSize(progress.done_bytes)} of ${formatSize(progress.total_bytes)}${progress.bps ? ` · ${formatSize(progress.bps)}/s` : ""}`
            : game.status === "queued" ? "Queued" : "Starting…"}
        </div>
      </div>
    );
  }
  if (game.status === "installed") return <div style={{ fontSize, color: "#8bc53f", whiteSpace: "nowrap" }}>On this Device</div>;
  if (game.status === "partial") return <div style={{ fontSize, color: MUTED, whiteSpace: "nowrap" }}>Partly downloaded</div>;
  return null;
}

/** The summary clamped to `lines`; when it overflows it is focusable and A expands it. */
export function Summary({ text, lines, fontSize, maxWidth }: { text: string; lines: number; fontSize: number; maxWidth: number }) {
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !open) setOverflows(el.scrollHeight > el.clientHeight + 1);
  }, [text, lines, open]);
  const body = (
    <div
      ref={ref}
      style={{ fontSize, lineHeight: 1.5, color: "rgba(223,227,230,0.9)", whiteSpace: "pre-line", ...(open ? {} : { overflow: "hidden", display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical" }) }}
    >
      {text}
    </div>
  );
  if (!overflows && !open) return <div style={{ maxWidth }}>{body}</div>;
  return (
    <Focusable
      onActivate={() => setOpen((o) => !o)}
      onOKActionDescription={open ? "Less" : "More"}
      onGamepadFocus={() => setFocused(true)}
      onGamepadBlur={() => setFocused(false)}
      style={{ maxWidth, borderRadius: 4, padding: "4px 8px", margin: "-4px -8px", background: focused ? "rgba(255,255,255,0.06)" : undefined }}
    >
      {body}
      <div style={{ fontSize: fontSize * 0.8, fontWeight: 600, marginTop: 4, color: focused ? TEXT : MUTED, letterSpacing: "0.04em" }}>{open ? "LESS" : "MORE"}</div>
    </Focusable>
  );
}

export function Section({ title, size, children, gap = bpx(16) }: { title: string; size: number; children: ReactNode; gap?: number }) {
  return (
    <div>
      <div style={{ fontSize: size, fontWeight: 600, padding: `0 ${PAGE_X}px`, marginBottom: gap }}>{title}</div>
      {children}
    </div>
  );
}

export function openLightbox(shots: string[], start: number, title: string, onIndex?: (i: number) => void) {
  showModal(<Lightbox shots={shots} start={start} title={title} onIndex={onIndex} />);
}

/** A horizontal row of 16:9 thumbnails; A opens the lightbox. */
export function ShotStrip({ shots, title, width, gap, active, onFocusIndex, padX = PAGE_X }: { shots: string[]; title: string; width: number; gap: number; active?: number; onFocusIndex?: (i: number) => void; padX?: number }) {
  return (
    <Focusable
      className="ct-strip ct-sharp"
      flow-children="row"
      navEntryPreferPosition={NavEntryPositionPreferences.MAINTAIN_X}
      style={{ display: "flex", gap, overflowX: "hidden", padding: `10px ${padX}px`, scrollPaddingLeft: padX, scrollPaddingRight: padX }}
    >
      {shots.map((src, i) => (
        <Shot key={src} src={src} width={width} active={i === active} onFocus={() => onFocusIndex?.(i)} onActivate={() => openLightbox(shots, i, title, onFocusIndex)} />
      ))}
    </Focusable>
  );
}

function Shot({ src, width, active, onFocus, onActivate }: { src: string; width: number; active: boolean; onFocus: () => void; onActivate: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  return (
    <Focusable
      ref={ref}
      className="ct-card"
      onActivate={onActivate}
      onGamepadFocus={() => {
        setFocused(true);
        onFocus();
        reveal(ref.current);
      }}
      onGamepadBlur={() => setFocused(false)}
      onOKActionDescription="View"
      style={{ width, flex: "0 0 auto", aspectRatio: "16 / 9", borderRadius: 4, overflow: "hidden", background: "rgba(255,255,255,0.06)", boxShadow: active ? `0 0 0 2px ${ACCENT}, 0 2px 8px rgba(0,0,0,0.5)` : "0 2px 8px rgba(0,0,0,0.5)", transform: focused ? "scale(1.06)" : "none", zIndex: focused ? 1 : undefined }}
    >
      <img src={src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    </Focusable>
  );
}

function Lightbox({ shots, start, title, onIndex, closeModal }: { shots: string[]; start: number; title: string; onIndex?: (i: number) => void; closeModal?: () => void }) {
  const [i, setI] = useState(start);
  const go = (d: number) => {
    const n = (i + d + shots.length) % shots.length;
    setI(n);
    onIndex?.(n);
  };
  const onDirection = (e: GamepadEvent) => {
    if (e.detail.button === GamepadButton.DIR_LEFT) go(-1);
    else if (e.detail.button === GamepadButton.DIR_RIGHT) go(1);
  };
  const onButton = (e: GamepadEvent) => {
    if (e.detail.button === GamepadButton.BUMPER_LEFT) go(-1);
    else if (e.detail.button === GamepadButton.BUMPER_RIGHT) go(1);
  };
  return (
    <ModalRoot bAllowFullSize bHideCloseIcon closeModal={closeModal} onCancel={closeModal}>
      <Focusable onActivate={() => closeModal?.()} onGamepadDirection={onDirection} onButtonDown={onButton} onOKActionDescription="Close" noFocusRing style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <img key={shots[i]} className="ct-fade" src={shots[i]} alt="" style={{ width: "100%", maxHeight: "68vh", objectFit: "contain", display: "block", borderRadius: 4, background: "#000" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: MUTED }}>
          <span>{title}</span>
          <span>{shots.length > 1 ? `${i + 1} / ${shots.length}  ·  left and right for more` : ""}</span>
        </div>
      </Focusable>
    </ModalRoot>
  );
}

const noop = () => {};
const openGame = (g: Game) => Navigation.Navigate(gameRoute(g.rom_id));

/** "More like this": the store's own cover row, so it follows the caption variant. */
export function MoreLikeThis({ data }: { data: GameData }) {
  if (!data.more) return null;
  return <Row row={data.more} progress={data.progress} onFocus={noop} onOpen={openGame} />;
}
