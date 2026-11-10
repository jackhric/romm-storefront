import { Focusable, NavEntryPositionPreferences } from "@decky/ui";
import { useCallback, useMemo, useRef } from "react";
import { Button, C, Page, STORE_GUTTER } from "../../kit";
import { openGamePage, sortGames, useReturnFocus, useSort, revealPageTop } from "../../hooks";
import { ConsoleProps } from "../types";
import { GameRow, PAGE_BG, SV_CSS } from "./common";

export function StoreConsole({ platform, games, progress }: ConsoleProps) {
  const root = useRef<HTMLDivElement>(null);
  const remember = useReturnFocus(`store-console-${platform.id}`, root, true);
  const { sort, sortLabel, openSortMenu } = useSort();
  const sorted = useMemo(() => sortGames(games, sort), [games, sort]);
  const installed = useMemo(() => games.filter((g) => g.status === "installed").length, [games]);
  const onRowFocus = useCallback((g: { rom_id: number }, el: HTMLDivElement | null, first: boolean) => {
    remember(`[data-rom="${g.rom_id}"]`);
    if (first) revealPageTop(el);
  }, [remember]);

  return (
    <Page background={PAGE_BG} scrollPaddingTop={60}>
      <style>{SV_CSS}</style>
      <div ref={root} style={{ color: C.storeText, padding: `60px ${STORE_GUTTER}px 40px` }}>
        <Focusable flow-children="column">
          <div style={{ display: "flex", alignItems: "flex-end", gap: 16, marginBottom: 18 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 36, fontWeight: 600, lineHeight: "40px", textTransform: "uppercase", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{platform.name}</div>
              <div style={{ fontSize: 16, lineHeight: "24px", color: C.body }}>{games.length} {games.length === 1 ? "game" : "games"}{installed > 0 && ` · ${installed} on this device`}</div>
            </div>
            <Button label="Sort" onClick={openSortMenu}>Sort by: {sortLabel}</Button>
          </div>
          <Focusable flow-children="column" navEntryPreferPosition={NavEntryPositionPreferences.MAINTAIN_X} style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {sorted.map((g, i) => (
              <GameRow key={g.rom_id} game={g} progress={progress[g.rom_id]} width={1228} height={70} showRating autoFocus={i === 0} onFocus={onRowFocus} onOpen={openGamePage} />
            ))}
          </Focusable>
        </Focusable>
      </div>
    </Page>
  );
}
