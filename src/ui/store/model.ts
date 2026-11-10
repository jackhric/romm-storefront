import { useEffect, useState } from "react";
import { Game, GameDetails, gameDetails, Progress, Recommendation } from "../../api";

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
