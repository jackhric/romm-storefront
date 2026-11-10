import { Focusable } from "@decky/ui";
import { useCallback, useMemo, useRef, useState } from "react";
import { Game } from "../../../api";
import { Capsule, C, ConsoleTile, GUTTER, HeroArt, Logo, Page, Shelf, TileFocus } from "../../kit";
import { cardSelector, openGamePage, useReturnFocus, useStoreModel, videoOf } from "../../hooks";
import { backdropOf, metaLine, useGameDetails } from "../../store/model";
import { StoreProps } from "../types";

const HERO_H = 454;
// The first shelf is pulled up over the hero's fade so its tiles clear the footer when the page is at the top.
const OVERLAP = 90;

export function Store({ state, progress }: StoreProps) {
  const model = useStoreModel(state);
  const root = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState<Game>();
  const rows = useMemo(() => [model.recent, model.forYou, model.rated, model.installed].filter((r) => !!r), [model]);
  const firstKey = rows[0]?.key;
  const remember = useReturnFocus("library-store", root, true, firstKey ? `[data-section="${firstKey}"] [data-rom]` : "[data-rom]");

  const hero = focused ?? model.featured[0] ?? model.games[0];
  const details = useGameDetails(hero.rom_id);

  const onTile = useCallback<TileFocus>((game, el) => {
    remember(cardSelector(el, game.rom_id));
    setFocused(game);
    if (el?.closest<HTMLElement>("[data-section]")?.dataset.section !== firstKey) return;
    const page = el.closest<HTMLElement>(".ctk-page");
    page?.scrollTo({ top: 0, behavior: "instant" });
    // Steam's own scroll-into-view lands a moment after focus.
    setTimeout(() => page?.scrollTo({ top: 0, behavior: "instant" }), 160);
  }, [remember, firstKey]);
  const onConsole = useCallback((id: number) => remember(`[data-platform="${id}"]`), [remember]);

  return (
    <Page background={C.page} scrollPaddingTop={50}>
      <div ref={root}>
        <Focusable flow-children="column">
          <HeroArt src={backdropOf(hero, details)} height={HERO_H} video={videoOf(details)} fadeTo={C.page} shadeLeft>
            <div style={{ height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 10, padding: `0 ${GUTTER}px ${OVERLAP + 14}px` }}>
              <div style={{ width: 430, height: 121, display: "flex", alignItems: "flex-end" }}>
                <Logo game={hero} maxWidth={430} maxHeight={121} textStyle={{ fontSize: 34, fontWeight: 700, lineHeight: "38px", color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,.6)" }} />
              </div>
              <div style={{ fontSize: 14, lineHeight: "20px", color: C.subtitle, textShadow: "0 1px 4px rgba(0,0,0,.6)" }}>{metaLine(hero)}</div>
            </div>
          </HeroArt>
          {rows.map((row, i) => row && (
            <div key={row.key} style={i === 0 ? { position: "relative", marginTop: -OVERLAP } : undefined}>
              <Shelf title={row.title} section={row.key}>
                {row.games.map((g) => <Capsule key={g.rom_id} game={g} progress={progress[g.rom_id]} onFocus={onTile} onOpen={openGamePage} />)}
              </Shelf>
            </div>
          ))}
          {model.consoles.length > 0 && (
            <Shelf title="Consoles" section="consoles">
              {model.consoles.map((e) => <ConsoleTile key={e.platform.id} entry={e} onFocus={onConsole} />)}
            </Shelf>
          )}
        </Focusable>
      </div>
    </Page>
  );
}
