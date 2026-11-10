// Settings > Storage lists our installed games: one row each, on the library folder that shares the files' drive,
// with their bytes counted in that folder's totals (the usage bar draws "Non-Steam" as what the totals leave over).
// Steam's own rows and every other folder are returned as Steam made them.
// Verified on Steam client 1792618285 (2026-11-09).
import { InstalledGame, installedGames, onGames } from "../core/games";
import { adjustResult, guarded } from "../core/intercept";
import { client, Folder, folderStore, isFolder, isNum, Overview, overview } from "../core/steam";
import { Undo } from "../core/tweak";

const HOOK = "storage-rows";

function row(g: InstalledGame, o: Overview) {
  const name = typeof o.display_name === "string" ? o.display_name : g.name;
  return {
    nAppID: g.appid,
    strAppName: name,
    strSortAs: typeof o.sort_as === "string" ? o.sort_as : name,
    rtLastPlayed: isNum(o.rt_last_time_played) ? o.rt_last_time_played : 0,
    nUsedSize: g.bytes,
    nAppSize: g.bytes,
    nDLCSize: 0,
    nWorkshopSize: 0,
    nStagedSize: 0,
    nShaderSize: 0,
  };
}

/**
 * Steam's folder list with our rows added. What to add is worked out first and applied last, so a failure part-way
 * leaves the list as Steam returned it.
 */
export function withOurRows(folders: unknown, games: InstalledGame[], overviewOf: (appid: number) => Overview | undefined): unknown {
  if (!Array.isArray(folders) || !games.length) return folders;
  const additions = new Map<Folder, ReturnType<typeof row>[]>();
  for (const g of games) {
    if (!isNum(g.bytes) || g.bytes < 0) continue;
    const folder = folders.find((f) => isFolder(f) && f.bIsMounted !== false && f.nPosixDeviceNumber === g.device);
    const o = overviewOf(g.appid);
    if (!folder || !o || folder.vecApps.some((a: any) => a?.nAppID === g.appid)) continue;
    additions.set(folder, [...(additions.get(folder) ?? []), row(g, o)]);
  }
  for (const [folder, rows] of additions) {
    const bytes = rows.reduce((n, r) => n + r.nUsedSize, 0);
    folder.vecApps.push(...rows);
    folder.nUsedSize += bytes;
    folder.nAppSize += bytes;
  }
  return folders;
}

function refresh() {
  guarded(HOOK, () => void Promise.resolve(folderStore()?.OnInstallFolderChanges()).catch(() => {}));
}

export function installStorageRows(): Undo {
  const api = client("InstallFolder", "GetInstallFolders");
  if (!api || !folderStore()) return () => {};
  const undo = adjustResult(HOOK, api, "GetInstallFolders", (_args, result) =>
    Promise.resolve(result).then((folders) => guarded(HOOK, () => withOurRows(folders, installedGames(), overview)) ?? folders),
  );
  const offGames = onGames(refresh);
  refresh();
  return () => {
    offGames();
    undo();
    refresh();
  };
}
