// The only place that reads Steam's download globals. Each accessor checks the shape it relies on and returns
// undefined otherwise, so a Steam update that renames something turns the feature off instead of breaking a page.
// Verified on Steam client 1792618285, SteamOS/Bazzite, Decky Loader 3.3.1 (2026-11-07).

export const LOCAL_CLIENT = "0";
// EAppUpdateProgress and EAppUpdateContentType.
export const PROGRESS_STEPS = 7;
export const PROGRESS_PREALLOCATING = 1;
export const PROGRESS_DOWNLOAD = 2;
export const PROGRESS_STAGING = 3;
export const PROGRESS_COMMITTING = 6;
export const CONTENT_TYPES = 3;

export type Progress = { bytes_in_progress: number; bytes_total: number; estimated_time_remaining_sec: number };
export type UpdateTypeInfo = {
  has_update: boolean;
  completed: boolean;
  progress: Progress[];
  overall_percent_complete: number;
  overall_estimated_time_remaining_sec: number;
};
export type DownloadItem = {
  appid: number;
  active: boolean;
  paused: boolean;
  completed: boolean;
  deferred_time: number;
  queue_index: number;
  update_result: number;
  update_error: string;
  completed_time: number;
  buildid: number;
  target_buildid: number;
  launch_on_completion: boolean;
  update_type_info: UpdateTypeInfo[];
  [k: string]: unknown;
};
export type HistorySample = {
  appid: number;
  rt_sample_time: number;
  disc_bytes_per_second: number;
  network_bytes_per_second: number;
  is_upload: boolean;
};
export type Overview = {
  remote_client_id: string;
  update_state: string;
  update_appid: number;
  update_network_bytes_per_second: number;
  update_disc_bytes_per_second: number;
  progress: Progress[];
  overall_percent_complete: number;
  overall_estimated_time_remaining_sec: number;
  paused: boolean;
  history?: HistorySample[];
  [k: string]: unknown;
};
export type ClientItems = { remote_client_id: string; item_data: DownloadItem[] };

type MapLike<V> = { get(k: string): V | undefined; has(k: string): boolean; set(k: string, v: V): unknown; values(): Iterable<V> };

export type DownloadsStore = {
  m_DownloadItems: MapLike<DownloadItem[]>;
  m_DownloadOverview: MapLike<Overview>;
  m_DownloadHistory: MapLike<HistorySample[]>;
  m_ulRemoteClientID: string;
  OnDownloadItems(initial: boolean, clients: ClientItems[]): void;
  OnDownloadOverview(o: Overview): void;
};

type Handle = { unregister(): void };
export type DownloadsApi = {
  RegisterForDownloadItems(cb: (initial: boolean, clients: ClientItems[]) => void): Handle;
  RegisterForDownloadOverview(cb: (o: Overview) => void): Handle;
  EnableAllDownloads(enable: boolean): void;
  ResumeAppUpdate(appid: number): void;
  PauseAppUpdate(appid: number): void;
  MoveAppUpdateUp(appid: number): void;
  MoveAppUpdateDown(appid: number): void;
  QueueAppUpdate(appid: number): void;
  SetQueueIndex(appid: number, index: number): void;
  RemoveFromDownloadList(appid: number): void;
  SetLaunchOnUpdateComplete(appid: number, launch: boolean): void;
};
export const API_METHODS = [
  "EnableAllDownloads",
  "ResumeAppUpdate",
  "PauseAppUpdate",
  "MoveAppUpdateUp",
  "MoveAppUpdateDown",
  "QueueAppUpdate",
  "SetQueueIndex",
  "RemoveFromDownloadList",
  "SetLaunchOnUpdateComplete",
] as const;

const isFn = (x: unknown) => typeof x === "function";
// MobX's ObservableMap is not a Map instance.
const isMapLike = (x: any) => !!x && isFn(x.get) && isFn(x.set) && isFn(x.has) && isFn(x.values);

export function downloadsStore(): DownloadsStore | undefined {
  const s = (window as any).downloadsStore;
  if (!s || !isFn(s.OnDownloadItems) || !isFn(s.OnDownloadOverview)) return undefined;
  if (!isMapLike(s.m_DownloadItems) || !isMapLike(s.m_DownloadOverview) || !isMapLike(s.m_DownloadHistory)) return undefined;
  if (typeof s.m_ulRemoteClientID !== "string") return undefined;
  return s;
}

export function downloadsApi(): DownloadsApi | undefined {
  const d = (window as any).SteamClient?.Downloads;
  if (!d || !isFn(d.RegisterForDownloadItems) || !isFn(d.RegisterForDownloadOverview)) return undefined;
  return API_METHODS.every((m) => isFn(d[m])) ? d : undefined;
}

