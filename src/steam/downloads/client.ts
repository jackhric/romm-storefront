import { API_METHODS, downloadsApi } from "./internals";
import { intercept } from "../core/intercept";
import { Undo } from "../core/tweak";

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
 * Takes SteamClient.Downloads' calls for our appids to our backend (Steam returns undefined and does nothing for a
 * shortcut appid); a call about anything else reaches Steam as it was made.
 */
export function wrapDownloadsClient(hooks: ClientHooks): Undo {
  const api = downloadsApi();
  if (!api) return () => {};
  const undos = API_METHODS.map((method) =>
    intercept(
      `downloads ${method}`,
      api,
      method,
      (args) => {
        if (method === "EnableAllDownloads") {
          // Steam's header pause is "pause all"; while it shows our download it pauses only ours.
          const mine = hooks.headerIsOurs();
          hooks.onCall?.(method, undefined, mine);
          return mine;
        }
        const appid = Number(args[0]);
        const mine = hooks.isOurs(appid);
        hooks.onCall?.(method, appid, mine);
        // Steam's menu clears the flag with an invalid appid (0), and setting another app replaces ours.
        if (method === "SetLaunchOnUpdateComplete" && !mine && hooks.hasLaunchOnComplete()) hooks.setLaunchOnComplete(undefined, false);
        return mine;
      },
      (args) => {
        const b = hooks.backend;
        const appid = Number(args[0]);
        switch (method) {
          case "EnableAllDownloads":
            void (args[0] ? b.resumeAll() : b.pauseAll());
            break;
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
      },
    ),
  );
  return () => {
    for (const u of undos.reverse()) u();
  };
}
