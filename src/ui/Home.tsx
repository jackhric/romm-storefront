import { ButtonItem, Field, Navigation, PanelSection, PanelSectionRow, ProgressBarWithInfo, TextField } from "@decky/ui";
import { useEffect, useState } from "react";
import { clearSgdbKey, disconnect, STORE_ROUTE, setRomsDir, State } from "../api";
import { formatSize, useProgress } from "../state";

export function Home({ state }: { state: State }) {
  const progress = useProgress();
  const active = state.downloads.active ? progress[state.downloads.active.rom_id] ?? state.downloads.active : undefined;
  const activeGame = active && state.library.games.find((g) => g.rom_id === active.rom_id);
  const { games, platforms, loading, error } = state.library;
  const installed = games.filter((g) => g.status === "installed").length;
  const [romsDir, setDir] = useState(state.downloads.roms_dir);
  useEffect(() => setDir(state.downloads.roms_dir), [state.downloads.roms_dir]);

  return (
    <>
      <PanelSection title="Library">
        <PanelSectionRow>
          <ButtonItem
            layout="below"
            disabled={games.length === 0}
            description={error ? error : loading && games.length === 0 ? "Loading the library…" : `${games.length} games on ${platforms.length} platforms, ${installed} on this Deck`}
            onClick={() => {
              Navigation.Navigate(STORE_ROUTE);
              Navigation.CloseSideMenus();
            }}
          >
            Browse games
          </ButtonItem>
        </PanelSectionRow>
        {active && activeGame && (
          <PanelSectionRow>
            <ProgressBarWithInfo
              label={activeGame.name}
              nProgress={active.total_bytes ? (100 * active.done_bytes) / active.total_bytes : 0}
              sOperationText={`${formatSize(active.done_bytes)} of ${formatSize(active.total_bytes)}`}
              sTimeRemaining={active.bps ? `${formatSize(active.bps)}/s` : ""}
            />
          </PanelSectionRow>
        )}
        {state.downloads.queue.length > 0 && (
          <PanelSectionRow>
            <Field description={`${state.downloads.queue.length} more queued`} />
          </PanelSectionRow>
        )}
      </PanelSection>
      <PanelSection title="Settings">
        <PanelSectionRow>
          <TextField label="ROM folder" value={romsDir} onChange={(e) => setDir(e.target.value)}
            description={!state.roms_dir_exists ? "This folder does not exist."
              : state.retrodeck.installed ? `RetroDECK ${state.retrodeck.version}${state.retrodeck.initialised ? "" : " (not set up yet: run it once)"}; one subfolder per system.`
              : "RetroDECK is not installed; games download here but cannot be launched yet."} />
        </PanelSectionRow>
        {romsDir !== state.downloads.roms_dir && (
          <PanelSectionRow>
            <ButtonItem layout="below" onClick={() => setRomsDir(romsDir)}>Save folder</ButtonItem>
          </PanelSectionRow>
        )}
        <PanelSectionRow>
          <ButtonItem
            label="SteamGridDB"
            description={state.sgdb.art_total ? `Connected · artwork for ${state.sgdb.art_ready} of ${state.sgdb.art_total} games` : "Connected"}
            onClick={() => clearSgdbKey()}
          >
            Change key
          </ButtonItem>
        </PanelSectionRow>
        <PanelSectionRow>
          <Field label={state.server.url.replace(/^https?:\/\//, "")} description={`${state.account.username || "signed in"} · RomM ${state.server.version || "?"} · this Deck is "${state.account.device_name}"`} />
        </PanelSectionRow>
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={() => disconnect()}>Disconnect</ButtonItem>
        </PanelSectionRow>
      </PanelSection>
    </>
  );
}
