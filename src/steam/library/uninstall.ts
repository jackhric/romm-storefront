// Uninstalling one of our games the way a Steam game is uninstalled: Steam's own confirmation dialog, whose OK ends
// in SteamClient.Installs.OpenUninstallWizard. That call is taken to our backend for our games (in any state: an
// unfinished download is removed the same way) and goes to Steam untouched for everything else.
// Verified on Steam client 1792618285 (2026-11-09).
import { TrackedGame, trackedGame } from "../core/games";
import { guarded, intercept, PASS } from "../core/intercept";
import { client, findExport, isFn, overview } from "../core/steam";
import { Undo } from "../core/tweak";

const HOOK = "uninstall";

type ShowUninstall = (appids: number[], owner: Window, confirmPassword: boolean, client: string) => void;
let dialog: ShowUninstall | undefined | null = null;

/** Steam's ShowUninstallDialog, looked up once. */
function showUninstall(): ShowUninstall | undefined {
  if (dialog === null) dialog = findExport((e) => isFn(e) && String(e).includes("#UninstallDialog_Title") && String(e).includes("bNeverPopOut"));
  return dialog ?? undefined;
}

export const canAskUninstall = () => !!showUninstall();

const ownerWindow = (ev: any): Window =>
  ev?.view ?? ev?.currentTarget?.ownerDocument?.defaultView ?? ev?.target?.ownerDocument?.defaultView ?? window;

/** Opens Steam's uninstall confirmation for one of our games; does nothing for any other app. */
export function askUninstall(appid: number, ev?: unknown) {
  guarded(HOOK, () => {
    const show = showUninstall();
    const local = trackedGame(appid) ? overview(appid)?.GetPerClientData?.("local")?.clientid : undefined;
    if (show && typeof local === "string") show([appid], ownerWindow(ev), false, local);
  });
}

/** Splits an uninstall request into our games and the appids that stay Steam's. */
export function splitUninstall(appids: unknown): { mine: TrackedGame[]; rest: unknown[] } {
  if (!Array.isArray(appids)) return { mine: [], rest: [] };
  const mine = appids.map(trackedGame).filter((g): g is TrackedGame => !!g);
  return { mine, rest: appids.filter((a) => !trackedGame(a)) };
}

export function installUninstallRouting(uninstall: (game: TrackedGame) => unknown): Undo {
  return intercept(
    HOOK,
    client("Installs", "OpenUninstallWizard"),
    "OpenUninstallWizard",
    (args) => splitUninstall(args[0]).mine.length > 0,
    (args) => {
      const { mine, rest } = splitUninstall(args[0]);
      for (const g of mine) void Promise.resolve(uninstall(g)).catch((err) => console.warn("[ChickenTender] uninstall failed:", err));
      if (!rest.length) return undefined;
      args[0] = rest;
      return PASS;
    },
  );
}
