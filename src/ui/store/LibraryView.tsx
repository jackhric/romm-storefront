// The one library view behind Browse, Top rated, New and a console's page: a pool of games, the filter row, an endless
// grid. Callers differ only in the pool, the order and what is fixed.
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Game, Progress } from "../../api";
import { ConsoleEntry, sortGames } from "../hooks";
import { topRated } from "./model";
import { Catalog, Remember } from "./catalog";
import { applyFilters, Filters, NO_FILTERS } from "./filters";

const PAGE = 84;

interface Saved { filters: Filters; limit: number }
const memory = new Map<string, Saved>();

/** Sets the filters a view opens with, e.g. for a "View more" link into Browse. */
export function presetLibrary(id: string, filters: Filters) {
  memory.set(id, { filters, limit: PAGE });
}

export interface LibraryViewProps {
  /** Names the view: its remembered filters, its place in the page (data-section). */
  id: string;
  title: ReactNode;
  games: Game[];
  /** Offered in the Console filter; leave out where the console is already fixed. */
  consoles?: ConsoleEntry[];
  /** "sort" lets the user choose; the others are fixed orders. */
  order: "sort" | "rating" | "added";
  /** Keeps only the first so many after ordering and filtering (a "top 70"). */
  cap?: number;
  query?: string;
  onClearQuery?: () => void;
  progress: Record<number, Progress>;
  remember: Remember;
}

export function LibraryView({ id, title, games, consoles = [], order, cap, query = "", onClearQuery, progress, remember }: LibraryViewProps) {
  const saved = memory.get(id);
  const [filters, setFilters] = useState(saved?.filters ?? NO_FILTERS);
  const [limit, setLimit] = useState(saved?.limit ?? PAGE);
  const genres = useMemo(() => [...new Set(games.flatMap((g) => g.genres))].sort((a, b) => a.localeCompare(b)), [games]);
  const pool = useMemo(() => (order === "rating" ? topRated(games) : order === "added" ? sortGames(games, "added") : games), [games, order]);
  const matched = useMemo(() => {
    const found = applyFilters(pool, filters, query);
    return cap ? found.slice(0, cap) : found;
  }, [pool, filters, query, cap]);

  const store = (f: Filters, n: number) => {
    memory.set(id, { filters: f, limit: n });
    setFilters(f);
    setLimit(n);
  };
  // A new search starts from the top of the results.
  const seenQuery = useRef(query);
  useEffect(() => {
    if (seenQuery.current === query) return;
    seenQuery.current = query;
    store(filters, PAGE);
  }, [query]);
  // Endless: more of the grid is laid out as focus nears the end of what is there.
  const grow = useCallback(() => setLimit((n) => {
    const next = n + PAGE;
    memory.set(id, { filters: memory.get(id)?.filters ?? NO_FILTERS, limit: next });
    return next;
  }), [id]);

  const searching = query.trim() !== "";
  return (
    <Catalog
      title={searching ? `Results for "${query.trim()}"` : title}
      weight={600}
      subtitle={`· ${matched.length} ${matched.length === 1 ? "game" : "games"}`}
      games={matched}
      progress={progress}
      section={id}
      remember={remember}
      limit={limit}
      onNearEnd={grow}
      ordered={order !== "sort"}
      filterBar={{
        consoles,
        genres,
        value: filters,
        onChange: (f) => store(f, PAGE),
        searching,
        onClear: () => {
          onClearQuery?.();
          store(NO_FILTERS, PAGE);
        },
      }}
    />
  );
}
