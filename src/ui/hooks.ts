// Data and behaviour shared by every layout in ui/variants: no markup here.
import { toaster } from "@decky/api";
import { ConfirmModal, Menu, MenuItem, Navigation, showContextMenu, showModal } from "@decky/ui";
import { createElement, RefObject, useCallback, useEffect, useMemo, useState } from "react";
import { removeFromDevice } from "../actions";
import { cancelDownload, consoleRoute, download, Game, GameDetails, gameRoute, gameVideo, launchTarget, Platform, Progress, State } from "../api";
import { formatSize } from "../state";
import { runShortcut } from "../steam/shortcuts";
import { forYouRow, laterRows, percent, recentRow, Row, topRated } from "./store/model";

export const isBusy = (g: Game) => g.status === "queued" || g.status === "downloading";
export const openGamePage = (g: Game) => Navigation.Navigate(gameRoute(g.rom_id));
export const openConsolePage = (platformId: number) => Navigation.Navigate(consoleRoute(platformId));

export interface ConsoleEntry { platform: Platform; count: number; /** Hero art of the console's best-rated game, or "". */ art: string }

export interface StoreModel {
  games: Game[];
  platforms: Platform[];
  byId: Map<number, Game>;
  recent?: Row;
  forYou?: Row;
  rated?: Row;
  installed?: Row;
  /** The best-rated games that have hero art, for spotlights and carousels. */
  featured: Game[];
  consoles: ConsoleEntry[];
}

export function useStoreModel(state: State): StoreModel {
  const { games, platforms, recommended } = state.library;
  return useMemo(() => {
    const later = laterRows(games);
    const counts = new Map<number, number>();
    for (const g of games) counts.set(g.platform_id, (counts.get(g.platform_id) ?? 0) + 1);
    const rated = topRated(games);
    const withArt = rated.filter((g) => g.art.hero);
    return {
      games,
      platforms,
      byId: new Map(games.map((g) => [g.rom_id, g])),
      recent: recentRow(games),
      forYou: forYouRow(games, recommended),
      rated: later.find((r) => r.key === "rated"),
      installed: later.find((r) => r.key === "installed"),
      featured: (withArt.length >= 4 ? withArt : rated.length ? rated : games).slice(0, 12),
      consoles: platforms.filter((p) => counts.get(p.id)).map((p) => ({
        platform: p,
        count: counts.get(p.id) ?? 0,
        art: withArt.find((g) => g.platform_id === p.id)?.art.hero ?? "",
      })),
    };
  }, [games, platforms, recommended]);
}

export type SortKey = "name" | "added" | "rating" | "size" | "year";
export const SORTS: [SortKey, string][] = [["name", "Name"], ["added", "Recently added"], ["rating", "Rating"], ["year", "Release year"], ["size", "Size"]];
const compare: Record<SortKey, (a: Game, b: Game) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  added: (a, b) => b.added_at.localeCompare(a.added_at) || a.name.localeCompare(b.name),
  rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.name.localeCompare(b.name),
  year: (a, b) => (b.release_year ?? 0) - (a.release_year ?? 0) || a.name.localeCompare(b.name),
  size: (a, b) => b.size_bytes - a.size_bytes || a.name.localeCompare(b.name),
};
export const sortGames = (games: Game[], key: SortKey) => [...games].sort(compare[key]);

let rememberedSort: SortKey = "name";

/** A sort that is kept across visits, with Steam's own menu to change it. */
export function useSort() {
  const [sort, set] = useState(rememberedSort);
  const setSort = useCallback((key: SortKey) => {
    rememberedSort = key;
    set(key);
  }, []);
  const openSortMenu = useCallback((target?: any) => {
    showContextMenu(
      createElement(Menu, { label: "Sort by" }, SORTS.map(([key, label]) => createElement(MenuItem, { key, onSelected: () => setSort(key) }, label))),
      target?.currentTarget ?? target ?? window,
    );
  }, [setSort]);
  return { sort, sortLabel: SORTS.find(([k]) => k === sort)?.[1] ?? "", setSort, openSortMenu };
}

export type ActionKind = "download" | "resume" | "stop" | "play";
export const actionKind = (g: Game): ActionKind => (g.status === "installed" ? "play" : isBusy(g) ? "stop" : g.status === "partial" ? "resume" : "download");
const LABELS: Record<ActionKind, string> = { download: "Download", resume: "Resume", stop: "Stop download", play: "Play" };

function confirmRemove(game: Game) {
  showModal(
    createElement(ConfirmModal, {
      strTitle: game.name,
      strDescription: "Remove this game from the device? Its files and its Steam shortcut are deleted; the game stays on your RomM server.",
      strOKButtonText: "Remove",
      bDestructiveWarning: true,
      onOK: () => void removeFromDevice(game.rom_id).catch(() => {}),
    }),
  );
}

