// The only place that reads Steam's globals. Every accessor checks the shape its callers rely on and returns
// undefined otherwise, so a Steam update that renames something turns a feature off instead of breaking a page.
import { findModuleExport } from "@decky/ui";

export const isFn = (x: unknown): x is Function => typeof x === "function";
export const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

const steam = () => window as any;

// Steam gives a non-Steam shortcut an appid with the top bit set; an app from the Steam store never has one.
const SHORTCUT_ID_MIN = 0x80000000;
const SHORTCUT_ID_MAX = 0xffffffff;
export const isShortcutId = (appid: unknown): appid is number =>
  typeof appid === "number" && Number.isInteger(appid) && appid >= SHORTCUT_ID_MIN && appid <= SHORTCUT_ID_MAX;

/** One namespace of SteamClient (Apps, Downloads, ...) when it has every method asked for. */
export function client(namespace: string, ...methods: string[]): any {
  const ns = steam().SteamClient?.[namespace];
  return ns && methods.every((m) => isFn(ns[m])) ? ns : undefined;
}

export type Overview = {
  appid: number;
  display_name?: string;
  sort_as?: string;
  rt_last_time_played?: number;
  m_gameid?: string;
  local_per_client_data?: { display_status: number; status_percentage: number };
  GetPerClientData?(client: string): { clientid?: string } | undefined;
};

/** Undefined until Steam's app list has loaded: before that a missing app means nothing. */
export function appsLoaded(): boolean {
  const store = steam().appStore;
  return store?.m_bIsInitialized === true && isFn(store.GetAppOverviewByAppID);
}

export function overview(appid: number): Overview | undefined {
  try {
    const o = steam().appStore?.GetAppOverviewByAppID?.(appid);
    return o && o.appid === appid ? o : undefined;
  } catch {
    return undefined;
  }
}

export type Folder = { nFolderIndex: number; nPosixDeviceNumber: number; bIsMounted?: boolean; nUsedSize: number; nAppSize: number; vecApps: any[] };
export const isFolder = (f: any): f is Folder =>
  !!f && isNum(f.nFolderIndex) && isNum(f.nPosixDeviceNumber) && isNum(f.nUsedSize) && isNum(f.nAppSize) && Array.isArray(f.vecApps);

export function folderStore(): { m_InstallFolders: Folder[]; OnInstallFolderChanges(): unknown } | undefined {
  const s = steam().installFolderStore;
  return s && isFn(s.OnInstallFolderChanges) && isFn(s.m_InstallFolders?.find) ? s : undefined;
}

/** The details Steam has loaded for an app, without asking it to load any. */
export function loadedDetails(appid: number): unknown {
  return steam().appDetailsStore?.m_mapAppData?.get?.(appid)?.details;
}

export function collectionStore(): any {
  const cs = steam().collectionStore;
  return cs && Array.isArray(cs.userCollections) ? cs : undefined;
}

export function localize(token: string, fallback: string): string {
  try {
    const s = steam().LocalizationManager?.LocalizeString?.(token);
    return typeof s === "string" && s && s !== token ? s : fallback;
  } catch {
    return fallback;
  }
}

/** A webpack export of Steam's found by what it is; undefined when Steam no longer has it. */
export function findExport(filter: (e: any) => boolean): any {
  try {
    return findModuleExport(filter);
  } catch {
    return undefined;
  }
}
