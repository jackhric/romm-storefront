// Steam library shortcuts for downloaded games, through SteamClient.Apps. Every call checks the internal first and
// returns 0/false instead of throwing, so the download flow works without a shortcut when Steam changes.
import { appsLoaded, client, collectionStore, overview as overviewOf } from "./core/steam";
import { tweak, warnOnce } from "./core/tweak";

type Apps = {
  AddShortcut(name: string, exe: string, startDir: string, launchOptions: string): Promise<number>;
  RemoveShortcut(appid: number): unknown;
  SetShortcutName(appid: number, name: string): unknown;
  SetShortcutExe(appid: number, exe: string): unknown;
  SetShortcutStartDir(appid: number, dir: string): unknown;
  SetShortcutLaunchOptions(appid: number, options: string): unknown;
  SetCustomArtworkForApp(appid: number, base64: string, format: string, type: number): unknown;
  SetShortcutIcon?(appid: number, path: string): unknown;
  RunGame?(gameid: string, launchOptions: string, unknown1: number, launchSource: number): unknown;
};

const GRID_PORTRAIT = 0;
const COLLECTION = "RomM";

function apps(): Apps | undefined {
  const a = client("Apps");
  const ok = ["AddShortcut", "RemoveShortcut", "SetShortcutName", "SetShortcutExe", "SetShortcutStartDir", "SetShortcutLaunchOptions"]
    .every((m) => typeof a?.[m] === "function");
  return ok ? a : undefined;
}

/** Whether Steam still has the shortcut; undefined until its app list has loaded (a missing overview means nothing before that). */
export function hasShortcut(appid: number): boolean | undefined {
  return appsLoaded() ? !!overviewOf(appid) : undefined;
}

/** Steam's own "Add a Non-Steam Game" quotes a path only when it needs it; quoting a plain one trips an assertion. */
const q = (path: string) => (/[\s"]/.test(path) ? `"${path.replace(/"/g, "")}"` : path);

export type LaunchTarget = {
  rom_id: number;
  name: string;
  appid: number;
  exe: string;
  start_dir: string;
  launch_options: string;
  cover: string;
  /** A square image file for the shortcut's icon. */
  icon?: string;
};

/** Creates (or updates) the shortcut for a game and returns its appid, 0 when Steam's API is not available. */
export async function ensureShortcut(t: LaunchTarget): Promise<number> {
  const a = apps();
  if (!a) return 0;
  try {
    let appid = t.appid;
    if (!appid || !overviewOf(appid)) {
      appid = Number(await a.AddShortcut(t.name, q(t.exe), q(t.start_dir), t.launch_options));
      if (!appid) return 0;
      // Steam reads the icon file into the app overview only when it first sends it, right after AddShortcut; set
      // on an existing shortcut, the icon shows after a Steam restart (Steam client 1792618285).
      if (t.icon) a.SetShortcutIcon?.(appid, t.icon);
    } else if (t.icon) {
      a.SetShortcutIcon?.(appid, t.icon);
    }
    a.SetShortcutName(appid, t.name);
    a.SetShortcutExe(appid, q(t.exe));
    a.SetShortcutStartDir(appid, q(t.start_dir));
    a.SetShortcutLaunchOptions(appid, t.launch_options);
    return appid;
  } catch (err) {
    warnOnce("shortcut", err);
    return 0;
  }
}

/** The app overview arrives a moment after AddShortcut; art and collections need it. */
export async function waitForOverview(appid: number, timeoutMs = 4000): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (overviewOf(appid)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

export function removeShortcut(appid: number): void {
  const a = apps();
  if (!a || !appid) return;
  try {
    const cs = collectionStore();
    const overview = overviewOf(appid);
    const col = cs?.userCollections?.find?.((c: any) => c?.displayName === COLLECTION);
    if (overview && typeof col?.AsDragDropCollection === "function") col.AsDragDropCollection().RemoveApps([overview]);
  } catch (err) {
    warnOnce("collection remove", err);
  }
  try {
    a.RemoveShortcut(appid);
  } catch (err) {
    warnOnce("shortcut remove", err);
  }
}

/** The RomM cover (fetched by the backend: the webview cannot read it cross-origin) as the library capsule. */
export async function setCapsule(appid: number, cover: { base64: string; format: string }): Promise<boolean> {
  const a = apps();
  if (!a || !appid || !cover.base64 || typeof a.SetCustomArtworkForApp !== "function") return false;
  try {
    // A capsule of the other format from an earlier run would otherwise shadow this one (Steam prefers .png).
    (a as any).ClearCustomArtworkForApp?.(appid, GRID_PORTRAIT);
    await a.SetCustomArtworkForApp(appid, cover.base64, cover.format, GRID_PORTRAIT);
    return true;
  } catch (err) {
    warnOnce("capsule art", err);
    return false;
  }
}

/** Clears the hero and wide slots (or the given ones) so art.ts derives them from the capsule again. */
export function clearDerivedArt(appid: number, types: number[] = [1, 3]): void {
  const a = client("Apps");
  if (typeof a?.ClearCustomArtworkForApp !== "function") return;
  for (const type of types) {
    try {
      a.ClearCustomArtworkForApp(appid, type);
    } catch (err) {
      warnOnce("clear art", err);
    }
  }
}

/** Puts the app in the "RomM" collection, creating it the way Steam's own UI does; skipped when the store differs. */
export function addToCollection(appid: number): void {
  tweak("collection", () => {
    const cs = collectionStore();
    const overview = overviewOf(appid);
    if (!cs || !overview || !Array.isArray(cs.userCollections)) return;
    let col = cs.userCollections.find((c: any) => c?.displayName === COLLECTION);
    if (!col) {
      if (typeof cs.NewUnsavedCollection !== "function") return;
      col = cs.NewUnsavedCollection(COLLECTION, undefined, [overview]);
      if (typeof col?.Save !== "function") return;
      void col.Save();
      return;
    }
    const dd = col.AsDragDropCollection?.();
    if (typeof dd?.AddApps !== "function") return;
    dd.AddApps([overview]);
  });
}

/** Starts the shortcut the way the library's Play button does. */
export function runShortcut(appid: number): void {
  const a = apps();
  const gameid = overviewOf(appid)?.m_gameid;
  if (!a || typeof a.RunGame !== "function" || typeof gameid !== "string") return;
  try {
    a.RunGame(gameid, "", -1, 100);
  } catch (err) {
    warnOnce("launch when complete", err);
  }
}