export function appName(appid: number): string | undefined {
  try {
    const name = (window as any).appStore?.GetAppOverviewByAppID?.(appid)?.display_name;
    return typeof name === "string" ? name : undefined;
  } catch {
    return undefined;
  }
}

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isBool = (x: unknown) => typeof x === "boolean";

export function isProgress(p: any): p is Progress {
  return !!p && isNum(p.bytes_in_progress) && isNum(p.bytes_total) && isNum(p.estimated_time_remaining_sec);
}

function isProgressList(x: any) {
  return Array.isArray(x) && x.length === PROGRESS_STEPS && x.every(isProgress);
}

export function isItem(x: any): x is DownloadItem {
  if (!x || !isNum(x.appid) || !isNum(x.queue_index) || !isNum(x.deferred_time) || !isNum(x.completed_time)) return false;
  if (!isNum(x.buildid) || !isNum(x.target_buildid) || !isNum(x.update_result) || typeof x.update_error !== "string") return false;
  if (![x.active, x.paused, x.completed, x.launch_on_completion].every(isBool)) return false;
  const u = x.update_type_info;
  return (
    Array.isArray(u) &&
    u.length === CONTENT_TYPES &&
    u.every(
      (t: any) =>
        !!t && isBool(t.has_update) && isBool(t.completed) && isProgressList(t.progress) &&
        isNum(t.overall_percent_complete) && isNum(t.overall_estimated_time_remaining_sec),
    )
  );
}

export function isHistory(x: any): x is HistorySample[] {
  return (
    Array.isArray(x) &&
    x.length > 0 &&
    x.every((h) => !!h && isNum(h.appid) && isNum(h.rt_sample_time) && isNum(h.disc_bytes_per_second) && isNum(h.network_bytes_per_second))
  );
}

/** `history` is required: the speed graph reads `history.length`, and a missing one took the whole main window down. */
export function isOverview(x: any, needHistory: boolean): x is Overview {
  if (!x || typeof x.remote_client_id !== "string" || typeof x.update_state !== "string" || !isNum(x.update_appid)) return false;
  if (!isNum(x.update_network_bytes_per_second) || !isNum(x.update_disc_bytes_per_second) || !isBool(x.paused)) return false;
  if (!isProgressList(x.progress) || !isNum(x.overall_percent_complete) || !isNum(x.overall_estimated_time_remaining_sec)) return false;
  return !needHistory || isHistory(x.history);
}

// EAppAutoUpdateBehavior: 0 follows the client default, 1 "Update on Launch". Shortcuts are always 1, and
// SetAppAutoUpdateBehavior is ignored for them (tried 0 and 3 on Steam client 1792618285).
export const AUTO_UPDATE_DEFAULT = 0;
export const AUTO_UPDATE_ON_LAUNCH = 1;

type AppDetails = { unAppID: number; eAutoUpdateValue: number };
export type AppDetailsStore = {
  GetAppDetails(appid: number): AppDetails | undefined;
  RegisterForAppData(appid: number, cb: (d: AppDetails | undefined) => void): Handle;
};

export function appDetailsStore(): AppDetailsStore | undefined {
  const s = (window as any).appDetailsStore;
  return s && isFn(s.GetAppDetails) && isFn(s.RegisterForAppData) ? s : undefined;
}

// Steam's library writes { nVersion, logoPosition } through SteamClient.Apps.SetCustomLogoPositionForApp, checks
// pinnedPosition against UpperLeft/UpperCenter/CenterCenter/BottomCenter/BottomLeft and both percentages in 0-100,
// and its own default is { pinnedPosition: "BottomLeft", nWidthPct: 50, nHeightPct: 50 } (Steam client 1792618285).
// Without a saved position a custom logo is not drawn on a shortcut's page.
export type LogoPosition = { pinnedPosition: "UpperLeft" | "UpperCenter" | "CenterCenter" | "BottomCenter" | "BottomLeft"; nWidthPct: number; nHeightPct: number };
type AppOverview = { appid: number };
export type LogoPositionStore = {
  GetCustomLogoPosition(overview: AppOverview): LogoPosition | null | undefined;
  SaveCustomLogoPosition(overview: AppOverview, position: LogoPosition): Promise<unknown>;
  ClearCustomLogoPosition(overview: AppOverview): Promise<unknown>;
};

export function logoPositionStore(): LogoPositionStore | undefined {
  const s = (window as any).appDetailsStore;
  return s && isFn(s.GetCustomLogoPosition) && isFn(s.SaveCustomLogoPosition) && isFn(s.ClearCustomLogoPosition) ? s : undefined;
}
