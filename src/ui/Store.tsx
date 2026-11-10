// The storefront route page (/chickentender). Owned by the storefront work; index.tsx only mounts it.
import { Focusable, Navigation, SteamSpinner } from "@decky/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Game, gameRoute } from "../api";
import { useBackendState, useProgress } from "../state";
import { openConsole } from "./ConsolePage";
import { Consoles } from "./store/Consoles";
import { Hero } from "./store/Hero";
import { useRotation } from "./store/HeroBackground";
import { forYouRow, laterRows, openGame, recentRow, topRated, useGameDetails } from "./store/model";
import { reveal } from "./store/Card";
import { Page } from "./store/Page";
import { Row } from "./store/Row";
import { needsSetup, SetupPage } from "./store/Setup";
import { PAGE_X } from "./store/theme";

const CYCLE_MS = 8000;
const FEATURED = 8;

// The route page unmounts while a game or console page is open; this brings back the card or tile left from.
const memory: { focused?: string } = {};

export function Storefront() {
  const state = useBackendState();
  const progress = useProgress();
  const games = state?.library.games;
  const platforms = state?.library.platforms;
  const recommended = state?.library.recommended;
  const recent = useMemo(() => (games ? recentRow(games) : undefined), [games]);
  const forYou = useMemo(() => (games && recommended ? forYouRow(games, recommended) : undefined), [games, recommended]);
  const later = useMemo(() => (games ? laterRows(games) : []), [games]);
  const featured = useMemo(() => (games ? topRated(games).slice(0, FEATURED) : []), [games]);
  const [returnTo] = useState(() => memory.focused);

  const [selectedId, setSelectedId] = useState<number>();
  const [heroFocused, setHeroFocused] = useState(false);
  const { index: cycle } = useRotation(featured, CYCLE_MS, selectedId !== undefined || heroFocused);
  // Fetch the next featured game's details ahead, so the backdrop swaps the moment the rotation does.
  useGameDetails(selectedId === undefined && featured.length > 1 ? featured[(cycle + 1) % featured.length]?.rom_id : undefined);

  const onFocus = useCallback((g: Game, el: HTMLDivElement | null) => {
    setSelectedId(g.rom_id);
    const section = el?.closest<HTMLElement>("[data-section]")?.dataset.section;
    memory.focused = section ? `[data-section="${section}"] [data-rom="${g.rom_id}"]` : undefined;
    // The first row sits right under the hero, which shows the focused game: bring both back when it is reached.
    if (el && el.closest(".ct-row") === el.closest(".ct-page")?.querySelector(".ct-row")) el.closest(".ct-page")?.scrollTo({ top: 0, behavior: "instant" });
  }, []);
  const onOpen = useCallback((g: Game) => Navigation.Navigate(gameRoute(g.rom_id)), []);
  const onConsoleFocus = useCallback((id: number) => {
    memory.focused = `[data-section="consoles"] [data-platform="${id}"]`;
  }, []);

  const root = useRef<HTMLDivElement>(null);
  const ready = !!games?.length;
  useEffect(() => {
    if (!ready) return;
    // Steam leaves a freshly mounted route page without gamepad focus (preferredFocus is not honoured here),
    // and a DOM focus() on a Focusable hands it over. Coming back from a game or console page, its card or tile gets it.
    const card = returnTo && root.current?.querySelector<HTMLElement>(returnTo);
    // A fresh visit leaves focus alone: the hero button pauses the rotation while it has focus.
    if (!card) return;
    card.focus();
    reveal(card as HTMLDivElement);
  }, [ready]);

  // Always the live copy from the state: a card's status changes under the hero while it downloads.
  const hero = (selectedId !== undefined && games?.find((g) => g.rom_id === selectedId)) || featured[cycle % Math.max(1, featured.length)] || games?.[0];
  const details = useGameDetails(hero?.rom_id);

  if (state && needsSetup(state)) return <SetupPage />;
  if (!state || (state.library.loading && !state.library.games.length)) return <Page><SteamSpinner /></Page>;
  if (!hero || !games) {
    return (
      <Page>
        <div style={{ padding: `120px ${PAGE_X}px`, fontSize: 18 }}>
          {state.library.error ? `Could not load the library: ${state.library.error}` : "No games on this RomM server yet."}
        </div>
      </Page>
    );
  }
  return (
    <Page>
      <Focusable ref={root} flow-children="column" style={{ display: "flex", flexDirection: "column", paddingBottom: 20 }}>
        <Hero game={hero} details={details} progress={progress[hero.rom_id]} onOpen={openGame} onButtonFocus={setHeroFocused} />
        {recent && <Row row={recent} progress={progress} onFocus={onFocus} onOpen={onOpen} />}
        {platforms && <Consoles platforms={platforms} games={games} onFocus={onConsoleFocus} onOpen={openConsole} />}
        {forYou && <Row row={forYou} progress={progress} onFocus={onFocus} onOpen={onOpen} />}
        {later.map((row) => <Row key={row.key} row={row} progress={progress} onFocus={onFocus} onOpen={onOpen} />)}
      </Focusable>
    </Page>
  );
}
