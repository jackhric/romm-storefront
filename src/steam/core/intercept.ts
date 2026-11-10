// The only two ways a function of Steam's gets wrapped. Both keep one promise: unless our own check says the call
// is about one of our games, Steam's function runs with the arguments it was given and its result goes back
// untouched. Anything our code throws counts as "not ours", and a hook that keeps failing switches itself off.
import { afterPatch, callOriginal, replacePatch } from "@decky/ui";
import { isFn } from "./steam";
import { tweak, Undo } from "./tweak";

const MAX_FAILURES = 3;

type Health = { failures: number; off: boolean; last?: string };
const health = new Map<string, Health>();

function healthOf(name: string): Health {
  let h = health.get(name);
  if (!h) health.set(name, (h = { failures: 0, off: false }));
  return h;
}

function failed(name: string, err: unknown) {
  const h = healthOf(name);
  h.failures++;
  h.last = err instanceof Error ? err.message : String(err);
  if (h.failures === 1) console.warn(`[ChickenTender] hook "${name}" failed, Steam's own behaviour used:`, err);
  if (h.failures >= MAX_FAILURES && !h.off) {
    h.off = true;
    console.warn(`[ChickenTender] hook "${name}" switched off after ${h.failures} failures`);
  }
}

/** Runs our code for a hook; a throw is recorded and reported as undefined. */
export function guarded<T>(name: string, fn: () => T): T | undefined {
  if (healthOf(name).off) return undefined;
  try {
    return fn();
  } catch (err) {
    failed(name, err);
    return undefined;
  }
}

/** Every hook that has run or failed: for a look from the console when something seems off. */
export function hookHealth(): Record<string, Health> {
  return Object.fromEntries([...health].map(([k, v]) => [k, { ...v }]));
}

export function resetHookHealth() {
  health.clear();
}

/**
 * Takes over `api[method]` for our games only. `ours(args)` decides; only when it returns true does `handle(args)`
 * run, and its result is what the caller gets. `handle` may return PASS (after changing `args` in place) to let
 * Steam's function run after all.
 */
export const PASS = callOriginal;
export function intercept(name: string, api: any, method: string, ours: (args: any[]) => boolean, handle: (args: any[]) => unknown): Undo {
  return tweak(name, () => {
    if (!api || !isFn(api[method])) return;
    healthOf(name);
    const patch = replacePatch(api, method, (args: any[]) => {
      if (guarded(name, () => ours(args)) !== true) return callOriginal;
      try {
        return handle(args);
      } catch (err) {
        failed(name, err);
        return callOriginal;
      }
    });
    return () => patch.unpatch();
  });
}

/**
 * Lets `adjust(args, result)` change what `api[method]` returns. Returning undefined (or throwing) keeps Steam's
 * result; `adjust` must itself leave the result alone unless one of our games is involved.
 */
export function adjustResult(name: string, api: any, method: string, adjust: (args: any[], result: any) => unknown): Undo {
  return tweak(name, () => {
    if (!api || !isFn(api[method])) return;
    healthOf(name);
    const patch = afterPatch(api, method, function (this: unknown, args: any[], result: any) {
      const next = guarded(name, () => adjust.call(this, args, result));
      return next === undefined ? result : next;
    });
    return () => patch.unpatch();
  });
}
