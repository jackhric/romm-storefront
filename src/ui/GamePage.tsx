// The game detail page (/chickentender/game/:rom_id): a tall hero with the title and action row, then stacked
// sections (screenshots, about, details, similar games). Shared behaviour lives in ui/game/parts.tsx.
import { SteamSpinner, useParams } from "@decky/ui";
import { PageXbox as GameDetail } from "./game/PageXbox";
import { useGameData } from "./game/parts";
import { Guard, Page } from "./store/Page";
import { needsSetup, SetupPage } from "./store/Setup";
import { PAGE_X } from "./store/theme";

export function GamePage() {
  const { rom_id } = useParams<{ rom_id: string }>();
  return (
    <Guard what="this game">
      {/* Keyed so following "More like this" starts a fresh page at the top. */}
      <GameView key={rom_id} romId={Number(rom_id)} />
    </Guard>
  );
}

function GameView({ romId }: { romId: number }) {
  const { state, data } = useGameData(romId);
  if (!state) return <Page><SteamSpinner /></Page>;
  if (needsSetup(state)) return <SetupPage />;
  if (!data) {
    return (
      <Page>
        <div style={{ padding: `120px ${PAGE_X}px`, fontSize: 18 }}>{state.library.loading ? "Loading the library…" : "This game is not in your RomM library any more."}</div>
      </Page>
    );
  }
  return (
    <Page>
      <GameDetail data={data} />
    </Page>
  );
}
