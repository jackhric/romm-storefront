// Actions that touch both the backend and Steam (api.ts stays Steam-free).
import { removeGame, State } from "./api";
import { publishDownloads, removeShortcut } from "./steam";

/** Deletes the files and the Steam shortcut of a downloaded game. */
export async function removeFromDevice(rom_id: number): Promise<State> {
  const s = await removeGame(rom_id);
  // The Downloads page reads each item's app overview, so the item must be gone before the shortcut is.
  publishDownloads(s.downloads.items);
  removeShortcut(s.removed);
  return s;
}
