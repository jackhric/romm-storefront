// A shortcut's Properties has no Installed Files page; our installed games get one after the first (Shortcut) page,
// with the size, the path and Uninstall. The Properties of any other app render through Steam's own components.
// Verified on Steam client 1792618285 (2026-11-09).
import { routerHook } from "@decky/api";
import { DialogButton, Field } from "@decky/ui";
import { cloneElement, FC, isValidElement, ReactElement } from "react";
import { InstalledGame, installedGame } from "../core/games";
import { guarded } from "../core/intercept";
import { isFn, localize } from "../core/steam";
import { tweak, Undo } from "../core/tweak";
import { askUninstall } from "./uninstall";

const HOOK = "installed-files-page";
const PROPERTIES_ROUTE = "/app/:appid/properties";
const LOCAL_FILES = "localfiles";
const MAX_DEPTH = 3;

/** Steam's Storage page counts in 1024s and still writes GB; this matches it. */
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u++;
  }
  return `${u ? n.toFixed(2) : n} ${units[u]}`;
}

const InstalledFiles: FC<{ game: InstalledGame }> = ({ game }) => (
  <>
    <Field label={localize("#AppProperties_LocalFilesSize", "Size of installed files")} description={game.path} focusable>
      {formatBytes(game.bytes)}
    </Field>
    <Field label={game.name} childrenLayout="inline">
      <DialogButton onClick={(ev: unknown) => askUninstall(game.appid, ev)}>{localize("#GameAction_Uninstall", "Uninstall")}</DialogButton>
    </Field>
  </>
);

/** The page list with ours inserted; undefined (leave it alone) unless it is an installed game of ours. */
export function withInstalledFiles(rendered: unknown, appId: unknown): ReactElement | undefined {
  const game = installedGame(appId);
  if (!game || !isValidElement(rendered)) return undefined;
  const pages = (rendered.props as any)?.pages;
  const first = Array.isArray(pages) ? pages[0] : undefined;
  if (typeof first?.route !== "string" || typeof first?.link !== "string") return undefined;
  const sibling = (path: string) => path.replace(/[^/]+$/, LOCAL_FILES);
  if (pages.some((p: any) => p?.route === sibling(first.route))) return undefined;
  const page = {
    title: localize("#AppProperties_LocalFilesPage", "Installed Files"),
    route: sibling(first.route),
    link: sibling(first.link),
    content: <InstalledFiles game={game} />,
  };
  return cloneElement(rendered, { pages: [first, page, ...pages.slice(1)] } as any);
}

const TREE_DEPTH = 6;

/**
 * A copy of a rendered tree with the first element `swap` answers for replaced; Steam's own elements are never
 * written to, and the same tree comes back when nothing was swapped.
 */
export function swapInTree(node: any, swap: (el: any) => any, depth = TREE_DEPTH): any {
  if (depth < 0 || !node || typeof node !== "object") return node;
  if (Array.isArray(node)) {
    const out = node.map((n) => swapInTree(n, swap, depth));
    return out.some((n, i) => n !== node[i]) ? out : node;
  }
  if (!isValidElement(node)) return node;
  const swapped = swap(node);
  if (swapped) return swapped;
  const children = (node.props as any)?.children;
  const next = swapInTree(children, swap, depth - 1);
  return next === children ? node : { ...node, props: { ...(node.props as any), children: next } };
}

export function installInstalledFilesPage(): Undo {
  return tweak(HOOK, () => {
    if (!isFn(routerHook?.addPatch)) return;
    let active = true;
    // One wrapper per original component, so React sees the same type on every render and keeps its state. A wrapper
    // renders the original first and returns exactly that unless our own step succeeds.
    const wrappers = new Map<Function, Function>();
    const wrap = (type: Function, after: (rendered: any, props: any) => unknown): Function => {
      let w = wrappers.get(type);
      if (!w) {
        w = (props: any) => {
          const rendered = type(props);
          return (active ? guarded(HOOK, () => after(rendered, props)) : undefined) ?? rendered;
        };
        wrappers.set(type, w);
      }
      return w;
    };
    const plain = (x: any) => isFn(x?.type) && !x.type.prototype?.render;
    // The page list is built by the component that takes appId, a few plain components below the route's own.
    const descend = Array.from({ length: MAX_DEPTH + 1 }, (_, depth) => (rendered: any) => {
      let found = false;
      const first = (wanted: (el: any) => boolean, swap: (el: any) => any) => (el: any) => {
        if (found || !wanted(el)) return undefined;
        found = true;
        return swap(el);
      };
      const out = swapInTree(rendered, first(
        (el) => plain(el) && !!el.props && "appId" in el.props,
        (el) => (installedGame(el.props.appId) ? { ...el, type: wrap(el.type, (r, p) => withInstalledFiles(r, p?.appId)) } : el),
      ));
      if (found || depth >= MAX_DEPTH) return out;
      return swapInTree(rendered, first(plain, (el) => ({ ...el, type: wrap(el.type, descend[depth + 1]) })));
    });
    const patch = routerHook.addPatch(PROPERTIES_ROUTE, (route: any) => {
      const el = route?.children;
      if (!active || !isValidElement(el) || !plain(el)) return route;
      return { ...route, children: { ...el, type: wrap(el.type as Function, descend[0]) } };
    });
    return () => {
      active = false;
      routerHook.removePatch(PROPERTIES_ROUTE, patch);
    };
  });
}
