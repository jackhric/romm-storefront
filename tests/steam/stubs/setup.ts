import { beforeEach } from "vitest";
import { setGames } from "../../../src/steam/core/games";
import { resetHookHealth } from "../../../src/steam/core/intercept";
import { restoreAll } from "../../../src/steam/core/tweak";

(globalThis as any).window = globalThis;

beforeEach(() => {
  restoreAll();
  resetHookHealth();
  setGames([], []);
  for (const k of ["SteamClient", "appStore", "appDetailsStore", "installFolderStore", "__steamExports"]) delete (globalThis as any)[k];
});
