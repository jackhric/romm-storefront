// Shows a plugin's own downloads on Steam's Downloads page. Everything that reaches into Steam goes through tweak():
// it checks the internal first, can always be undone, and leaves Steam as it was when anything is missing or throws.
import { Backend, wrapDownloadsClient } from "./client";
import { hasLaunchOnComplete, headerIsOurs, isOurs, retry, setLaunchOnComplete, startBridge, toOurIndex, withdraw } from "./coexist";
import { guardDownloadsPage } from "./guard";
import { installReloadGuard, Undo } from "./tweak";

export type { Backend } from "./client";
export type { OurDownload } from "./inject";
export type { Mode, Status } from "./coexist";
export { breakNextPush, getStatus, onStatus, retry, setDownloads, takeLaunchRequest } from "./coexist";
export { activeTweaks, restoreAll } from "./tweak";
export { ensureArt } from "./art";

/** Installs the bridge; feed it with setDownloads(). The undo (or restoreAll) puts Steam back as it was. */
export function installDownloadsBridge(backend: Backend, onCall?: (method: string, appid: number | undefined, ours: boolean) => void): Undo {
  installReloadGuard();
  const undos = [
    guardDownloadsPage(withdraw, retry),
    startBridge(),
    wrapDownloadsClient({ isOurs, headerIsOurs, toOurIndex, setLaunchOnComplete, hasLaunchOnComplete, backend, onCall }),
  ];
  return () => {
    for (const u of undos.reverse()) u();
  };
}
