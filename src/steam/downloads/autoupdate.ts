// The Downloads page labels an item "Update on Launch" and shows a paused or unqueued one as "updates disabled"
// instead of its progress whenever the app's eAutoUpdateValue is 1, which it always is for a shortcut. Steam ignores
// SetAppAutoUpdateBehavior for shortcuts, so while a download of ours is listed its details read the value a Steam
// game has by default; Steam's own details for the app replace the object on every change, so it is set again then.
import { appDetailsStore, AUTO_UPDATE_DEFAULT, AUTO_UPDATE_ON_LAUNCH } from "./internals";
import { tweak, Undo } from "../core/tweak";

const applied = new Map<number, Undo>();

function follow(appid: number): Undo {
  return tweak(`auto-update ${appid}`, (track) => {
    const store = appDetailsStore();
    if (!store) return;
    let changed = false;
    const apply = () => {
      const d = store.GetAppDetails(appid);
      if (d?.eAutoUpdateValue === AUTO_UPDATE_ON_LAUNCH) {
        d.eAutoUpdateValue = AUTO_UPDATE_DEFAULT;
        changed = true;
      }
    };
    const handle = store.RegisterForAppData(appid, apply);
    track(() => handle.unregister());
    track(() => {
      const d = store.GetAppDetails(appid);
      if (changed && d?.eAutoUpdateValue === AUTO_UPDATE_DEFAULT) d.eAutoUpdateValue = AUTO_UPDATE_ON_LAUNCH;
    });
    apply();
  });
}

/** Keeps the override on exactly these appids (our listed downloads). */
export function syncAutoUpdate(appids: number[]) {
  const want = new Set(appids.filter((a) => a > 0));
  for (const [appid, undo] of applied) {
    if (want.has(appid)) continue;
    applied.delete(appid);
    undo();
  }
  for (const appid of want) if (!applied.has(appid)) applied.set(appid, follow(appid));
}
