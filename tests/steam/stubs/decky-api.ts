type RoutePatch = (route: any) => any;
const patches = new Map<string, Set<RoutePatch>>();

export const routerHook = {
  addPatch(path: string, patch: RoutePatch) {
    if (!patches.has(path)) patches.set(path, new Set());
    patches.get(path)!.add(patch);
    return patch;
  },
  removePatch(path: string, patch: RoutePatch) {
    patches.get(path)?.delete(patch);
  },
};

/** What Decky does with a route: every patch for its path, in order. */
export const applyRoutePatches = (path: string, route: any) => [...(patches.get(path) ?? [])].reduce((r, p) => p(r), route);
export const toaster = { toast() {} };
