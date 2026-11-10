import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { applyRoutePatches } from "./stubs/decky-api";
import { setGames } from "../../src/steam/core/games";
import { wrapDownloadsClient } from "../../src/steam/downloads/client";
import { API_METHODS } from "../../src/steam/downloads/internals";
import { withUninstall } from "../../src/steam/library/menu";
import { installInstalledFilesPage, withInstalledFiles } from "../../src/steam/library/properties";
import { applyStatus, DOWNLOAD_PAUSED, DOWNLOADING, installPlayButton, READY_TO_LAUNCH, setDownloadProgress, wantedStatus } from "../../src/steam/library/status";
import { installUninstallRouting, splitUninstall } from "../../src/steam/library/uninstall";
import { OTHER_SHORTCUT, OURS, STEAM_APP, tracked, weOwn } from "./fixtures";

describe("uninstall routing", () => {
  const steam = () => {
    const original = vi.fn();
    Object.assign(globalThis, { SteamClient: { Installs: { OpenUninstallWizard: original } } });
    const uninstall = vi.fn();
    const undo = installUninstallRouting(uninstall);
    return { original, uninstall, undo, api: (globalThis as any).SteamClient.Installs };
  };

  it("leaves an uninstall of other apps to Steam, with the list it was given", () => {
    weOwn();
    const { original, uninstall, api } = steam();
    const theirs = [STEAM_APP, OTHER_SHORTCUT];
    api.OpenUninstallWizard(theirs, "0", true);
    expect(original).toHaveBeenCalledWith(theirs, "0", true);
    expect(original.mock.calls[0][0]).toBe(theirs);
    expect(uninstall).not.toHaveBeenCalled();
  });

  it("takes ours to the backend and sends Steam only what is Steam's", () => {
    weOwn();
    const { original, uninstall, api, undo } = steam();
    api.OpenUninstallWizard([OURS], "0", true);
    expect(uninstall).toHaveBeenCalledTimes(1);
    expect(original).not.toHaveBeenCalled();
    api.OpenUninstallWizard([STEAM_APP, OURS], "0", true);
    expect(original).toHaveBeenCalledWith([STEAM_APP], "0", true);
    undo();
    expect(api.OpenUninstallWizard).toBe(original);
  });

  it("covers a game in any state, and survives odd arguments", () => {
    setGames([tracked({ state: "paused" })], []);
    expect(splitUninstall([OURS, STEAM_APP]).mine.map((g) => g.appid)).toEqual([OURS]);
    for (const odd of [undefined, null, OURS, "x", {}]) expect(splitUninstall(odd)).toEqual({ mine: [], rest: [] });
  });
});

describe("downloads calls", () => {
  it("reach Steam for other apps and our backend for ours", () => {
    const originals = Object.fromEntries(API_METHODS.map((m) => [m, vi.fn(() => `steam ${m}`)]));
    Object.assign(globalThis, { SteamClient: { Downloads: { ...originals, RegisterForDownloadItems: vi.fn(), RegisterForDownloadOverview: vi.fn() } } });
    const backend = { pause: vi.fn(), resume: vi.fn(), cancel: vi.fn(), pauseAll: vi.fn(), resumeAll: vi.fn(), move: vi.fn(), moveTo: vi.fn() };
    const undo = wrapDownloadsClient({
      isOurs: (appid) => appid === OURS, headerIsOurs: () => false, backend, toOurIndex: (i) => i, setLaunchOnComplete: vi.fn(), hasLaunchOnComplete: () => false,
    });
    const api = (globalThis as any).SteamClient.Downloads;
    for (const m of API_METHODS) expect(api[m](STEAM_APP, "0")).toBe(`steam ${m}`);
    for (const m of API_METHODS) expect(originals[m]).toHaveBeenCalledWith(STEAM_APP, "0");
    expect(Object.values(backend).some((f) => f.mock.calls.length)).toBe(false);

    api.PauseAppUpdate(OURS, "0");
    api.ResumeAppUpdate(OURS, "0");
    expect(backend.pause).toHaveBeenCalledWith(OURS);
    expect(backend.resume).toHaveBeenCalledWith(OURS);
    expect(originals.PauseAppUpdate).toHaveBeenCalledTimes(1);
    undo();
    for (const m of API_METHODS) expect(api[m]).toBe(originals[m]);
  });
});

