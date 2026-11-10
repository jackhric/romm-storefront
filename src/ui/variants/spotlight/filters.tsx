import { Focusable, Menu, MenuItem, showContextMenu, TextField } from "@decky/ui";
import { ReactNode, RefObject, useCallback, useEffect, useRef, useState } from "react";
import { FaChevronDown, FaHdd, FaSearch, FaTimes } from "react-icons/fa";
import { Game } from "../../../api";
import { Button, C } from "../../kit";
import { ConsoleEntry } from "../../hooks";

export interface Filters { platformId: number; genre: string; installed: boolean }
export const NO_FILTERS: Filters = { platformId: 0, genre: "", installed: false };

export const filtersActive = (f: Filters) => f.platformId !== 0 || f.genre !== "" || f.installed;

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);

export function applyFilters(games: Game[], f: Filters, query: string): Game[] {
  const terms = words(query);
  if (!terms.length && !filtersActive(f)) return games;
  return games.filter((g) => {
    if (f.platformId && g.platform_id !== f.platformId) return false;
    if (f.genre && !g.genres.includes(f.genre)) return false;
    if (f.installed && g.status !== "installed") return false;
    if (!terms.length) return true;
    const name = ` ${words(g.name).join(" ")}`;
    return terms.every((t) => name.includes(t));
  });
}

let rememberedQuery = "";
export const setRememberedQuery = (q: string) => { rememberedQuery = q; };

const DEBOUNCE_MS = 300;

/**
 * Debounced search text. The script runs in a hidden context whose setTimeout is throttled to about 1 Hz, so the
 * timer comes from the window the field is rendered in.
 */
export function useSearch(onApplied: (query: string) => void) {
  const [text, setText] = useState(rememberedQuery);
  const [query, setQuery] = useState(rememberedQuery);
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef<{ win: Window; id: number } | undefined>(undefined);
  const applied = useRef(onApplied);
  applied.current = onApplied;

  const cancel = useCallback(() => {
    if (!timer.current) return;
    timer.current.win.clearTimeout(timer.current.id);
    timer.current = undefined;
  }, []);
  const apply = useCallback((q: string) => {
    rememberedQuery = q;
    setQuery(q);
    applied.current(q);
  }, []);
  const type = useCallback((value: string) => {
    setText(value);
    cancel();
    const win = box.current?.ownerDocument.defaultView ?? window;
    timer.current = { win, id: win.setTimeout(() => { timer.current = undefined; apply(value); }, DEBOUNCE_MS) };
  }, [cancel, apply]);
  const clear = useCallback(() => {
    cancel();
    setText("");
    apply("");
  }, [cancel, apply]);
  useEffect(() => cancel, [cancel]);

  return { text, query, box, type, clear };
}

export function SearchField({ text, box, onType }: { text: string; box: RefObject<HTMLDivElement | null>; onType: (value: string) => void }) {
  return (
    <div ref={box} className="sp-search">
      <FaSearch size={13} className="sp-search-icon" />
      <TextField {...{ placeholder: "Search games" }} value={text} bShowClearAction onChange={(e) => onType(e.target.value)} />
    </div>
  );
}

/** A square button holding only an icon; the footer hint says what it does. */
export const ICON = { width: 36, padding: 0 } as const;

export interface FilterBarProps {
  consoles: ConsoleEntry[];
  genres: string[];
  value: Filters;
  onChange: (f: Filters) => void;
  searching: boolean;
  onClear: () => void;
  children?: ReactNode;
}

export function FilterBar({ consoles, genres, value, onChange, searching, onClear, children }: FilterBarProps) {
  const bar = useRef<HTMLDivElement>(null);
  const menu = (label: string, items: { name: string; apply: () => void }[]) => (el: HTMLDivElement | null) =>
    showContextMenu(
      <Menu label={label}>
        {items.map((i) => <MenuItem key={i.name} onSelected={i.apply}>{i.name}</MenuItem>)}
      </Menu>,
      el ?? window,
    );
  const consoleName = consoles.find((c) => c.platform.id === value.platformId)?.platform.name ?? "All";
  const clear = () => {
    // Clear unmounts itself; hand focus to a button that stays.
    bar.current?.querySelector<HTMLElement>(".ctk-button")?.focus();
    onClear();
  };
  const chevron = <FaChevronDown size={10} style={{ marginLeft: 8 }} />;

  return (
    <Focusable ref={bar} flow-children="row" style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
      {consoles.length > 0 && (
        <Button
          label="Console"
          onClick={menu("Console", [
            { name: "All consoles", apply: () => onChange({ ...value, platformId: 0 }) },
            ...consoles.map((c) => ({ name: c.platform.name, apply: () => onChange({ ...value, platformId: c.platform.id }) })),
          ])}
        >
          {value.platformId ? consoleName : "All consoles"}{chevron}
        </Button>
      )}
      <Button
        label="Genre"
        onClick={menu("Genre", [
          { name: "All genres", apply: () => onChange({ ...value, genre: "" }) },
          ...genres.map((genre) => ({ name: genre, apply: () => onChange({ ...value, genre }) })),
        ])}
      >
        {value.genre || "All genres"}{chevron}
      </Button>
      <Button
        label={value.installed ? "Show all games" : "Only on this device"}
        onClick={() => onChange({ ...value, installed: !value.installed })}
        style={{ ...ICON, ...(value.installed ? { background: C.blue } : {}) }}
      >
        <FaHdd size={15} />
      </Button>
      {children}
      {(filtersActive(value) || searching) && <Button label="Clear filters" onClick={clear} style={ICON}><FaTimes size={14} /></Button>}
    </Focusable>
  );
}
