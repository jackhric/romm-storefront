// Steam's details for a shortcut say it takes no space and lives nowhere. For our installed games they carry the
// real size and folder. Steam replaces the details object on every native update, so the fields are set on each
// one as it arrives; the callback of any other app is handed to Steam as it came.
// Verified on Steam client 1792618285 (2026-11-09).
import { installedGame, installedGames, onGames, trackedGame } from "../core/games";
import { guarded, intercept, PASS } from "../core/intercept";
import { client, folderStore, isFn, isNum, loadedDetails } from "../core/steam";
import { Undo } from "../core/tweak";

const HOOK = "installed-details";
const NO_FOLDER = -1;

type Details = { lDiskUsageBytes: number; strInstallFolder: string; iInstallFolder: number };
const isDetails = (d: any): d is Details => !!d && isNum(d.lDiskUsageBytes) && typeof d.strInstallFolder === "string" && isNum(d.iInstallFolder);

/** Sets the three fields when `appid` is an installed game of ours and `d` is a details object; otherwise nothing. */
export function decorate(appid: number, d: unknown, folderIndex: (device: number) => number = folderIndexOf): boolean {
  const g = installedGame(appid);
  if (!g || !isDetails(d)) return false;
  d.lDiskUsageBytes = g.bytes;
  d.strInstallFolder = g.folder;
  d.iInstallFolder = folderIndex(g.device);
  return true;
}

function folderIndexOf(device: number): number {
  return folderStore()?.m_InstallFolders.find((f) => f?.nPosixDeviceNumber === device)?.nFolderIndex ?? NO_FOLDER;
}

function clear(d: unknown) {
  if (!isDetails(d)) return;
  d.lDiskUsageBytes = 0;
  d.strInstallFolder = "";
  d.iInstallFolder = NO_FOLDER;
}

export function installInstalledDetails(): Undo {
  const api = client("Apps", "RegisterForAppDetails");
  if (!api) return () => {};
  let active = true;
  const decorated = new Set<number>();
  const apply = (appid: number, d: unknown) => {
    if (guarded(HOOK, () => decorate(appid, d))) decorated.add(appid);
  };
  const applyLoaded = () => {
    for (const g of installedGames()) apply(g.appid, loadedDetails(g.appid));
  };
  const undo = intercept(
    HOOK,
    api,
    "RegisterForAppDetails",
    // A game still downloading is wrapped too: it becomes installed without Steam registering again.
    (args) => !!trackedGame(args[0]) && isFn(args[1]),
    (args) => {
      const [appid, cb] = args;
      args[1] = (d: unknown, ...rest: unknown[]) => {
        if (active) apply(appid, d);
        return cb(d, ...rest);
      };
      return PASS;
    },
  );
  const offGames = onGames(applyLoaded);
  applyLoaded();
  return () => {
    active = false;
    offGames();
    undo();
    for (const appid of decorated) guarded(HOOK, () => clear(loadedDetails(appid)));
  };
}