describe("play button status", () => {
  it("is only wanted for a game of ours that is not installed", () => {
    setGames([tracked({ state: "paused", bytes_done: 25 }), tracked({ appid: OURS + 5, rom_id: 2, state: "installed" })], []);
    expect(wantedStatus(OURS)).toEqual({ status: DOWNLOAD_PAUSED, percent: 25 });
    expect([OURS + 5, OTHER_SHORTCUT, STEAM_APP].map((a) => wantedStatus(a))).toEqual([undefined, undefined, undefined]);
  });

  it("never overwrites Steam's passing states and only puts back what it set", () => {
    const running = { display_status: 4, status_percentage: 100 };
    expect(applyStatus(running, { status: DOWNLOADING, percent: 5 }, false)).toBe(false);
    expect(running).toEqual({ display_status: 4, status_percentage: 100 });
    const ready = { display_status: READY_TO_LAUNCH, status_percentage: 100 };
    expect(applyStatus(ready, undefined, false)).toBe(false);
    expect(ready.display_status).toBe(READY_TO_LAUNCH);
    expect(applyStatus(ready, { status: DOWNLOADING, percent: 5 }, false)).toBe(true);
    expect(applyStatus(ready, undefined, true)).toBe(false);
    expect(ready).toEqual({ display_status: READY_TO_LAUNCH, status_percentage: 100 });
  });

  it("as a hook: writes to our overview only, follows progress, and restores on undo", () => {
    const data = (appid: number) => ({ appid, local_per_client_data: { display_status: READY_TO_LAUNCH, status_percentage: 100 } });
    const overviews: Record<number, ReturnType<typeof data>> = { [OURS]: data(OURS), [OTHER_SHORTCUT]: data(OTHER_SHORTCUT), [STEAM_APP]: data(STEAM_APP) };
    const unregister = vi.fn();
    Object.assign(globalThis, {
      appStore: { GetAppOverviewByAppID: (a: number) => overviews[a] },
      SteamClient: { Apps: { RegisterForAppOverviewChanges: () => ({ unregister }) } },
    });
    const undo = installPlayButton();
    setGames([tracked({ state: "paused", bytes_done: 40 })], []);
    expect(overviews[OURS].local_per_client_data).toEqual({ display_status: DOWNLOAD_PAUSED, status_percentage: 40 });
    setDownloadProgress(OURS, 60, 100);
    setDownloadProgress(STEAM_APP, 60, 100);
    setDownloadProgress(OTHER_SHORTCUT, 60, 100);
    expect(overviews[OURS].local_per_client_data).toEqual({ display_status: DOWNLOADING, status_percentage: 60 });
    expect(overviews[STEAM_APP]).toEqual(data(STEAM_APP));
    expect(overviews[OTHER_SHORTCUT]).toEqual(data(OTHER_SHORTCUT));
    undo();
    expect(overviews[OURS]).toEqual(data(OURS));
    expect(unregister).toHaveBeenCalled();
  });
});

describe("manage menu", () => {
  const Item = "MenuItem";
  const menu = () => createElement("Submenu", { label: "Manage" }, [
    createElement(Item, { key: "Hide" }, "Hide this game"),
    createElement(Item, { key: "RemoveShortcut" }, "Remove non-Steam game from your library"),
  ]);
  const app = (appid: number) => ({ appid });

  it("is left alone for any app that is not ours, and for a selection of several", () => {
    weOwn();
    const m = menu();
    expect(withUninstall([app(STEAM_APP)], m, "Uninstall", vi.fn())).toBeUndefined();
    expect(withUninstall([app(OTHER_SHORTCUT)], m, "Uninstall", vi.fn())).toBeUndefined();
    expect(withUninstall([app(OURS), app(STEAM_APP)], m, "Uninstall", vi.fn())).toBeUndefined();
    expect(withUninstall(undefined, m, "Uninstall", vi.fn())).toBeUndefined();
    expect(withUninstall([app(OURS)], createElement("Submenu", null, createElement(Item, { key: "Hide" })), "Uninstall", vi.fn())).toBeUndefined();
  });

  it("swaps only the remove-shortcut entry for Uninstall on ours, in any state", () => {
    setGames([tracked({ state: "downloading" })], []);
    const m = menu();
    const onUninstall = vi.fn();
    const out = withUninstall([app(OURS)], m, "Uninstall", onUninstall)!;
    const [before, after] = [(m.props as any).children, (out.props as any).children];
    expect(after[0]).toBe(before[0]);
    expect(after.map((c: any) => [c.key, c.props.children])).toEqual([["Hide", "Hide this game"], ["Uninstall", "Uninstall"]]);
    after[1].props.onSelected("event");
    expect(onUninstall).toHaveBeenCalledWith(OURS, "event");
  });
});

describe("properties pages", () => {
  const page = (name: string) => ({ title: name, route: `/app/:appid/properties/${name}`, link: `/app/1/properties/${name}`, content: name });
  const Pages = (props: { appId: number }) => createElement("Sidebar", { title: "Game", pages: [page("shortcut"), page("controller")], appId: props.appId });
  const Outer = (props: { appId: number }) => createElement("div", null, createElement(Pages, { appId: props.appId }));
  // What React does with a tree of plain function components, without their state.
  const render = (el: any): any => (typeof el?.type === "function" ? render(el.type(el.props)) : el?.props?.children?.type ? { ...el, props: { ...el.props, children: render(el.props.children) } } : el);

  it("gains Installed Files after the first page for an installed game of ours only", () => {
    weOwn([tracked({ appid: OURS + 5, rom_id: 2, state: "paused" })]);
    const rendered = Pages({ appId: OURS });
    const out = withInstalledFiles(rendered, OURS)!;
    expect((out.props as any).pages.map((p: any) => p.route.split("/").pop())).toEqual(["shortcut", "localfiles", "controller"]);
    expect(withInstalledFiles(out, OURS)).toBeUndefined();
    for (const appid of [STEAM_APP, OTHER_SHORTCUT, OURS + 5]) expect(withInstalledFiles(Pages({ appId: appid }), appid)).toBeUndefined();
    expect(withInstalledFiles(createElement("Sidebar", { pages: "?" }), OURS)).toBeUndefined();
  });

  it("as a hook: another app's Properties render exactly as without it", () => {
    weOwn();
    const route = (appId: number) => ({ path: "/app/:appid/properties", children: createElement(Outer, { appId }) });
    const plain = (appId: number) => render(route(appId).children);
    const undo = installInstalledFilesPage();
    const patched = (appId: number) => render(applyRoutePatches("/app/:appid/properties", route(appId)).children);
    expect(patched(STEAM_APP)).toEqual(plain(STEAM_APP));
    expect(patched(OTHER_SHORTCUT)).toEqual(plain(OTHER_SHORTCUT));
    expect(patched(OURS).props.children.props.pages).toHaveLength(3);
    undo();
    expect(patched(OURS)).toEqual(plain(OURS));
  });
});
