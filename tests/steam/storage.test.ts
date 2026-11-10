import { describe, expect, it, vi } from "vitest";
import { setGames } from "../../src/steam/core/games";
import { decorate, installInstalledDetails } from "../../src/steam/storage/details";
import { installStorageRows, withOurRows } from "../../src/steam/storage/rows";
import { copy, installed, OTHER_SHORTCUT, OURS, STEAM_APP, tracked, weOwn } from "./fixtures";

const steamRow = { nAppID: STEAM_APP, strAppName: "Skyrim", strSortAs: "skyrim", rtLastPlayed: 5, nUsedSize: 900, nAppSize: 800, nDLCSize: 100, nWorkshopSize: 0, nStagedSize: 0, nShaderSize: 0 };
const folders = () => [
  { nFolderIndex: 0, nPosixDeviceNumber: 58, bIsMounted: true, nUsedSize: 900, nAppSize: 800, strFolderPath: "/steam", vecApps: [{ ...steamRow }] },
  { nFolderIndex: 1, nPosixDeviceNumber: 77, bIsMounted: true, nUsedSize: 0, nAppSize: 0, strFolderPath: "/sd", vecApps: [] },
];
const overviewOf = (appid: number) => (appid === OURS ? { appid, display_name: "Ours", rt_last_time_played: 9 } : undefined);

describe("storage rows", () => {
  it("returns Steam's list untouched when we have nothing installed", () => {
    const list = folders();
    expect(withOurRows(list, [], overviewOf)).toBe(list);
    expect(list).toEqual(folders());
  });

  it("adds our row to the folder on the same drive and changes nothing else", () => {
    const list = folders();
    withOurRows(list, [installed()], overviewOf);
    expect(list[0].vecApps[0]).toEqual(steamRow);
    expect(list[0].vecApps[1]).toMatchObject({ nAppID: OURS, strAppName: "Ours", nUsedSize: 100, rtLastPlayed: 9 });
    expect([list[0].nUsedSize, list[0].nAppSize]).toEqual([1000, 900]);
    expect(list[1]).toEqual(folders()[1]);
  });

  it("adds nothing twice, nothing for a drive Steam does not list, and nothing without an app overview", () => {
    const list = folders();
    withOurRows(list, [installed()], overviewOf);
    const once = copy(list);
    withOurRows(list, [installed()], overviewOf);
    expect(list).toEqual(once);
    const other = folders();
    withOurRows(other, [installed({ device: 99 }), installed({ appid: OTHER_SHORTCUT })], overviewOf);
    expect(other).toEqual(folders());
  });

  it("gives back anything that is not a folder list as it came", () => {
    for (const odd of [undefined, null, "x", { vecApps: [] }]) expect(withOurRows(odd, [installed()], overviewOf)).toBe(odd);
    const broken = [{ nFolderIndex: 0 }, null];
    expect(withOurRows(broken, [installed()], overviewOf)).toEqual([{ nFolderIndex: 0 }, null]);
  });

  it("as a hook: Steam's answer passes through whole, and undo removes the hook", async () => {
    const original = vi.fn(async () => folders());
    const store = { m_InstallFolders: [] as any[], OnInstallFolderChanges: vi.fn(async () => {}) };
    Object.assign(globalThis, { SteamClient: { InstallFolder: { GetInstallFolders: original } }, installFolderStore: store, appStore: { GetAppOverviewByAppID: overviewOf } });
    const undo = installStorageRows();
    const api = (globalThis as any).SteamClient.InstallFolder;
    expect(await api.GetInstallFolders()).toEqual(folders());
    weOwn();
    expect((await api.GetInstallFolders())[0].vecApps.map((a: any) => a.nAppID)).toEqual([STEAM_APP, OURS]);
    undo();
    expect(api.GetInstallFolders).toBe(original);
    expect(await api.GetInstallFolders()).toEqual(folders());
  });
});

describe("installed details", () => {
  const details = () => ({ unAppID: 0, lDiskUsageBytes: 0, strInstallFolder: "", iInstallFolder: -1, other: "kept" });

  it("touches only the details of an installed game of ours", () => {
    weOwn([tracked({ appid: OTHER_SHORTCUT + 1, rom_id: 2, state: "downloading" })]);
    const mine = details();
    expect(decorate(OURS, mine, () => 0)).toBe(true);
    expect(mine).toEqual({ unAppID: 0, lDiskUsageBytes: 100, strInstallFolder: "/roms/psx", iInstallFolder: 0, other: "kept" });
    for (const appid of [STEAM_APP, OTHER_SHORTCUT, OTHER_SHORTCUT + 1]) {
      const d = details();
      expect(decorate(appid, d, () => 0)).toBe(false);
      expect(d).toEqual(details());
    }
    expect(decorate(OURS, { lDiskUsageBytes: "?" }, () => 0)).toBe(false);
  });

  it("as a hook: another app's callback reaches Steam as the very function it was", () => {
    const registered: Record<number, Function> = {};
    const original = (appid: number, cb: Function) => ((registered[appid] = cb), { unregister() {} });
    Object.assign(globalThis, { SteamClient: { Apps: { RegisterForAppDetails: original } } });
    weOwn();
    const undo = installInstalledDetails();
    const api = (globalThis as any).SteamClient.Apps;
    const theirs = vi.fn();
    api.RegisterForAppDetails(STEAM_APP, theirs);
    api.RegisterForAppDetails(OTHER_SHORTCUT, theirs);
    expect(registered[STEAM_APP]).toBe(theirs);
    expect(registered[OTHER_SHORTCUT]).toBe(theirs);

    const ours = vi.fn();
    api.RegisterForAppDetails(OURS, ours);
    const pushed = details();
    registered[OURS](pushed);
    expect(ours).toHaveBeenCalledWith(pushed);
    expect(pushed.lDiskUsageBytes).toBe(100);

    undo();
    expect(api.RegisterForAppDetails).toBe(original);
    const later = details();
    registered[OURS](later);  // a callback Steam still holds from before the undo
    expect(later).toEqual(details());
    setGames([], []);
  });
});
