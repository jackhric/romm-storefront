import { callOriginal, replacePatch } from "@decky/ui";
import { API_METHODS, downloadsApi } from "./internals";
import { tweak, Undo, warnOnce } from "./tweak";

export type Backend = {
  pause(appid: number): unknown;
  resume(appid: number): unknown;
  cancel(appid: number): unknown;
  pauseAll(): unknown;
  resumeAll(): unknown;
  move(appid: number, delta: number): unknown;
  moveTo(appid: number, index: number): unknown;
};

export type ClientHooks = {
  isOurs(appid: number): boolean;
  /** Whether the header pause/resume acts on our downloads: true unless Steam's own download holds the header. */
  headerIsOurs(): boolean;
  backend: Backend;
  /** Steam's queue index to a position in our own queue (ours follow Steam's). */
  toOurIndex(steamIndex: number): number;
  /** "Launch when Complete": `appid` is one of ours to set, or anything else to clear ours. */
  setLaunchOnComplete(appid: number | undefined, on: boolean): void;
  hasLaunchOnComplete(): boolean;
  onCall?(method: string, appid: number | undefined, ours: boolean): void;
};

/**
 * Wraps SteamClient.Downloads so the Downloads page's buttons reach our backend for our appids (Steam returns
 * undefined and does nothing for a shortcut appid) and pass straight through for everything else.
 */
export function wrapDownloadsClient(hooks: ClientHooks): Undo {
  return tweak("downloads-client", (track) => {
    const api = downloadsApi();
    if (!api) return;
    for (const method of API_METHODS) {
      const patch = replacePatch(api, method, (args: any[]) => {
        try {
          if (method === "EnableAllDownloads") {
            // Steam's header pause is "pause all"; while it shows our download it pauses only ours.
            const mine = hooks.headerIsOurs();
            hooks.onCall?.(method, undefined, mine);
            if (!mine) return callOriginal;
            void (args[0] ? hooks.backend.resumeAll() : hooks.backend.pauseAll());
            return undefined;
          }
          const appid = Number(args[0]);
          const mine = hooks.isOurs(appid);
          hooks.onCall?.(method, appid, mine);
          // Steam's menu clears the flag with an invalid appid (0), and setting another app replaces ours.
          if (method === "SetLaunchOnUpdateComplete" && !mine && hooks.hasLaunchOnComplete()) hooks.setLaunchOnComplete(undefined, false);
          if (!mine) return callOriginal;
          const b = hooks.backend;
          switch (method) {
            case "PauseAppUpdate":
              void b.pause(appid);
              break;
            case "ResumeAppUpdate":
            case "QueueAppUpdate":
              void b.resume(appid);
              break;
            case "RemoveFromDownloadList":
              void b.cancel(appid);
              break;
            case "MoveAppUpdateUp":
              void b.move(appid, -1);
              break;
            case "MoveAppUpdateDown":
              void b.move(appid, 1);
              break;
            case "SetQueueIndex":
              void b.moveTo(appid, hooks.toOurIndex(Number(args[1])));
              break;
            case "SetLaunchOnUpdateComplete":
              hooks.setLaunchOnComplete(appid, true);
              break;
          }
          return undefined;
        } catch (err) {
          warnOnce(`client ${method}`, err);
          return callOriginal;
        }
      });
      track(() => patch.unpatch());
    }
  });
}
