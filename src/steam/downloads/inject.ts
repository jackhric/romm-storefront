import {
  CONTENT_TYPES,
  DownloadItem,
  DownloadsStore,
  HistorySample,
  isHistory,
  isItem,
  isOverview,
  LOCAL_CLIENT,
  Overview,
  Progress,
  PROGRESS_COMMITTING,
  PROGRESS_DOWNLOAD,
  PROGRESS_PREALLOCATING,
  PROGRESS_STAGING,
  PROGRESS_STEPS,
} from "./internals";

/** One of our downloads, as the backend reports it. */
export type OurDownload = {
  appid: number;
  name: string;
  bytes_total: number;
  bytes_done: number;
  rate: number;
  eta: number;
  state: "downloading" | "paused" | "queued" | "done";
  queue_index: number;
  completed_at: number;
  started_at: number;
  /** Set from the page's "Launch when Complete"; the bridge launches the game when it finishes. */
  launch_on_completion?: boolean;
};

const idle = (): Progress => ({ bytes_in_progress: 0, bytes_total: 0, estimated_time_remaining_sec: -1 });
const step = (done: number, total: number, eta: number): Progress => ({
  bytes_in_progress: done,
  bytes_total: total,
  estimated_time_remaining_sec: eta,
});

// Captured once from a real item on this device and zeroed; used only when Steam holds no item to clone.
const CAPTURED_ITEM: DownloadItem = {
  appid: 0,
  active: false,
  paused: false,
  completed: false,
  deferred_time: 0,
  queue_index: -1,
  update_result: 0,
  update_error: "",
  completed_time: 0,
  buildid: 0,
  target_buildid: 0,
  launch_on_completion: false,
  update_type_info: Array.from({ length: CONTENT_TYPES }, () => ({
    has_update: false,
    completed: false,
    progress: Array.from({ length: PROGRESS_STEPS }, idle),
    overall_percent_complete: 0,
    overall_estimated_time_remaining_sec: -1,
  })),
};

