// One console's library (/chickentender/console/:platform_id): a header and a grid of covers, like a Steam collection.
import { Focusable, Navigation, NavEntryPositionPreferences, SteamSpinner } from "@decky/ui";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { consoleRoute, Game, gameRoute } from "../api";
import { useBackendState, useProgress } from "../state";
import { Card, reveal } from "./store/Card";
import { ConsoleFace } from "./store/Consoles";
import { Page } from "./store/Page";
import { needsSetup, SetupPage } from "./store/Setup";
import { MUTED, PAGE_X, STEAM } from "./store/theme";

const MIN_CARD_W = 150;
const GRID_GAP = 16;
const LOGO = 112;

type SortKey = "name" | "added" | "rating" | "size";
const SORTS: [SortKey, string][] = [["name", "Name"], ["added", "Recently added"], ["rating", "Rating"], ["size", "Size"]];
const compare: Record<SortKey, (a: Game, b: Game) => number> = {
  name: (a, b) => a.name.localeCompare(b.name),
  added: (a, b) => b.added_at.localeCompare(a.added_at) || a.name.localeCompare(b.name),
  rating: (a, b) => (b.rating ?? -1) - (a.rating ?? -1) || a.name.localeCompare(b.name),
  size: (a, b) => b.size_bytes - a.size_bytes || a.name.localeCompare(b.name),
};

// The page unmounts while a game page is open; this brings back the card left from. The sort is kept across visits.
const memory: { platformId?: number; romId?: number; sort: SortKey } = { sort: "name" };

/** Opens a console's page fresh, on its first card. */
export function openConsole(platformId: number) {
  memory.platformId = platformId;
  memory.romId = undefined;
  Navigation.Navigate(consoleRoute(platformId));
}

export function ConsoleView({ platformId }: { platformId: number }) {
  const state = useBackendState();
  const progress = useProgress();
  const [sort, setSort] = useState(memory.sort);
  const platform = state?.library.platforms.find((p) => p.id === platformId);
  const all = state?.library.games;
  const games = useMemo(() => (all ? all.filter((g) => g.platform_id === platformId).sort(compare[sort]) : []), [all, platformId, sort]);
  const installed = games.filter((g) => g.status === "installed").length;

  const grid = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const ready = !!platform && games.length > 0;
  // window here is SharedJSContext's, not the Big Picture window's, so the grid measures its own element.
  useLayoutEffect(() => {
    if (ready && grid.current) setWidth(grid.current.clientWidth);
  }, [ready]);
  const avail = width - 2 * PAGE_X;
  const columns = Math.max(1, Math.floor((avail + GRID_GAP) / (MIN_CARD_W + GRID_GAP)));
  const cardW = Math.floor((avail - (columns - 1) * GRID_GAP) / columns);
  const lines = useMemo(() => {
    const out: Game[][] = [];
    if (width) for (let i = 0; i < games.length; i += columns) out.push(games.slice(i, i + columns));
    return out;
  }, [games, columns, width]);

  const placed = !!lines.length;
  useEffect(() => {
    if (!placed) return;
    // A fresh route page has no gamepad focus and ignores preferredFocus; a DOM focus() hands it over.
    const back = memory.platformId === platformId && memory.romId !== undefined ? grid.current?.querySelector<HTMLDivElement>(`[data-rom="${memory.romId}"]`) : null;
    const card = back || grid.current?.querySelector<HTMLDivElement>("[data-rom]");
    if (!card) return;
    card.focus();
    if (back) reveal(back);
  }, [placed]);

  const onFocus = useCallback((g: Game, el: HTMLDivElement | null) => {
    memory.platformId = platformId;
    memory.romId = g.rom_id;
    // The focused card grows by 10 %; revealing its whole line keeps the grown card clear of Steam's footer, and the
    // first line brings the header back.
    const line = el?.closest<HTMLElement>(".ct-line");
    if (line && !line.previousElementSibling) line.closest(".ct-page")?.scrollTo({ top: 0, behavior: "instant" });
    else line?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [platformId]);
  const onOpen = useCallback((g: Game) => Navigation.Navigate(gameRoute(g.rom_id)), []);
  const choose = useCallback((key: SortKey) => {
    memory.sort = key;
    setSort(key);
  }, []);

  if (state && needsSetup(state)) return <SetupPage />;
  if (!state || (state.library.loading && !all?.length)) return <Page><SteamSpinner /></Page>;
  if (!platform || !games.length) {
    return (
      <Page>
        <div style={{ padding: `120px ${PAGE_X}px`, fontSize: 18 }}>{platform ? `No ${platform.name} games on your RomM server.` : "This console is not in your RomM library any more."}</div>
      </Page>
    );
  }

  return (
    <Page>
      <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", paddingBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24, padding: `68px ${PAGE_X}px 18px`, background: `linear-gradient(180deg, rgba(42,71,94,0.45) 0%, rgba(42,71,94,0) 100%)` }}>
          <ConsoleFace platform={platform} size={LOGO} />
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: STEAM.muted }}>Console</div>
            <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1.1, color: STEAM.title, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{platform.name}</div>
            <div style={{ fontSize: 14, color: MUTED }}>
              {games.length} {games.length === 1 ? "game" : "games"} · {installed} on this device
            </div>
          </div>
          <SortControl value={sort} onChange={choose} />
        </div>
        <div ref={grid} style={{ display: "flex", flexDirection: "column" }}>
          {lines.map((line, i) => (
            <Focusable
              key={i}
              className="ct-line"
              flow-children="row"
              navEntryPreferPosition={NavEntryPositionPreferences.MAINTAIN_X}
              style={{ display: "flex", gap: GRID_GAP, padding: `${i ? 4 : 14}px ${PAGE_X}px 16px` }}
            >
              {line.map((g) => <Card key={g.rom_id} game={g} width={cardW} progress={progress[g.rom_id]} onFocus={onFocus} onOpen={onOpen} />)}
            </Focusable>
          ))}
        </div>
      </Focusable>
    </Page>
  );
}

function SortControl({ value, onChange }: { value: SortKey; onChange: (key: SortKey) => void }) {
  return (
    <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, alignSelf: "flex-end" }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: STEAM.muted }}>Sort by</div>
      <Focusable
        flow-children="row"
        style={{ display: "flex", gap: 2, padding: 3, borderRadius: 6, background: "rgba(14,20,27,0.6)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)" }}
      >
        {SORTS.map(([key, label]) => <SortOption key={key} label={label} active={key === value} onActivate={() => onChange(key)} />)}
      </Focusable>
    </div>
  );
}

function SortOption({ label, active, onActivate }: { label: string; active: boolean; onActivate: () => void }) {
  const [focused, setFocused] = useState(false);
  return (
    <Focusable
      onActivate={onActivate}
      onGamepadFocus={() => setFocused(true)}
      onGamepadBlur={() => setFocused(false)}
      onOKActionDescription="Sort"
      style={{
        padding: "6px 14px",
        borderRadius: 4,
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        whiteSpace: "nowrap",
        background: focused ? "#fff" : active ? STEAM.surfaceRaised : "transparent",
        color: focused ? "#000" : active ? STEAM.title : STEAM.text,
        transition: "background 0.1s, color 0.1s",
      }}
    >
      {label}
    </Focusable>
  );
}