async function play(game: Game) {
  const t = await launchTarget(game.rom_id);
  if (t.appid) runShortcut(t.appid);
  else toaster.toast({ title: game.name, body: "No Steam shortcut yet: remove the game and download it again." });
}

/** The one primary action of a game (Download, Resume, Stop, Play) and its secondary menu, the same in every layout. */
export function useGameActions(game: Game, serverUrl = "") {
  const [pending, setPending] = useState(false);
  const kind = actionKind(game);
  const act = useCallback(() => {
    const run = kind === "play" ? play(game) : kind === "stop" ? cancelDownload(game.rom_id) : download(game.rom_id);
    setPending(true);
    void Promise.resolve(run).catch(() => {}).finally(() => setPending(false));
  }, [game, kind]);
  const openMenu = useCallback((target?: any) => {
    const items = [
      createElement(MenuItem, { key: "act", onSelected: act }, LABELS[kind]),
      game.status === "installed" && createElement(MenuItem, { key: "remove", tone: "destructive", onSelected: () => confirmRemove(game) }, "Remove from this device"),
      serverUrl && createElement(MenuItem, { key: "romm", onSelected: () => Navigation.NavigateToExternalWeb(`${serverUrl.replace(/\/$/, "")}/rom/${game.rom_id}`) }, "Open in RomM"),
    ].filter(Boolean);
    showContextMenu(createElement(Menu, { label: game.name }, items), target?.currentTarget ?? target ?? window);
  }, [game, kind, act, serverUrl]);
  return { kind, label: LABELS[kind], act, pending, openMenu };
}

