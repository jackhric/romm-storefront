import { Focusable, NavEntryPositionPreferences } from "@decky/ui";
import { memo } from "react";
import { Game, Progress } from "../../api";
import { Card } from "./Card";
import { Row as RowModel } from "./model";
import { CARD_GAP, MUTED, PAGE_X } from "./theme";

interface Props {
  row: RowModel;
  progress: Record<number, Progress>;
  onFocus: (game: Game, el: HTMLDivElement | null) => void;
  onOpen: (game: Game) => void;
}

export const Row = memo(function Row({ row, progress, onFocus, onOpen }: Props) {
  return (
    <div className="ct-row" data-section={row.key} style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, padding: `0 ${PAGE_X}px`, marginBottom: 2 }}>
        <div style={{ fontSize: 20, fontWeight: 500, letterSpacing: 0.2 }}>{row.title}</div>
        <div style={{ fontSize: 12, color: MUTED }}>{row.subtitle}</div>
      </div>
      <Focusable
        className="ct-strip"
        flow-children="row"
        navEntryPreferPosition={NavEntryPositionPreferences.MAINTAIN_X}
        style={{ display: "flex", gap: CARD_GAP, overflowX: "hidden", padding: `12px ${PAGE_X}px 10px`, scrollPaddingLeft: PAGE_X, scrollPaddingRight: PAGE_X }}
      >
        {row.games.map((g) => <Card key={g.rom_id} game={g} progress={progress[g.rom_id]} onFocus={onFocus} onOpen={onOpen} note={row.notes?.[g.rom_id]} />)}
      </Focusable>
    </div>
  );
});
