// Steam's own tab row and navigation sounds. Both are internals found by shape, so each is optional: callers fall
// back to their own tabs and to silence when Steam has moved them.
import * as ui from "@decky/ui";
import { findModuleExport } from "@decky/ui";
import { FC } from "react";

export interface NativeTabRowProps {
  tabs: { id: string; title: string }[];
  activeTab: string;
  onShowTab: (id: string) => void;
  /** Shows the bumper glyphs at both ends even while focus is elsewhere. */
  showGlyphs?: boolean;
  wrapAround?: boolean;
  className?: string;
}

function find(filter: (e: any) => boolean): any {
  try {
    return findModuleExport(filter);
  } catch {
    return undefined;
  }
}

const row = find((e) => typeof e === "function" && String(e).includes("TabRowTabs") && String(e).includes("showGlyphs"));
const sounds = find((e) => !!e && typeof e.PlayNavSound === "function");

/** The tab row of Steam's tabbed pages (pills, bumper glyphs, bumper switching), or undefined. */
export const NativeTabRow: FC<NativeTabRowProps> | undefined = typeof row === "function" ? row : undefined;

/** The swoosh Steam plays when a tab changes. */
export function playTabSound() {
  try {
    const id = (ui as any).ESteamUISound?.ChangeTabs;
    if (sounds && id !== undefined) sounds.PlayNavSound(id);
  } catch {
    // a sound is never worth an error
  }
}
