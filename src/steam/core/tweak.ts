// A cut-down copy of Decky Toolkit's tweak registry: every change to Steam goes through tweak(), whose undo runs at
// most once and never throws, and restoreAll() releases whatever is still applied.

export type Undo = () => void;
export type Apply = (track: (undo: Undo) => void) => Undo | void;

const LOG = "[ChickenTender]";
const warned = new Set<string>();
const live = new Map<number, { name: string; undo: Undo }>();
let nextId = 1;

export function warnOnce(name: string, err: unknown) {
  if (warned.has(name)) return;
  warned.add(name);
  console.warn(`${LOG} "${name}" skipped, Steam left as it was:`, err);
}

function runAll(name: string, undos: Undo[]) {
  for (const u of [...undos].reverse()) {
    try {
      u();
    } catch (err) {
      warnOnce(`${name} (undo)`, err);
    }
  }
}

/** Applies a change; `apply` returns nothing when the internal is missing (and must then have changed nothing). */
export function tweak(name: string, apply: Apply): Undo {
  const partial: Undo[] = [];
  let undos: Undo[] = [];
  try {
    const own = apply((u) => partial.push(u));
    undos = own ? [...partial, own] : partial;
  } catch (err) {
    runAll(name, partial);
    warnOnce(name, err);
    return () => {};
  }
  if (!undos.length) return () => {};
  const id = nextId++;
  let done = false;
  const undo = () => {
    if (done) return;
    done = true;
    live.delete(id);
    runAll(name, undos);
  };
  live.set(id, { name, undo });
  return undo;
}

export function activeTweaks(): string[] {
  return [...live.values()].map((t) => t.name);
}

const KEY = "__chickenTenderSteam";
const api = { restoreAll };

/** Undoes every tweak still applied, newest first. Never throws. */
export function restoreAll() {
  for (const t of [...live.values()].reverse()) t.undo();
  try {
    const g = globalThis as any;
    if (g[KEY] === api) delete g[KEY];
  } catch {
    // nothing to clean up
  }
}

/** An instance left over from a reload that skipped onDismount is restored first, so patches never stack. */
export function installReloadGuard() {
  const g = globalThis as any;
  try {
    const prev = g[KEY];
    if (prev && prev !== api) prev.restoreAll();
  } catch (err) {
    warnOnce("previous instance (undo)", err);
  }
  g[KEY] = api;
}
