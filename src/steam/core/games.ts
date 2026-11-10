// Which Steam apps are ours. Every hook asks here first, and a hook that gets "no" must leave Steam exactly as it
// found it. Two things have to hold for a "yes": the appid is in a non-Steam shortcut's range (so an app from the
// Steam store can never match, whatever this list holds), and the install ledger has a record for it.
import { isShortcutId } from "./steam";

/** A game with a record in the install ledger and a Steam shortcut, whatever its state. */
export type TrackedGame = { rom_id: number; appid: number; name: string; state: string; bytes_done: number; bytes_total: number };
/** A tracked game whose files are all on disk. */
export type InstalledGame = {
  rom_id: number;
  appid: number;
  name: string;
  path: string;
  /** The game's own folder, or the folder its single file is in. */
  folder: string;
  bytes: number;
  /** st_dev of the files, matched against a Steam library folder's nPosixDeviceNumber. */
  device: number;
};

let tracked = new Map<number, TrackedGame>();
let installed = new Map<number, InstalledGame>();
const listeners = new Set<() => void>();

const byAppid = <T extends { appid: number }>(list: T[]) => new Map(list.filter((g) => isShortcutId(g?.appid)).map((g) => [g.appid, g]));

export function trackedGame(appid: unknown): TrackedGame | undefined {
  return isShortcutId(appid) ? tracked.get(appid) : undefined;
}

export function installedGame(appid: unknown): InstalledGame | undefined {
  return isShortcutId(appid) && tracked.has(appid) ? installed.get(appid) : undefined;
}

export const trackedGames = () => [...tracked.values()];
export const installedGames = () => [...installed.values()].filter((g) => tracked.has(g.appid));

/** Replaces both lists with the backend's; hooks that keep Steam in step are told afterwards. */
export function setGames(nextTracked: TrackedGame[], nextInstalled: InstalledGame[]) {
  tracked = byAppid(nextTracked);
  installed = byAppid(nextInstalled);
  for (const l of [...listeners]) {
    try {
      l();
    } catch (err) {
      console.warn("[ChickenTender] games listener:", err);
    }
  }
}

export function onGames(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
