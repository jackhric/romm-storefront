import { InstalledGame, setGames, TrackedGame } from "../../src/steam/core/games";

/** A shortcut ChickenTender made. */
export const OURS = 0x90000001;
/** A non-Steam shortcut the user added themselves. */
export const OTHER_SHORTCUT = 0x90000002;
/** An app from the Steam store. */
export const STEAM_APP = 489830;

export const tracked = (over: Partial<TrackedGame> = {}): TrackedGame => ({ rom_id: 1, appid: OURS, name: "Ours", state: "installed", bytes_done: 100, bytes_total: 100, ...over });
export const installed = (over: Partial<InstalledGame> = {}): InstalledGame => ({ rom_id: 1, appid: OURS, name: "Ours", path: "/roms/psx/ours.chd", folder: "/roms/psx", bytes: 100, device: 58, ...over });

/** One installed game of ours, plus whatever else is listed. */
export function weOwn(extraTracked: TrackedGame[] = [], extraInstalled: InstalledGame[] = []) {
  setGames([tracked(), ...extraTracked], [installed(), ...extraInstalled]);
}

export const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));
