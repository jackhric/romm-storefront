import { Focusable } from "@decky/ui";
import { useCallback, useMemo, useRef } from "react";
import { Button, C, Capsule, GUTTER, Page, TileFocus, TileGrid } from "../../kit";
import { cardSelector, openGamePage, sortGames, useReturnFocus, useSort } from "../../hooks";
import { ConsoleProps } from "../types";

export function Console({ platform, games, progress }: ConsoleProps) {
  const root = useRef<HTMLDivElement>(null);
  const { sort, sortLabel, openSortMenu } = useSort();
  const sorted = useMemo(() => sortGames(games, sort), [games, sort]);
  const onDevice = useMemo(() => games.filter((g) => g.status === "installed").length, [games]);
  const remember = useReturnFocus(`library-console-${platform.id}`, root, true, "[data-rom]");
  const onTile = useCallback<TileFocus>((game, el) => remember(cardSelector(el, game.rom_id)), [remember]);

  return (
    <Page background={C.page} scrollPaddingTop={64}>
      <div ref={root}>
        <Focusable flow-children="column">
          <div style={{ display: "flex", alignItems: "flex-end", gap: 20, padding: `64px ${GUTTER}px 8px` }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 22, fontWeight: 700, lineHeight: "28px", color: "#fff", textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{platform.name}</div>
              <div style={{ fontSize: 14, lineHeight: "20px", color: C.body }}>
                {games.length} {games.length === 1 ? "game" : "games"}{onDevice > 0 && ` · ${onDevice} on this device`}
              </div>
            </div>
            <Button label="Sort by" onClick={openSortMenu}>{sortLabel}</Button>
          </div>
          <TileGrid
            items={sorted}
            columns={7}
            render={(g) => <Capsule key={g.rom_id} game={g} progress={progress[g.rom_id]} onFocus={onTile} onOpen={openGamePage} />}
          />
        </Focusable>
      </div>
    </Page>
  );
}
