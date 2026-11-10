// Wires the Downloads page bridge to the backend: our downloads appear next to Steam's and the page's buttons act
// on them. Pure glue; the bridge itself (coexist/inject/client/guard) is the tested module from downloads-poc.
import { overview } from "../core/steam";
import { toaster } from "@decky/api";
import { syncAutoUpdate } from "./autoupdate";
import { Backend, installDownloadsBridge, OurDownload, setDownloads, takeLaunchRequest } from ".";
import { runShortcut } from "../shortcuts";
import { Undo } from "../core/tweak";

export type Control = (action: string, appid: number, value: number) => Promise<unknown>;

export function startBridge(control: Control): Undo {
  const backend: Backend = {
    pause: (appid) => control("pause", appid, 0),
    resume: (appid) => control("resume", appid, 0),
    cancel: (appid) => control("cancel", appid, 0),
    pauseAll: () => control("pause_all", 0, 0),
    resumeAll: () => control("resume_all", 0, 0),
    move: (appid, delta) => control("move", appid, delta),
    moveTo: (appid, index) => control("move_to", appid, index),
  };
  return installDownloadsBridge(backend);
}

let all: OurDownload[] = [];
let last: OurDownload[] = [];
const finished = new Set<string>();

// Only items Steam knows as apps: the Downloads page dereferences each item's overview, and a brand-new
// shortcut's overview arrives a moment after the download starts.
const known = (appid: number) => !!overview(appid);

function push() {
  last = all.filter((d) => d.appid > 0 && known(d.appid));
  setDownloads(last);
  syncAutoUpdate(last.map((d) => d.appid));
}

/** Called once a finished game's shortcut is final: honours the page's "Launch when Complete". */
export function launchIfRequested(appid: number) {
  if (appid && takeLaunchRequest(appid)) runShortcut(appid);
}

/** Feeds the bridge with the backend's download list; only items with a shortcut appid can be shown. */
export function publishDownloads(items: (OurDownload & { rom_id: number })[]) {
  all = items;
  push();
}

/** Applies a progress event to the active item without waiting for the next full snapshot. */
export function publishProgress(p: { appid: number; done_bytes: number; total_bytes: number; bps: number; status: string }) {
  if (!p.appid) return;
  const d = all.find((x) => x.appid === p.appid);
  if (!d || p.status !== "downloading") return;
  d.bytes_done = p.done_bytes;
  d.bytes_total = p.total_bytes || d.bytes_total;
  d.rate = p.bps;
  d.eta = p.bps > 0 ? Math.round((d.bytes_total - d.bytes_done) / p.bps) : -1;
  d.state = "downloading";
  push();
}

export function toastOutcome(p: { rom_id: number; status: string; error: string }, name: string) {
  const key = `${p.rom_id}:${p.status}`;
  if (finished.has(key) || (p.status !== "done" && p.status !== "failed")) return;
  finished.add(key);
  try {
    toaster.toast({ title: name, body: p.status === "done" ? "Ready to play" : `Download failed: ${p.error}` });
  } catch {
    // a toast is never worth an error
  }
}
