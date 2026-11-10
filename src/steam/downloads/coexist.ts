import {
  ClientItems,
  DownloadItem,
  downloadsApi,
  downloadsStore,
  DownloadsStore,
  HistorySample,
  isHistory,
  isOverview,
  LOCAL_CLIENT,
  Overview,
} from "./internals";
import { buildItem, buildOverview, checkItem, checkOverview, clone, itemTemplate, nextHistory, OurDownload } from "./inject";
import { tweak, Undo, warnOnce } from "../core/tweak";

export type Mode = "off" | "idle" | "injecting" | "backed-off" | "withdrawn";
export type Status = {
  mode: Mode;
  detail: string;
  pushes: number;
  skips: number;
  last_skip?: string;
  steam_appid: number;
  template?: string;
};

const NAME = "downloads-bridge";

let store: DownloadsStore | undefined;
let steamItems: DownloadItem[] = [];
let steamOverview: Overview | undefined;
let ours: OurDownload[] = [];
const launchWhenDone = new Set<number>();
let inStore = new Set<number>();
let ownsHeader = false;
let history: HistorySample[] | undefined;
let headerSnapshot: Overview | undefined;
let lastItemsJson = "";
let lastStructure = "";
let withdrawn = false;
let breakNext = false;
const status: Status = { mode: "off", detail: "not started", pushes: 0, skips: 0, steam_appid: 0 };
const listeners = new Set<(s: Status) => void>();

function publish(mode: Mode, detail: string) {
  status.mode = mode;
  status.detail = detail;
  status.steam_appid = steamOverview?.update_appid ?? 0;
  for (const l of listeners) {
    try {
      l({ ...status });
    } catch {
      // a panel listener must not stop the bridge
    }
  }
}

function skip(reason: string) {
  status.skips++;
  status.last_skip = reason;
  warnOnce(`push skipped: ${reason}`, reason);
}

export function onStatus(l: (s: Status) => void): Undo {
  listeners.add(l);
  l({ ...status });
  return () => listeners.delete(l);
}

export function getStatus(): Status {
  return { ...status };
}

export const isOurs = (appid: number) => ours.some((d) => d.appid === Number(appid));

/** Steam's own download holds the header: an appid we do not own. */
function steamBusy() {
  const id = steamOverview?.update_appid ?? 0;
  return id !== 0 && !isOurs(id);
}

/** Steam's header pause/resume shows our download, or none at all while ours are pending. */
export function headerIsOurs() {
  return !!store && !steamBusy() && visible().some((d) => d.state !== "done");
}

export function toOurIndex(steamIndex: number) {
  return Math.max(0, steamIndex - (Math.max(-1, ...steamItems.map((i) => i.queue_index)) + 1));
}

/** Our downloads other than the ones Steam lists itself (its entry wins). */
function visible(): OurDownload[] {
  const steamIds = new Set(steamItems.map((i) => i.appid));
  return withdrawn ? [] : ours.filter((d) => !steamIds.has(d.appid));
}

/** What the store showed before we took the header: restored as is, so an undo leaves it exactly as it was. */
function storeSnapshot(): Overview | undefined {
  const o = store?.m_DownloadOverview.get(LOCAL_CLIENT);
  const h = store?.m_DownloadHistory.get(LOCAL_CLIENT);
  if (!isOverview(o, false) || !isHistory(h)) return undefined;
  const snap = clone(o);
  delete snap.history;
  return { ...snap, history: clone(h) };
}

