import { ConfirmModal, showModal } from "@decky/ui";
import { useEffect, useState } from "react";
import { removeFromDevice } from "../../actions";
import { cancelDownload, download, Game, GameDetails, gameDetails, Platform, Progress, Recommendation } from "../../api";
import { formatSize } from "../../state";

export interface Row {
  key: string;
  title: string;
  subtitle: string;
  games: Game[];
  /** A short line under a card in place of its status, by rom id. */
  notes?: Record<number, string>;
}

const ROW_LIMIT = 24;

export function recentRow(games: Game[]): Row | undefined {
  const recent = [...games].sort((a, b) => b.added_at.localeCompare(a.added_at)).slice(0, ROW_LIMIT);
  return recent.length ? { key: "recent", title: "Recently added", subtitle: "New on your RomM server", games: recent } : undefined;
}

/** "Top rated" and "On this Device", the rows below the personal ones. */
export function laterRows(games: Game[]): Row[] {
  const rows: Row[] = [];
  const rated = topRated(games).slice(0, ROW_LIMIT);
  if (rated.length) rows.push({ key: "rated", title: "Top rated", subtitle: "Best reviewed in the library", games: rated });
  const installed = games.filter((g) => g.status === "installed");
  if (installed.length) rows.push({ key: "installed", title: "On this Device", subtitle: `${installed.length} ready to play`, games: installed });
  return rows;
}

/** Recommendations resolved against the library (RomM may recommend a game the snapshot no longer has). */
function resolve(games: Game[], recs: Recommendation[]): [Game, Recommendation][] {
  const byId = new Map(games.map((g) => [g.rom_id, g]));
  const seen = new Set<number>();
  const out: [Game, Recommendation][] = [];
  for (const r of recs) {
    const g = byId.get(r.rom_id);
    if (g && !seen.has(g.rom_id)) {
      seen.add(g.rom_id);
      out.push([g, r]);
    }
  }
  return out.slice(0, ROW_LIMIT);
}

