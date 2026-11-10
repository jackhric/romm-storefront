// The library's Play button, its label and its capsule overlay follow an app's display status, which for a shortcut
// is always "ready to launch". While one of our games is not fully installed its status says so instead, so Steam
// draws Pause or Resume (which call SteamClient.Downloads, where downloads/client.ts takes them to our backend)
// rather than Play. Only the overviews of our own games are written to, and only between the states listed here.
// Verified on Steam client 1792618285 (2026-11-10).
import { onGames, trackedGame, trackedGames } from "../core/games";
import { guarded } from "../core/intercept";
import { client, overview } from "../core/steam";
import { tweak, Undo } from "../core/tweak";

const HOOK = "play-button";

// EDisplayStatus
export const DOWNLOADING = 7;
export const READY_TO_LAUNCH = 11;
export const DOWNLOAD_PAUSED = 22;
export const DOWNLOAD_QUEUED = 23;
const OURS = new Set([DOWNLOADING, DOWNLOAD_PAUSED, DOWNLOAD_QUEUED]);

const STATUS: Record<string, number | undefined> = {
  downloading: DOWNLOADING,
  queued: DOWNLOAD_QUEUED,
  paused: DOWNLOAD_PAUSED,
  incomplete: DOWNLOAD_PAUSED,
  failed: DOWNLOAD_PAUSED,
};

type PerClient = { display_status: number; status_percentage: number };
type Wanted = { status: number; percent: number };

const percent = (done: number, total: number) => (total > 0 ? Math.max(0, Math.min(100, Math.floor((100 * done) / total))) : 0);

/** What a game's status should read, or undefined for "as Steam has it" (installed, or not ours). */
export function wantedStatus(appid: number, live?: Wanted): Wanted | undefined {
  const g = trackedGame(appid);
  if (!g) return undefined;
  if (live && STATUS[g.state] !== undefined) return live;
  const status = STATUS[g.state];
  return status === undefined ? undefined : { status, percent: percent(g.bytes_done, g.bytes_total) };
}

/**
 * Brings one per-client record in line with `want`. Steam's own passing states (launching, running) are never
 * overwritten, and a record is only put back to "ready" when it still holds a value we set.
 */
export function applyStatus(data: PerClient | undefined, want: Wanted | undefined, wasOurs: boolean): boolean {
  if (!data || typeof data.display_status !== "number" || typeof data.status_percentage !== "number") return wasOurs;
  if (want) {
    if (data.display_status !== READY_TO_LAUNCH && !OURS.has(data.display_status)) return wasOurs;
    if (data.display_status !== want.status) data.display_status = want.status;
    if (data.status_percentage !== want.percent) data.status_percentage = want.percent;
    return true;
  }
  if (wasOurs && OURS.has(data.display_status)) {
    data.display_status = READY_TO_LAUNCH;
    data.status_percentage = 100;
  }
  return false;
}

const touched = new Set<number>();
const live = new Map<number, Wanted>();
let active = false;

function apply(appid: number) {
  guarded(HOOK, () => {
    const want = active ? wantedStatus(appid, live.get(appid)) : undefined;
    if (applyStatus(overview(appid)?.local_per_client_data, want, touched.has(appid))) touched.add(appid);
    else touched.delete(appid);
  });
}

function applyAll() {
  for (const appid of new Set([...trackedGames().map((g) => g.appid), ...touched])) apply(appid);
}

/** A progress event: the game is downloading now, whatever the last full state said. */
export function setDownloadProgress(appid: number, done: number, total: number) {
  if (!active || !trackedGame(appid)) return;
  live.set(appid, { status: DOWNLOADING, percent: percent(done, total) });
  apply(appid);
}

export function installPlayButton(): Undo {
  return tweak(HOOK, () => {
    const apps = client("Apps", "RegisterForAppOverviewChanges");
    if (!apps) return;
    active = true;
    // Steam replaces an app's overview whenever it changes; ours is set again once the store has taken the new one.
    const handle = apps.RegisterForAppOverviewChanges(() => setTimeout(applyAll, 0));
    const offGames = onGames(() => {
      live.clear();
      applyAll();
    });
    applyAll();
    return () => {
      handle?.unregister?.();
      offGames();
      active = false;
      live.clear();
      applyAll();
    };
  });
}