export const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** Same keys and value types, recursively; arrays the same length. */
export function sameShape(a: unknown, b: unknown, path = "$"): string | undefined {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return `${path}: array mismatch`;
    if (a.length !== b.length) return `${path}: length ${a.length} != ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const r = sameShape(a[i], b[i], `${path}[${i}]`);
      if (r) return r;
    }
    return undefined;
  }
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    if (typeof a !== typeof b || (a === null) !== (b === null)) return `${path}: ${typeof a} != ${typeof b}`;
    if (typeof a === "number" && !Number.isFinite(a)) return `${path}: not finite`;
    return undefined;
  }
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.join() !== kb.join()) return `${path}: keys differ`;
  for (const k of ka) {
    const r = sameShape((a as any)[k], (b as any)[k], `${path}.${k}`);
    if (r) return r;
  }
  return undefined;
}

// Steam sends these on items that are downloading; queued rows read them for "N% complete".
function withOverall(item: DownloadItem): DownloadItem {
  return { overall_percent_complete: 0, overall_estimated_time_remaining_sec: -1, ...item };
}

/** A live real item from any client (never ours), else the captured one. */
export function itemTemplate(store: DownloadsStore, ours: Set<number>): { item: DownloadItem; source: string } | undefined {
  for (const list of store.m_DownloadItems.values()) {
    const found = Array.isArray(list) ? list.find((i) => !ours.has(i?.appid) && isItem(i)) : undefined;
    if (found) return { item: withOverall(clone(found)), source: "live" };
  }
  return isItem(CAPTURED_ITEM) ? { item: withOverall(clone(CAPTURED_ITEM)), source: "captured" } : undefined;
}

function progressFor(d: OurDownload): Progress[] {
  const p = Array.from({ length: PROGRESS_STEPS }, idle);
  if (d.state === "done") {
    // What Steam reports for a finished update: every step it went through complete, with no time left.
    for (const s of p) s.estimated_time_remaining_sec = 0;
    for (const s of [PROGRESS_PREALLOCATING, PROGRESS_DOWNLOAD, PROGRESS_STAGING, PROGRESS_COMMITTING]) {
      p[s] = step(d.bytes_total, d.bytes_total, 0);
    }
    return p;
  }
  const eta = d.state === "downloading" ? d.eta : -1;
  p[PROGRESS_PREALLOCATING] = step(d.bytes_total, d.bytes_total, 0);
  p[PROGRESS_DOWNLOAD] = step(d.bytes_done, d.bytes_total, eta);
  p[PROGRESS_STAGING] = step(d.bytes_done, d.bytes_total, eta);
  return p;
}

const percent = (d: OurDownload) => Math.floor((10000 * d.bytes_done) / Math.max(1, d.bytes_total)) / 100;

export function buildItem(d: OurDownload, tpl: DownloadItem, queueIndex: number): DownloadItem {
  const item = clone(tpl);
  const done = d.state === "done";
  Object.assign(item, {
    appid: d.appid,
    active: d.state === "downloading",
    paused: d.state === "paused",
    completed: done,
    deferred_time: 0,
    queue_index: done ? -1 : queueIndex,
    update_result: 0,
    update_error: "",
    completed_time: done ? d.completed_at : 0,
    // buildid 0 keeps a completed entry out of Steam's persisted "recently completed" list.
    buildid: 0,
    target_buildid: 0,
    launch_on_completion: !done && !!d.launch_on_completion,
    overall_percent_complete: percent(d),
    overall_estimated_time_remaining_sec: d.state === "downloading" ? d.eta : -1,
  });
  item.update_type_info = item.update_type_info.map((t, i) => {
    const content = i === 0;
    return {
      ...t,
      has_update: content,
      completed: content && done,
      progress: content ? progressFor(d) : Array.from({ length: PROGRESS_STEPS }, idle),
      overall_percent_complete: content ? percent(d) : 0,
      overall_estimated_time_remaining_sec: content && d.state === "downloading" ? d.eta : content && done ? 0 : -1,
    };
  });
  return item;
}

/** Steam keeps one sample per second; progress arrives more often, so a sample in the same second is replaced. */
export function nextHistory(history: HistorySample[], d: OurDownload | undefined, now: number): HistorySample[] {
  const tpl = history[history.length - 1];
  const sample = {
    ...tpl,
    appid: d?.appid ?? 0,
    rt_sample_time: now,
    disc_bytes_per_second: d?.rate ?? 0,
    network_bytes_per_second: d?.rate ?? 0,
    is_upload: false,
  };
  if (tpl.rt_sample_time === now && tpl.appid === sample.appid) return [...history.slice(0, -1), sample];
  return [...history.slice(1), sample];
}

export function buildOverview(d: OurDownload, tpl: Overview, history: HistorySample[]): Overview {
  const o = clone({ ...tpl, history: undefined });
  delete o.history;
  return {
    ...o,
    remote_client_id: LOCAL_CLIENT,
    update_state: d.state === "downloading" ? "Downloading" : "None",
    update_appid: d.appid,
    update_network_bytes_per_second: d.state === "downloading" ? d.rate : 0,
    update_disc_bytes_per_second: d.state === "downloading" ? d.rate : 0,
    // The header's "Peak" reads this; Steam's idle overview still carries the peak of its own last download.
    ...("update_peak_network_bytes_per_second" in o && {
      update_peak_network_bytes_per_second: Math.max(0, ...history.filter((h) => h.appid === d.appid).map((h) => h.network_bytes_per_second)),
    }),
    progress: progressFor(d),
    overall_percent_complete: percent(d),
    overall_estimated_time_remaining_sec: d.state === "downloading" ? d.eta : -1,
    paused: d.state === "paused",
    ...("update_start_time" in o && { update_start_time: d.started_at }),
    ...("update_is_install" in o && { update_is_install: true }),
    history: clone(history),
  };
}

export function checkItem(built: DownloadItem, tpl: DownloadItem): string | undefined {
  if (!isItem(built)) return "item failed the shape check";
  if (built.buildid !== 0) return "item buildid must be 0";
  return sameShape(built, tpl, "item");
}

export function checkOverview(built: Overview, tpl: Overview): string | undefined {
  if (!isOverview(built, true)) return "overview failed the shape check (history missing?)";
  if (!isHistory(built.history)) return "history invalid";
  const { history: _h, ...a } = built;
  const { history: _t, ...b } = tpl;
  return sameShape(a, b, "overview");
}
