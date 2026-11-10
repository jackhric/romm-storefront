// A game's Manage submenu says "Uninstall" for our games where a shortcut has "Remove non-Steam game from your
// library". Every other app's menu, and a selection of several apps, is returned as Steam built it.
// Verified on Steam client 1792618285 (2026-11-09).
import { fakeRenderComponent } from "@decky/ui";
import { cloneElement, createElement, isValidElement, ReactElement } from "react";
import { trackedGame } from "../core/games";
import { adjustResult } from "../core/intercept";
import { findExport, isFn, localize } from "../core/steam";
import { Undo } from "../core/tweak";
import { askUninstall, canAskUninstall } from "./uninstall";

const REMOVE_SHORTCUT = "RemoveShortcut";

/** The library context menu's class, reached through the exported function component that renders it. */
function contextMenuClass(): any {
  const outer = findExport((e) => isFn(e) && /\{navigator:[\w$]+,instance:[\w$]+,\.\.\.[\w$]+\}/.test(String(e)));
  if (!outer) return undefined;
  try {
    const cls = fakeRenderComponent(() => outer({}))?.type;
    return isFn(cls?.prototype?.BuildManageSubmenu) ? cls : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The submenu with its "remove shortcut" entry swapped for Uninstall; undefined (leave it alone) unless it is the
 * menu of exactly one game of ours and has that entry.
 */
export function withUninstall(apps: unknown, menu: unknown, label: string, onUninstall: (appid: number, ev: unknown) => void): ReactElement | undefined {
  const appid = Array.isArray(apps) && apps.length === 1 ? apps[0]?.appid : undefined;
  if (!trackedGame(appid) || !isValidElement(menu)) return undefined;
  const items = (menu.props as any)?.children;
  if (!Array.isArray(items)) return undefined;
  const at = items.findIndex((c) => isValidElement(c) && c.key === REMOVE_SHORTCUT);
  if (at < 0) return undefined;
  const uninstall = createElement((items[at] as ReactElement).type, { key: "Uninstall", onSelected: (ev: unknown) => onUninstall(appid, ev) } as any, label);
  return cloneElement(menu, { children: items.map((c, i) => (i === at ? uninstall : c)) } as any);
}

export function installManageMenu(): Undo {
  const cls = contextMenuClass();
  if (!cls || !canAskUninstall()) return () => {};
  return adjustResult("manage-menu", cls.prototype, "BuildManageSubmenu", (args, menu) =>
    withUninstall(args[0], menu, localize("#GameAction_Uninstall", "Uninstall"), askUninstall),
  );
}
