import { Navigation, PanelSection, PanelSectionRow, Spinner, staticClasses } from "@decky/ui";
import { definePlugin, routerHook } from "@decky/api";
import { FaDrumstickBite } from "react-icons/fa";
import { ArtBytes, artBase64, coverBase64, download, downloadControl, GameArt, gameArt, getState, launchTarget, onProgress, onState, saveIcon, setDownloadPreparation, setShortcut, State, STORE_ROUTE, GAME_ROUTE, CONSOLE_ROUTE } from "./api";
import { removeFromDevice } from "./actions";
import { useBackendState } from "./state";
import {
  addToCollection, clearDerivedArt, ensureArt, ensureShortcut, hasShortcut, iconPng, installSteam, launchIfRequested, publishDownloads,
  setCapsule, setSgdbArt, SGDB_KINDS, SgdbKind, steamDiagnostics, steamProgress, syncSteam, toastOutcome, waitForOverview,
} from "./steam";
import { Connect } from "./ui/panel/Connect";
import { Home } from "./ui/panel/Home";
import { SgdbKey } from "./ui/panel/SgdbKey";
import { ConsolePage, GamePage, StorePage } from "./ui/routes";

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

// A game in the queue or installed needs its shortcut (the Downloads page and the library show it through one).
const NEEDS_SHORTCUT = new Set(["queued", "downloading", "paused", "installed"]);
// A new shortcut's overview arrives a moment after it is recorded; only one still missing after this is gone.
const SHORTCUT_SETTLE_MS = 5000;
const MAX_REPAIRS = 2;

/** Brings Steam's shortcuts back in line with the install ledger: recreates a missing one, forgets a stale appid. */
function shortcutRepair(latest: () => State | undefined) {
  const tries = new Map<number, number>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  const run = async () => {
    timer = undefined;
    if (running) return;
    running = true;
    try {
      for (const i of latest()?.installs ?? []) {
        const present = i.appid ? hasShortcut(i.appid) : false;
        if (present !== false || (tries.get(i.rom_id) ?? 0) >= MAX_REPAIRS) continue;
        tries.set(i.rom_id, (tries.get(i.rom_id) ?? 0) + 1);
        if (NEEDS_SHORTCUT.has(i.state)) await prepareShortcut(i.rom_id).catch(() => 0);
        else if (i.appid) await setShortcut(i.rom_id, 0).catch(() => undefined);
      }
    } finally {
      running = false;
    }
  };
  return {
    check() {
      if (timer === undefined) timer = setTimeout(() => void run(), SHORTCUT_SETTLE_MS);
    },
    stop() {
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}

export default definePlugin(() => {
  routerHook.addRoute(STORE_ROUTE, StorePage, { exact: true });
  routerHook.addRoute(GAME_ROUTE, GamePage, { exact: true });
  routerHook.addRoute(CONSOLE_ROUTE, ConsolePage, { exact: true });
  setDownloadPreparation(prepareShortcut);
  let latest: State | undefined;
  const stopSteam = installSteam({
    control: (action, appid, value) => downloadControl(action, appid, value),
    uninstall: (rom_id) => removeFromDevice(rom_id),
  });
  const repair = shortcutRepair(() => latest);
  const follow = (s: State) => {
    latest = s;
    syncSteam({ downloads: s.downloads.items, installs: s.installs ?? [], installed: s.installed ?? [] });
    repair.check();
  };
  const offState = onState((s) => {
    // Signed in through Steam's browser: leave it for the store rather than the SteamGridDB page.
    if (latest?.sgdb.signin?.active && !latest.sgdb.configured && s.sgdb.configured) {
      Navigation.Navigate(STORE_ROUTE);
      Navigation.CloseSideMenus();
    }
    follow(s);
  });
  const offProgress = onProgress((p) => {
    steamProgress(p);
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
      follow(s);
      // The Downloads rows show the wide art, which the previous instance's undo cleared.
      for (const d of s.downloads.items) if (d.appid) ensureArt(d.appid, d.name);
    })
    .catch(() => {});
  // Test hook for the Decky Toolkit (cef_evaluate): the same calls the UI makes.
  // publish feeds the Downloads page a made-up list (e.g. a download held at 40%) until the next backend event.
  (window as any).__chickenTender = { download, remove: removeFromDevice, getState, publish: publishDownloads, steam: steamDiagnostics };
  return {
    name: "ChickenTender",
    titleView: <div className={staticClasses.Title}>ChickenTender</div>,
    content: <Content />,
    icon: <FaDrumstickBite />,
    onDismount() {
      delete (window as any).__chickenTender;
      repair.stop();
      stopSteam();
      offState();
      offProgress();
      routerHook.removeRoute(STORE_ROUTE);
      routerHook.removeRoute(GAME_ROUTE);
      routerHook.removeRoute(CONSOLE_ROUTE);
    },
  };
});