function pushItems(force = false) {
  if (!store) return;
  const show = visible();
  if (!show.length && !inStore.size) return;
  const tpl = itemTemplate(store, new Set(ours.map((d) => d.appid)));
  if (show.length && !tpl) return skip("no valid item template");
  const base = Math.max(-1, ...steamItems.map((i) => i.queue_index)) + 1;
  const busy = steamBusy();
  const built = show.map((d) => {
    const item = buildItem(d, tpl!.item, base + d.queue_index);
    if (busy) item.active = false;
    return item;
  });
  for (const b of built) {
    const err = checkItem(b, tpl!.item);
    if (err) return skip(`${b.appid}: ${err}`);
  }
  if (breakNext && built.length) {
    (built[0] as any).update_type_info = [];
    breakNext = false;
  }
  const json = JSON.stringify(built);
  if (!force && json === lastItemsJson && [...inStore].every((id) => built.some((b) => b.appid === id))) return;
  const data: ClientItems = { remote_client_id: LOCAL_CLIENT, item_data: [...clone(steamItems), ...built] };
  // The page re-sorts its sections only on a full replace (the handler's first argument or a changed appid set),
  // so a change of order or state is sent as one.
  const structure = JSON.stringify(data.item_data.map((i) => [i.appid, i.queue_index, i.active, i.paused, i.completed]));
  store.OnDownloadItems(structure !== lastStructure, [data]);
  lastStructure = structure;
  lastItemsJson = json;
  inStore = new Set(built.map((b) => b.appid));
  status.pushes++;
  if (tpl) status.template = tpl.source;
}

/**
 * Our listener can run before the store's own handler of the same event (seen: Steam's idle overview overwrote
 * ours until the next tick), so check again once that handler has run.
 */
function afterSteam(check: () => void) {
  const run = () => {
    try {
      check();
    } catch (err) {
      warnOnce("verify", err);
    }
  };
  queueMicrotask(run);
  setTimeout(run, 0);
  setTimeout(run, 100);
}

/** After Steam's own handler replaced the list, ours may be gone; this runs after every handler of the same event. */
function verifyItems() {
  const list = store?.m_DownloadItems.get(LOCAL_CLIENT);
  if (!Array.isArray(list)) return;
  if ([...inStore].some((id) => !list.some((i) => i.appid === id))) pushItems(true);
}

function verifyOverview() {
  if (!ownsHeader) return;
  const cur = store?.m_DownloadOverview.get(LOCAL_CLIENT);
  const active = visible().find((d) => d.state === "downloading") ?? visible().find((d) => d.state === "paused");
  if (active && cur?.update_appid !== active.appid) {
    ownsHeader = false;
    pushOverview();
  }
}

function restoreOverview() {
  if (!store || !ownsHeader) return;
  ownsHeader = false;
  history = undefined;
  const snap = headerSnapshot;
  headerSnapshot = undefined;
  if (snap) store.OnDownloadOverview(clone(snap));
  else skip("no snapshot of Steam's overview to restore");
}

function pushOverview() {
  if (!store) return;
  if (steamBusy()) {
    ownsHeader = false;
    headerSnapshot = undefined;
    history = undefined;
    return publish("backed-off", `Steam is downloading ${steamOverview!.update_appid}; ours wait in the list`);
  }
  // Like Steam, the header keeps the first download while everything is paused, so its button can resume it.
  const active = visible().find((d) => d.state === "downloading") ?? visible().find((d) => d.state === "paused");
  if (!active) {
    restoreOverview();
    if (withdrawn) return publish("withdrawn", "entries withdrawn after the Downloads page failed; press Retry");
    return publish("idle", visible().length ? "nothing of ours is downloading" : "no downloads of ours");
  }
  const tpl = steamOverview ?? store.m_DownloadOverview.get(LOCAL_CLIENT);
  if (!isOverview(tpl, false)) return skip("no valid overview template");
  const snap = ownsHeader ? headerSnapshot : storeSnapshot();
  if (!snap) return skip("Steam's overview or history has an unexpected shape");
  const base = history ?? snap.history!;
  const next = nextHistory(base, active, Math.floor(Date.now() / 1000));
  const built = buildOverview(active, tpl, next);
  const err = checkOverview(built, tpl);
  if (err) return skip(`overview: ${err}`);
  store.OnDownloadOverview(built);
  history = next;
  headerSnapshot = snap;
  ownsHeader = true;
  status.pushes++;
  publish("injecting", `showing ${active.name} (${active.appid})${active.state === "paused" ? ", paused" : ""}`);
}