/** "genre: Platform" -> "Genre: Platform". */
export function reasonText(reason: string): string {
  const [kind, ...rest] = reason.split(":");
  const value = rest.join(":").trim();
  if (!value) return reason;
  const label = kind.trim().replace(/_/g, " ");
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}: ${value}`;
}

export function forYouRow(games: Game[], recs: Recommendation[]): Row | undefined {
  const picks = resolve(games, recs);
  if (!picks.length) return undefined;
  const seeds = new Set(picks.map(([, r]) => r.seed_rom_name || ""));
  const oneSeed = seeds.size === 1 ? [...seeds][0] : "";
  const notes: Record<number, string> = {};
  for (const [g, r] of picks) {
    notes[g.rom_id] = !oneSeed && r.seed_rom_name ? `Like ${r.seed_rom_name}` : r.reasons[0] ? reasonText(r.reasons[0]) : "";
  }
  return { key: "foryou", title: "For you", subtitle: oneSeed ? `Because you played ${oneSeed}` : "Picked from the games you play", games: picks.map(([g]) => g), notes };
}

export function similarRow(games: Game[], recs: Recommendation[], self: number): Row | undefined {
  const picks = resolve(games, recs.filter((r) => r.rom_id !== self));
  if (!picks.length) return undefined;
  const notes: Record<number, string> = {};
  for (const [g, r] of picks) if (r.reasons[0]) notes[g.rom_id] = reasonText(r.reasons[0]);
  return { key: "similar", title: "More like this", subtitle: "From your library", games: picks.map(([g]) => g), notes };
}

/** IGDB serves its logos as transparent PNGs at any size; other sources (box art) are not logos. */
export function platformLogo(p: Platform): string {
  const m = /^(https:\/\/images\.igdb\.com\/igdb\/image\/upload\/)t_[a-z0-9_]+\/([a-z0-9]+)\.(jpg|png)$/i.exec(p.logo);
  return m ? `${m[1]}t_logo_med/${m[2]}.png` : "";
}

/** The portrait art of a game: SteamGridDB's capsule, then RomM's cover. */
export const coverOf = (game: Game) => game.art.grid || game.cover_large || game.cover;

/** The hero backdrop: SteamGridDB's hero, then (once details are known) the first screenshot or the cover. */
export const backdropOf = (game: Game, details?: GameDetails) => game.art.hero || (details ? details.screenshots[0] || game.cover_large || game.cover : undefined);

export function topRated(games: Game[]): Game[] {
  return games.filter((g) => g.rating !== null).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
}

export function percent(p?: Progress): number {
  return p && p.total_bytes ? (100 * p.done_bytes) / p.total_bytes : 0;
}

export function statusLine(game: Game, p?: Progress): string {
  if (p && p.status === "downloading") return `${Math.round(percent(p))}%${p.bps ? ` · ${formatSize(p.bps)}/s` : ""}`;
  switch (game.status) {
    case "installed": return "On this Device";
    case "queued": return "Queued";
    case "downloading": return "Starting…";
    case "partial": return `${formatSize(game.size_bytes)} · resume`;
    default: return formatSize(game.size_bytes);
  }
}

/** The one verb the primary button and the A-button legend show for a game. */
export function actionLabel(game: Game): string {
  switch (game.status) {
    case "installed": return "Remove from this device";
    case "queued":
    case "downloading": return "Stop download";
    case "partial": return "Resume";
    default: return "Download";
  }
}

export function metaLine(game: Game): string {
  const parts = [game.platform];
  if (game.release_year) parts.push(String(game.release_year));
  if (game.genres.length) parts.push(game.genres.slice(0, 3).join(", "));
  return parts.join("  ·  ");
}

export function openGame(game: Game) {
  if (game.status === "installed") {
    showModal(
      <ConfirmModal
        strTitle={game.name}
        strDescription="Remove this game from the device? Its files and its Steam shortcut are deleted; the game stays on your RomM server."
        strOKButtonText="Remove"
        bDestructiveWarning
        onOK={() => removeFromDevice(game.rom_id)}
      />,
    );
    return;
  }
  if (game.status === "queued" || game.status === "downloading") {
    showModal(<ConfirmModal strTitle={game.name} strDescription="Stop this download?" strOKButtonText="Stop" onOK={() => cancelDownload(game.rom_id)} />);
    return;
  }
  showModal(
    <ConfirmModal
      strTitle={game.name}
      strDescription={`${game.platform} · ${formatSize(game.size_bytes)}${game.multi ? " · several files" : ""}. Download to this device?`}
      strOKButtonText={game.status === "partial" ? "Resume" : "Download"}
      onOK={() => download(game.rom_id)}
    />,
  );
}

const detailsCache = new Map<number, GameDetails>();
const detailsInFlight = new Map<number, Promise<GameDetails>>();

function fetchDetails(romId: number): Promise<GameDetails> {
  let p = detailsInFlight.get(romId);
  if (!p) {
    p = gameDetails(romId).then((d) => {
      detailsCache.set(romId, d);
      return d;
    }).finally(() => detailsInFlight.delete(romId));
    detailsInFlight.set(romId, p);
  }
  return p;
}

/** Starts fetching a game's details so they are cached before a page asks for them. */
export function prefetchDetails(romId: number): void {
  if (!detailsCache.has(romId)) fetchDetails(romId).catch(() => {});
}

export interface DetailsState {
  details?: GameDetails;
  /** True once the details are known or the fetch has failed: what depends on them can be decided. */
  settled: boolean;
}

/**
 * Details of one game. The default waits a short pause after the game is selected so scrolling a row does not
 * fetch every card; `immediate` (a game page) fetches at once. A cached value is returned on the first render.
 */
export function useDetailsState(romId: number | undefined, immediate = false): DetailsState {
  const [, rerender] = useState(0);
  const [failed, setFailed] = useState<number>();
  useEffect(() => {
    if (romId === undefined || detailsCache.has(romId)) return;
    let live = true;
    const start = () =>
      fetchDetails(romId).then(() => live && rerender((n) => n + 1)).catch(() => live && setFailed(romId));
    if (immediate) {
      start();
      return () => {
        live = false;
      };
    }
    const timer = setTimeout(start, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [romId, immediate]);
  const details = romId === undefined ? undefined : detailsCache.get(romId);
  return { details, settled: !!details || (romId !== undefined && failed === romId) };
}

export function useGameDetails(romId: number | undefined): GameDetails | undefined {
  return useDetailsState(romId).details;
}
