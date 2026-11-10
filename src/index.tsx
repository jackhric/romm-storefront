import { Navigation, PanelSection, PanelSectionRow, Spinner, staticClasses } from "@decky/ui";
import { definePlugin, routerHook } from "@decky/api";
import { FaDrumstickBite } from "react-icons/fa";
import { ArtBytes, artBase64, coverBase64, download, downloadControl, GameArt, gameArt, getState, launchTarget, onProgress, onState, saveIcon, setDownloadPreparation, setShortcut, State, STORE_ROUTE, GAME_ROUTE, CONSOLE_ROUTE } from "./api";
import { removeFromDeck } from "./actions";
import { useBackendState } from "./state";
import { launchIfRequested, publishDownloads, publishProgress, startBridge, toastOutcome } from "./steam/bridge";
import { ensureArt, iconPng, SGDB_KINDS, SgdbKind, setSgdbArt } from "./steam/art";
import { addToCollection, clearDerivedArt, ensureShortcut, setCapsule, waitForOverview } from "./steam/shortcuts";
import { restoreAll } from "./steam/tweak";
import { Connect } from "./ui/Connect";
import { Home } from "./ui/Home";
import { SgdbKey } from "./ui/SgdbKey";
import { StorePage } from "./ui/Store";
import { GamePage } from "./ui/GamePage";
import { ConsolePage } from "./ui/ConsolePage";

function Content() {
  const state = useBackendState();
  if (!state) {
    return (
      <PanelSection>
        <PanelSectionRow><Spinner style={{ width: 24, height: 24 }} /></PanelSectionRow>
      </PanelSection>
    );
  }
  if (!state.account.paired) return <Connect state={state} />;
  return state.sgdb?.configured ? <Home state={state} /> : <SgdbKey state={state} />;
}

const NO_ART: ArtBytes = { base64: "", format: "" };
const HERO = 1;
const WIDE = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** SteamGridDB can be slow; the download must not wait on it for long. */
const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, sleep(ms).then(() => undefined)]).catch(() => undefined);

/** The SteamGridDB images of a game the backend has; every kind is asked for when its art is not known. */
async function sgdbImages(rom_id: number, art: GameArt | undefined): Promise<Partial<Record<SgdbKind, ArtBytes>>> {
  const kinds = SGDB_KINDS.filter((k) => !art || art[k]);
  const got = await Promise.all(kinds.map((k) => artBase64(rom_id, k).catch(() => NO_ART)));
  return Object.fromEntries(kinds.map((k, i) => [k, got[i]]));
}

/** A Steam shortcut (with art, in the RomM collection) for a game about to download; 0 when Steam says no. */
async function prepareShortcut(rom_id: number): Promise<number> {
  const t = await launchTarget(rom_id);
  const art = await within(gameArt(rom_id), 5000);
  const cover = await coverBase64(rom_id).catch(() => NO_ART);
  const sgdbIcon = art?.icon ? (await within(artBase64(rom_id, "icon"), 5000)) ?? NO_ART : NO_ART;
  // The icon file must exist before the shortcut does: Steam reads it only into the shortcut's first app overview.
  const png = sgdbIcon.format === "png" && sgdbIcon.base64 ? Promise.resolve(sgdbIcon.base64) : iconPng(t.name, cover);
  const icon = await png.then((b64) => saveIcon(rom_id, b64)).catch(() => "");
  const appid = await ensureShortcut({ ...t, icon });
  if (!appid) return 0;
  if (appid !== t.appid) await setShortcut(rom_id, appid);
  void (async () => {
    if (!(await waitForOverview(appid))) return;
    addToCollection(appid);
    const sgdb = await setSgdbArt(appid, await sgdbImages(rom_id, art));
    const ok = sgdb.has("grid") || (await setCapsule(appid, cover));
    if (ok || sgdb.size) {
      // A gradient from an earlier run must not shadow the real art.
      clearDerivedArt(appid, [...(sgdb.has("hero") ? [] : [HERO]), ...(sgdb.has("wide") ? [] : [WIDE])]);
      await sleep(1500); // Steam writes the grid files after the call returns
    }
    await ensureArt(appid, t.name);
  })();
  return appid;
}

export default definePlugin(() => {
  routerHook.addRoute(STORE_ROUTE, StorePage, { exact: true });
  routerHook.addRoute(GAME_ROUTE, GamePage, { exact: true });
  routerHook.addRoute(CONSOLE_ROUTE, ConsolePage, { exact: true });
  setDownloadPreparation(prepareShortcut);
  let latest: State | undefined;
  const stopBridge = startBridge((action, appid, value) => downloadControl(action, appid, value));
  const offState = onState((s) => {
    // Signed in through Steam's browser: leave it for the store rather than the SteamGridDB page.
    if (latest?.sgdb.signin?.active && !latest.sgdb.configured && s.sgdb.configured) {
      Navigation.Navigate(STORE_ROUTE);
      Navigation.CloseSideMenus();
    }
    latest = s;
    publishDownloads(s.downloads.items);
  });
  const offProgress = onProgress((p) => {
    publishProgress(p);
    toastOutcome(p, latest?.library.games.find((g) => g.rom_id === p.rom_id)?.name ?? "ChickenTender");
    // A multi-file game's launch file is only known once it is on disk.
    if (p.status === "done" && p.appid) {
      void launchTarget(p.rom_id)
        .then(ensureShortcut)
        .finally(() => launchIfRequested(p.appid));
    }
  });
  getState()
    .then((s) => {
      latest = s;
      publishDownloads(s.downloads.items);
      // The Downloads rows show the wide art, which the previous instance's undo cleared.
      for (const d of s.downloads.items) if (d.appid) ensureArt(d.appid, d.name);
    })
    .catch(() => {});
  // Test hook for the Decky Toolkit (cef_evaluate): the same calls the UI makes.
  // publish feeds the Downloads page a made-up list (e.g. a download held at 40%) until the next backend event.
  (window as any).__chickenTender = { download, remove: removeFromDeck, getState, publish: publishDownloads };
  return {
    name: "ChickenTender",
    titleView: <div className={staticClasses.Title}>ChickenTender</div>,
    content: <Content />,
    icon: <FaDrumstickBite />,
    onDismount() {
      delete (window as any).__chickenTender;
      restoreAll();
      stopBridge();
      offState();
      offProgress();
      routerHook.removeRoute(STORE_ROUTE);
      routerHook.removeRoute(GAME_ROUTE);
      routerHook.removeRoute(CONSOLE_ROUTE);
    },
  };
});