function sync() {
  try {
    pushItems();
    pushOverview();
  } catch (err) {
    warnOnce("sync", err);
    publish(status.mode, `error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** The backend's latest list; called every tick while anything downloads and on every change. */
export function setDownloads(list: OurDownload[]) {
  ours = (Array.isArray(list) ? list : []).map((d) => (launchWhenDone.has(d.appid) ? { ...d, launch_on_completion: true } : d));
  for (const appid of launchWhenDone) if (!ours.some((d) => d.appid === appid)) launchWhenDone.delete(appid);
  sync();
}

/** The page's "Launch when Complete" for one of ours; Steam allows one such app, so setting it clears the others. */
export function setLaunchOnComplete(appid: number | undefined, on: boolean) {
  launchWhenDone.clear();
  if (on && appid !== undefined && isOurs(appid)) launchWhenDone.add(Number(appid));
  ours = ours.map((d) => ({ ...d, launch_on_completion: launchWhenDone.has(d.appid) }));
  lastItemsJson = "";
  sync();
}

export function hasLaunchOnComplete() {
  return launchWhenDone.size > 0;
}

/** True once for a finished download whose "Launch when Complete" was set. */
export function takeLaunchRequest(appid: number) {
  return launchWhenDone.delete(Number(appid));
}

/** Test hook: the next item push carries a record that breaks the Downloads page, bypassing validation. */
export function breakNextPush() {
  breakNext = true;
  lastItemsJson = "";
  sync();
}

/** The Downloads page failed: take our entries out until Retry. */
export function withdraw() {
  if (withdrawn) return;
  withdrawn = true;
  breakNext = false;
  sync();
}

export function retry() {
  withdrawn = false;
  lastItemsJson = "";
  sync();
}

export function startBridge(): Undo {
  return tweak(NAME, (track) => {
    const s = downloadsStore();
    const api = downloadsApi();
    if (!s || !api) {
      publish("off", "Steam's downloadsStore or SteamClient.Downloads has an unexpected shape; nothing changed");
      return;
    }
    store = s;
    let firstItems = true;
    let firstOverview = true;
    track(() => {
      ours = [];
      launchWhenDone.clear();
      if (inStore.size && store) store.OnDownloadItems(false, [{ remote_client_id: LOCAL_CLIENT, item_data: clone(steamItems) }]);
      inStore = new Set();
      lastItemsJson = "";
      lastStructure = "";
      restoreOverview();
      store = undefined;
      steamOverview = undefined;
      steamItems = [];
      publish("off", "restored");
    });
    const items = api.RegisterForDownloadItems((_initial, clients) => {
      try {
        const local = Array.isArray(clients) ? clients.find((c) => c?.remote_client_id === LOCAL_CLIENT) : undefined;
        if (!local || !Array.isArray(local.item_data)) return;
        steamItems = clone(local.item_data);
        if (firstItems) {
          firstItems = false;
          // A previous instance that died without its undo may have left entries; Steam's replay is the truth.
          const now = store?.m_DownloadItems.get(LOCAL_CLIENT) ?? [];
          if (now.some((i) => !steamItems.some((x) => x.appid === i.appid))) {
            store?.OnDownloadItems(false, [{ remote_client_id: LOCAL_CLIENT, item_data: clone(steamItems) }]);
            publish(status.mode, "cleaned stale entries");
          }
        }
        if (inStore.size) {
          pushItems(true);
          afterSteam(verifyItems);
        }
      } catch (err) {
        warnOnce("items listener", err);
      }
    });
    track(() => items.unregister());
    const overview = api.RegisterForDownloadOverview((o) => {
      try {
        if (o?.remote_client_id !== LOCAL_CLIENT) return;
        const wasBusy = steamBusy();
        const h = isHistory(o.history) ? o.history : steamOverview?.history;
        steamOverview = { ...clone(o), ...(h && { history: clone(h) }) };
        // Steam's handler stored this overview, replacing ours if we had the header.
        ownsHeader = false;
        headerSnapshot = undefined;
        history = undefined;
        if (firstOverview) {
          firstOverview = false;
          const cur = store?.m_DownloadOverview.get(LOCAL_CLIENT);
          if (cur && cur.update_appid !== o.update_appid && h) store?.OnDownloadOverview(clone(steamOverview));
        }
        if (steamBusy() !== wasBusy) lastItemsJson = "";
        sync();
        afterSteam(verifyOverview);
      } catch (err) {
        warnOnce("overview listener", err);
      }
    });
    track(() => overview.unregister());
    publish("idle", "listening");
  });
}
