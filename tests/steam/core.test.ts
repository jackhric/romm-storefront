import { describe, expect, it, vi } from "vitest";
import { installedGame, setGames, trackedGame } from "../../src/steam/core/games";
import { adjustResult, hookHealth, intercept, PASS } from "../../src/steam/core/intercept";
import { isShortcutId } from "../../src/steam/core/steam";
import { activeTweaks, restoreAll } from "../../src/steam/core/tweak";
import { installed, OTHER_SHORTCUT, OURS, STEAM_APP, tracked, weOwn } from "./fixtures";

describe("which apps are ours", () => {
  it("only an appid in the shortcut range can be", () => {
    expect([OURS, OTHER_SHORTCUT].every(isShortcutId)).toBe(true);
    expect([STEAM_APP, 0, -1, 1.5, 2 ** 32, "2415919105", undefined, null, NaN].some(isShortcutId)).toBe(false);
  });

  it("a Steam store app is never ours, even when the backend lists it", () => {
    setGames([tracked({ appid: STEAM_APP })], [installed({ appid: STEAM_APP })]);
    expect(trackedGame(STEAM_APP)).toBeUndefined();
    expect(installedGame(STEAM_APP)).toBeUndefined();
  });

  it("another shortcut is not ours, and installed needs a ledger record", () => {
    weOwn();
    expect(trackedGame(OURS)?.rom_id).toBe(1);
    expect(trackedGame(OTHER_SHORTCUT)).toBeUndefined();
    setGames([], [installed()]);
    expect(installedGame(OURS)).toBeUndefined();
  });
});

describe("intercept", () => {
  const steam = () => {
    const calls: { self: unknown; args: unknown[] }[] = [];
    const api = {
      Act(this: unknown, ...args: unknown[]) {
        calls.push({ self: this, args });
        return "steam's answer";
      },
    };
    return { api, calls, original: api.Act };
  };

  it("hands a call that is not ours to Steam exactly as it was made", () => {
    const { api, calls } = steam();
    const handle = vi.fn();
    intercept("t", api, "Act", (args) => args[0] === OURS, handle);
    const payload = { some: "object" };
    expect(api.Act(STEAM_APP, payload)).toBe("steam's answer");
    expect(calls).toHaveLength(1);
    expect(calls[0].self).toBe(api);
    expect(calls[0].args[0]).toBe(STEAM_APP);
    expect(calls[0].args[1]).toBe(payload);
    expect(handle).not.toHaveBeenCalled();
  });

  it("keeps a call that is ours away from Steam", () => {
    const { api, calls } = steam();
    intercept("t", api, "Act", (args) => args[0] === OURS, () => "handled");
    expect(api.Act(OURS)).toBe("handled");
    expect(calls).toHaveLength(0);
  });

  it("lets a handler pass a narrowed call on", () => {
    const { api, calls } = steam();
    intercept("t", api, "Act", () => true, (args) => {
      args[0] = [STEAM_APP];
      return PASS;
    });
    api.Act([OURS, STEAM_APP]);
    expect(calls[0].args[0]).toEqual([STEAM_APP]);
  });

  it("falls back to Steam when our check or our handler throws", () => {
    const { api, calls } = steam();
    intercept("check", api, "Act", () => {
      throw new Error("our bug");
    }, () => "handled");
    expect(api.Act(OURS)).toBe("steam's answer");
    restoreAll();
    intercept("handler", api, "Act", () => true, () => {
      throw new Error("our bug");
    });
    expect(api.Act(OURS)).toBe("steam's answer");
    expect(calls).toHaveLength(2);
    expect(hookHealth().check.failures).toBe(1);
  });

  it("switches a hook off after repeated failures", () => {
    const { api } = steam();
    const ours = vi.fn(() => {
      throw new Error("our bug");
    });
    intercept("t", api, "Act", ours, () => "handled");
    for (let i = 0; i < 5; i++) expect(api.Act(OURS)).toBe("steam's answer");
    expect(ours).toHaveBeenCalledTimes(3);
    expect(hookHealth().t.off).toBe(true);
  });

  it("puts Steam's function back on undo, and does nothing when the function is missing", () => {
    const { api, original } = steam();
    const undo = intercept("t", api, "Act", () => true, () => "handled");
    expect(api.Act).not.toBe(original);
    undo();
    expect(api.Act).toBe(original);
    expect(activeTweaks()).toEqual([]);
    intercept("gone", {}, "Act", () => true, () => "handled");
    intercept("none", undefined, "Act", () => true, () => "handled");
    expect(activeTweaks()).toEqual([]);
  });
});

describe("adjustResult", () => {
  it("returns Steam's own result unless we return another", () => {
    const result = { from: "steam" };
    const api = { Get: () => result };
    adjustResult("t", api, "Get", () => undefined);
    expect(api.Get()).toBe(result);
    restoreAll();
    adjustResult("t", api, "Get", () => {
      throw new Error("our bug");
    });
    expect(api.Get()).toBe(result);
    restoreAll();
    adjustResult("t", api, "Get", () => "ours");
    expect(api.Get()).toBe("ours");
  });
});
