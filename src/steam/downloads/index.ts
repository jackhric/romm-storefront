// Shows a plugin's own downloads on Steam's Downloads page. Everything that reaches into Steam goes through tweak():
// it checks the internal first, can always be undone, and leaves Steam as it was when anything is missing or throws.
import { Backend, wrapDownloadsClient } from "./client";
import { hasLaunchOnComplete, headerIsOurs, isOurs, retry, setLaunchOnComplete, startBridge, toOurIndex, withdraw } from "./coexist";
import { guardDownloadsPage } from "./guard";
import { trackedGame } from "../core/games";
import { isShortcutId } from "../core/steam";
import { installReloadGuard, Undo } from "../core/tweak";

export type { Backend } from "./client";
export type { OurDownload } from "./inject";
export type { Mode, Status } from "./coexist";
export { breakNextPush, getStatus, onStatus, retry, setDownloads, takeLaunchRequest } from "./coexist";
export { activeTweaks, restoreAll } from "../core/tweak";
export { ensureArt } from "../art";

/** Installs the bridge; feed it with setDownloads(). The undo (or restoreAll) puts Steam back as it was. */
export function installDownloadsBridge(backend: Backend, onCall?: (method: string, appid: number | undefined, ours: boolean) => void): Undo {
  installReloadGuard();
  const undos = [
    guardDownloadsPage(withdraw, retry),
    startBridge(),
    wrapDownloadsClient({
      // A stopped download is not listed on the Downloads page, but the library's Resume button still asks for it.
      isOurs: (appid) => isShortcutId(appid) && (isOurs(appid) || !!trackedGame(appid)),
      headerIsOurs,
      toOurIndex,
      setLaunchOnComplete,
      hasLaunchOnComplete,
      backend,
      onCall,
    }),
  ];
  return () => {
    for (const u of undos.reverse()) u();
  };
}
