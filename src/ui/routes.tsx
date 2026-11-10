// The three route pages: each guards, loads and gates, then hands over to the page itself.
import { SteamSpinner, useParams } from "@decky/ui";
import { ReactNode, useMemo } from "react";
import { State } from "../api";
import { useBackendState, useProgress } from "../state";
import { useGameData } from "./game/data";
import { C, Page } from "./kit";
import { Guard } from "./kit/guard";
import { needsSetup, SetupPage } from "./store/Setup";
import { Console } from "./store/ConsolePage";
import { StoreGame } from "./game/GamePage";
import { Store } from "./store/Discover";

function Message({ children }: { children: ReactNode }) {
  return <Page><div style={{ padding: "120px 38px", fontSize: 18, color: C.subtitle }}>{children}</div></Page>;
}

/** What to show instead of a page while the state is missing, unpaired or still loading; undefined when ready. */
function gate(state: State | undefined): ReactNode | undefined {
  if (!state) return <Page><SteamSpinner /></Page>;
  if (needsSetup(state)) return <SetupPage />;
  if (state.library.loading && !state.library.games.length) return <Page><SteamSpinner /></Page>;
  return undefined;
}

export function StorePage() {
  return <Guard what="the store"><StoreRoute /></Guard>;
}

function StoreRoute() {
  const state = useBackendState();
  const progress = useProgress();
  const waiting = gate(state);
  if (waiting || !state) return <>{waiting}</>;
  if (!state.library.games.length) return <Message>{state.library.error ? `Could not load the library: ${state.library.error}` : "No games on this RomM server yet."}</Message>;
  return <Store state={state} progress={progress} />;
}

export function GamePage() {
  const { rom_id } = useParams<{ rom_id: string }>();
  // Keyed so following "More like this" starts a fresh page at the top.
  return <Guard what="this game"><GameRoute key={rom_id} romId={Number(rom_id)} /></Guard>;
}

function GameRoute({ romId }: { romId: number }) {
  const { state, data } = useGameData(romId);
  const waiting = gate(state);
  if (waiting || !state) return <>{waiting}</>;
  if (!data) return <Message>This game is not in your RomM library any more.</Message>;
  return <StoreGame state={state} data={data} />;
}

export function ConsolePage() {
  const { platform_id } = useParams<{ platform_id: string }>();
  return <Guard what="this console"><ConsoleRoute key={platform_id} platformId={Number(platform_id)} /></Guard>;
}

function ConsoleRoute({ platformId }: { platformId: number }) {
  const state = useBackendState();
  const progress = useProgress();
  const all = state?.library.games;
  const games = useMemo(() => (all ? all.filter((g) => g.platform_id === platformId) : []), [all, platformId]);
  const waiting = gate(state);
  if (waiting || !state) return <>{waiting}</>;
  const platform = state.library.platforms.find((p) => p.id === platformId);
  if (!platform || !games.length) return <Message>{platform ? `No ${platform.name} games on your RomM server.` : "This console is not in your RomM library any more."}</Message>;
  return <Console state={state} platform={platform} games={games} progress={progress} />;
}