/** "42% · 1.2 GB of 4.1 GB · 12 MB/s", or the game's resting state in a few words. */
export function statusText(game: Game, p?: Progress): string {
  if (p && p.status === "downloading") return `${Math.round(percent(p))}% · ${formatSize(p.done_bytes)} of ${formatSize(p.total_bytes)}${p.bps ? ` · ${formatSize(p.bps)}/s` : ""}`;
  switch (game.status) {
    case "installed": return "On this Device";
    case "queued": return "Queued";
    case "downloading": return "Starting…";
    case "partial": return "Partly downloaded";
    default: return formatSize(game.size_bytes);
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "1998-06-29" -> "Jun 29, 1998", like the store's release dates. */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : "";
}

// RomM passes HowLongToBeat's numbers through; they are seconds there, but a small value can only be hours.
export function formatHours(value?: number): string {
  if (!value) return "";
  const hours = value >= 1000 ? value / 3600 : value;
  return hours >= 10 ? `${Math.round(hours)} hours` : `${Math.round(hours * 10) / 10} hours`;
}

/** Steam's review wording for a 0-100 score. */
export function scoreWord(score: number): string {
  if (score >= 95) return "Overwhelmingly Positive";
  if (score >= 80) return "Very Positive";
  if (score >= 70) return "Mostly Positive";
  if (score >= 40) return "Mixed";
  return "Mostly Negative";
}

/** A plain video file, or YouTube's player; a file may name what to play when it cannot be loaded. */
export type VideoSource = { kind: "file"; src: string; /** The sound, when the file itself is silent. */ audio?: string; fallback?: VideoSource } | { kind: "youtube"; id: string };
export function videoOf(details?: GameDetails): VideoSource | undefined {
  if (details?.video) return { kind: "file", src: details.video };
  if (details?.youtube_video_id) return { kind: "youtube", id: details.youtube_video_id };
  return undefined;
}

type Streams = { small: string; large: string; audio: string };
const STREAMS_FRESH_MS = 2 * 3600 * 1000;
const streamCache = new Map<number, { at: number; streams: Streams }>();
const streamsInFlight = new Map<number, Promise<Streams>>();

function resolveStreams(romId: number): Promise<Streams> {
  const cached = streamCache.get(romId);
  if (cached && Date.now() - cached.at < STREAMS_FRESH_MS) return Promise.resolve(cached.streams);
  let p = streamsInFlight.get(romId);
  if (!p) {
    p = gameVideo(romId)
      .then(({ small, large, audio }) => ({ small, large, audio: audio ?? "" }))
      .catch(() => ({ small: "", large: "", audio: "" }))
      .then((streams) => {
        streamCache.set(romId, { at: Date.now(), streams });
        return streams;
      })
      .finally(() => streamsInFlight.delete(romId));
    streamsInFlight.set(romId, p);
  }
  return p;
}

let warming: Promise<unknown> = Promise.resolve();
/** Resolves the trailers of games about to be shown, one after another, so a preview can start at once. */
export function warmVideos(games: Game[]) {
  for (const g of games) warming = warming.then(() => resolveStreams(g.rom_id));
}

/** A stream address stopped working (they expire): resolve it again next time. */
export function videoBroke(src: string) {
  for (const [romId, entry] of streamCache) if (entry.streams.small === src || entry.streams.large === src) streamCache.delete(romId);
}

/**
 * The game's video as a plain file where possible: one RomM hosts, else the trailer's direct stream resolved by the
 * backend, with YouTube's player only as the fallback. Undefined while resolving and when the game has no video.
 */
export function useVideo(details: GameDetails | undefined, size: "small" | "large"): VideoSource | undefined {
  const romId = details?.rom_id;
  const embed = details?.youtube_video_id;
  const hosted = details?.video;
  const [resolved, setResolved] = useState<{ romId: number; streams: Streams }>();
  useEffect(() => {
    if (romId === undefined || hosted || !embed) return;
    let live = true;
    void resolveStreams(romId).then((streams) => live && setResolved({ romId, streams }));
    return () => {
      live = false;
    };
  }, [romId, hosted, embed]);
  return useMemo(() => {
    if (hosted) return { kind: "file", src: hosted };
    if (!embed || !resolved || resolved.romId !== romId) return undefined;
    const youtube: VideoSource = { kind: "youtube", id: embed };
    const src = size === "small" ? resolved.streams.small || resolved.streams.large : resolved.streams.large || resolved.streams.small;
    return src ? { kind: "file", src, audio: resolved.streams.audio || undefined, fallback: youtube } : youtube;
  }, [hosted, embed, resolved, romId, size]);
}

/** Tags for a game the way the store lists them: genres, themes, perspectives, series. */
export function tagsOf(game: Game, details?: GameDetails): string[] {
  const all = details ? [...details.genres, ...details.themes, ...details.perspectives, ...details.franchises] : game.genres;
  return [...new Set(all.filter(Boolean))];
}

const focusMemory = new Map<string, string>();

const QUICK_MS = 220;
let lastMove = 0;

// A single move glides; holding or tapping a direction quickly jumps, so the page never lags behind the focus.
function pace(): ScrollBehavior {
  const now = performance.now();
  const quick = now - lastMove < QUICK_MS;
  lastMove = now;
  return quick ? "instant" : "smooth";
}

/** Brings a newly focused element into view. */
export function reveal(el: HTMLElement | null, block: ScrollLogicalPosition = "nearest") {
  el?.scrollIntoView({ block, inline: "center", behavior: pace() });
}

/** Scrolls the page an element is on back to its top (the hero), at the same pace as reveal. */
export function revealPageTop(el: HTMLElement | null) {
  el?.closest(".ctk-page")?.scrollTo({ top: 0, behavior: pace() });
}

/**
 * Returns the page to its top while focus is inside `el` (the head of a page). Steam scrolls a focused element only
 * just into view about 80 ms after focus, so the top is asked for again once that has started.
 */
export function holdPageTop(el: HTMLElement | null) {
  const page = el?.closest<HTMLElement>(".ctk-page");
  const win = el?.ownerDocument.defaultView;
  if (!el || !page || !win) return;
  page.scrollTo({ top: 0, behavior: pace() });
  const again = () => {
    if (page.scrollTop > 0 && el.querySelector(".gpfocus")) page.scrollTo({ top: 0, behavior: "smooth" });
  };
  // The page window's timers: this script's own are throttled to about one a second.
  win.setTimeout(again, 160);
  win.setTimeout(again, 450);
}

/**
 * A freshly mounted route page has no gamepad focus and ignores preferredFocus; a DOM focus() on a Focusable hands
 * it over. Gives focus to the element left from (remember its selector), else to `fallback`.
 */
export function useReturnFocus(key: string, root: RefObject<HTMLElement | null>, ready: boolean, fallback = "[data-autofocus]") {
  useEffect(() => {
    if (!ready) return;
    const saved = focusMemory.get(key);
    const back = saved ? root.current?.querySelector<HTMLElement>(saved) : null;
    const el = back || root.current?.querySelector<HTMLElement>(fallback);
    if (!el) return;
    el.focus();
    if (back) reveal(back);
  }, [ready]);
  return useCallback((selector: string | undefined) => {
    if (selector) focusMemory.set(key, selector);
    else focusMemory.delete(key);
  }, [key]);
}

/** The selector of a game card inside its section, for useReturnFocus. */
export function cardSelector(el: HTMLElement | null, romId: number): string {
  const section = el?.closest<HTMLElement>("[data-section]")?.dataset.section;
  return section ? `[data-section="${section}"] [data-rom="${romId}"]` : `[data-rom="${romId}"]`;
}
