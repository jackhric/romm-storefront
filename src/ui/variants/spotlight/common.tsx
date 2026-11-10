import { Focusable } from "@decky/ui";
import { ReactNode, useCallback, useMemo } from "react";
import { Game, Progress } from "../../../api";
import { Button, C, Capsule, CAPSULE_W, fitColumns, GUTTER, TileGrid, usePageSize } from "../../kit";
import { cardSelector, openGamePage, sortGames, useSort } from "../../hooks";
import { FaSortAmountDown } from "react-icons/fa";
import { FilterBar, FilterBarProps, ICON } from "./filters";


const CSS = `
.sp-pick, .sp-row { display: flex; align-items: center; box-sizing: border-box; min-width: 0; background: ${C.surface}; transition: background-color .12s; }
.sp-pick.sp-on, .sp-row.sp-on { background: ${C.selected}; }
.sp-pick.gpfocus, .sp-row.gpfocus { background: ${C.surfaceFocus}; }
/* Steam's tab content transition, measured from its tabbed pages: out in 80 ms, in from 40% to the side in 320 ms. */
@keyframes sp-in-r { from { transform: translateX(40%); opacity: 0; } }
@keyframes sp-in-l { from { transform: translateX(-40%); opacity: 0; } }
.sp-enter-r { animation: sp-in-r 320ms cubic-bezier(0, 0, .1, 1) backwards; }
.sp-enter-l { animation: sp-in-l 320ms cubic-bezier(0, 0, .1, 1) backwards; }
.sp-exit-r, .sp-exit-l { opacity: 0; transition: transform 80ms cubic-bezier(.6, 0, 1, 1), opacity 80ms cubic-bezier(.6, 0, 1, 1); }
.sp-exit-r { transform: translateX(-10%); }
.sp-exit-l { transform: translateX(10%); }
@media (prefers-reduced-motion: reduce) { .sp-enter-r, .sp-enter-l { animation: none; } }
.sp-search { position: relative; flex: 0 0 auto; width: 260px; height: 36px; border-radius: 2px; overflow: hidden; background: ${C.storeChip}; transition: background-color .12s; }
.sp-search > div { margin: 0 !important; padding: 0 !important; min-height: 0 !important; height: 36px; background: none !important; }
.sp-search input { box-sizing: border-box; height: 36px; padding: 0 12px 0 34px !important; font-size: 14px; color: #fff !important; background: none !important; border: 0 !important; border-radius: 0 !important; box-shadow: none !important; }
.sp-search input::placeholder { color: ${C.body}; font-style: normal; }
.sp-search:focus-within { background: #fff; }
.sp-search:focus-within input { color: ${C.ink} !important; }
.sp-search:focus-within input::placeholder, .sp-search:focus-within .sp-search-icon { color: ${C.note}; }
.sp-search-icon { position: absolute; left: 12px; top: 11px; z-index: 1; color: ${C.body}; pointer-events: none; }
.sp-thumb { position: relative; flex: 0 0 auto; background: #000; overflow: hidden; opacity: .45; transition: opacity .12s; }
.sp-thumb.sp-on, .sp-thumb.gpfocus { opacity: 1; }
.sp-thumb img, .sp-main img { width: 100%; height: 100%; object-fit: contain; display: block; image-rendering: pixelated; }
`;

export const SpotlightStyle = () => <style>{CSS}</style>;

export type Remember = (selector: string | undefined) => void;

export const useTileFocus = (remember: Remember) =>
  useCallback((g: Game, el: HTMLDivElement | null) => remember(cardSelector(el, g.rom_id)), [remember]);

interface CatalogProps {
  title: ReactNode;
  weight: number;
  subtitle: string;
  games: Game[];
  progress: Record<number, Progress>;
  section: string;
  remember: Remember;
  limit?: number;
  /** Called when focus reaches the last rows of a limited grid. */
  onNearEnd?: () => void;
  filterBar?: FilterBarProps;
  ordered?: boolean;
  children?: ReactNode;
}

export function Catalog({ title, weight, subtitle, games, progress, section, remember, limit, onNearEnd, filterBar, ordered, children }: CatalogProps) {
  const { sort, sortLabel, openSortMenu } = useSort();
  const sorted = useMemo(() => (ordered ? games : sortGames(games, sort)), [games, sort, ordered]);
  const shown = useMemo(() => (limit ? sorted.slice(0, limit) : sorted), [sorted, limit]);
  const { columns, width } = fitColumns(usePageSize().width, CAPSULE_W);
  const remembered = useTileFocus(remember);
  const onFocus = useCallback((g: Game, el: HTMLDivElement | null) => {
    remembered(g, el);
    if (!onNearEnd || !limit || limit >= sorted.length) return;
    if (shown.findIndex((x) => x.rom_id === g.rom_id) >= shown.length - 3 * columns) onNearEnd();
  }, [remembered, onNearEnd, limit, sorted, shown, columns]);
  const sortButton = <Button label={`Sort: ${sortLabel}`} onClick={openSortMenu} style={ICON}><FaSortAmountDown size={15} /></Button>;
  return (
    <div data-section={section}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 36, padding: `0 ${GUTTER}px 12px` }}>
        <div style={{ fontSize: 22, fontWeight: weight, lineHeight: "28px", color: "#fff", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        <div style={{ flex: "1 1 auto", minWidth: 0, fontSize: 16, color: C.description, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</div>
        {filterBar ? (
          <FilterBar {...filterBar}>
            {!ordered && sortButton}
          </FilterBar>
        ) : (
          <Focusable flow-children="row" style={{ display: "flex", flex: "0 0 auto" }}>{sortButton}</Focusable>
        )}
      </div>
      {shown.length === 0 && <div style={{ padding: `16px ${GUTTER}px`, fontSize: 16, color: C.description }}>No games match</div>}
      <TileGrid items={shown} columns={columns} render={(g) => <Capsule key={g.rom_id} game={g} width={width} progress={progress[g.rom_id]} onFocus={onFocus} onOpen={openGamePage} />} />
      {children}
    </div>
  );
}
