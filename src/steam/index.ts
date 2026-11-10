// Everything ChickenTender does to Steam itself, and the only module the rest of the app imports from here.
// README.md in this folder lists each hook, what it touches and what keeps it away from other games.
import { InstalledGame, setGames, TrackedGame } from "./core/games";
import { hookHealth } from "./core/intercept";
import { activeTweaks, installReloadGuard, restoreAll, Undo } from "./core/tweak";
import { Control, publishDownloads, publishProgress, startBridge } from "./downloads/bridge";
import { OurDownload } from "./downloads/inject";
import { installManageMenu } from "./library/menu";
import { installInstalledFilesPage } from "./library/properties";
import { installPlayButton, setDownloadProgress } from "./library/status";
import { installUninstallRouting } from "./library/uninstall";
import { installInstalledDetails } from "./storage/details";
import { installStorageRows } from "./storage/rows";

export { ensureArt, iconPng, setSgdbArt, SGDB_KINDS } from "./art";
export type { SgdbKind } from "./art";
export { launchIfRequested, publishDownloads, toastOutcome } from "./downloads/bridge";
export { NativeTabRow, playTabSound } from "./native";
export { addToCollection, clearDerivedArt, ensureShortcut, hasShortcut, removeShortcut, runShortcut, setCapsule, waitForOverview } from "./shortcuts";

export type SteamDeps = {
  /** Steam's Downloads buttons for one of our games: pause, resume, cancel, move ... */
  control: Control;
  /** Steam's Uninstall, confirmed, for one of our games. */
  uninstall(rom_id: number): unknown;
};

/** Installs every hook. The returned undo puts Steam back exactly as it was. */
export function installSteam(deps: SteamDeps): Undo {
  installReloadGuard();
  const undos = [
    startBridge(deps.control),
    installUninstallRouting((game) => deps.uninstall(game.rom_id)),
    installStorageRows(),
    installInstalledDetails(),
    installPlayButton(),
    installManageMenu(),
    installInstalledFilesPage(),
  ];
  return () => {
    for (const u of undos.reverse()) u();
    setGames([], []);
    restoreAll();
  };
}

export type SteamState = {
  downloads: (OurDownload & { rom_id: number })[];
  /** Every record of the install ledger. */
  installs: TrackedGame[];
  installed: InstalledGame[];
};

/** The backend's latest state; every hook follows it. */
export function syncSteam(s: SteamState) {
  setGames(s.installs, s.installed);
  publishDownloads(s.downloads);
}

export function steamProgress(p: { appid: number; done_bytes: number; total_bytes: number; bps: number; status: string }) {
  publishProgress(p);
  if (p.status === "downloading") setDownloadProgress(p.appid, p.done_bytes, p.total_bytes);
}

/** Which hooks are applied and whether any has failed: `__chickenTender.steam()` in the console. */
export const steamDiagnostics = () => ({ applied: activeTweaks(), hooks: hookHealth() });
