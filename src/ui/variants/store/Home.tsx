import { Focusable, NavEntryPositionPreferences } from "@decky/ui";
import { memo, ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { Game, Progress } from "../../../api";
import { AmbientVideo, Art, C, ConsoleTile, Page, Shelf, STORE_GUTTER, TagChip, TileFocus, WideArt, WideCapsule, WIDE_SMALL_W, WIDE_W } from "../../kit";
import { cardSelector, openGamePage, reveal, scoreWord, sortGames, StoreModel, tagsOf, useReturnFocus, useStoreModel, VideoSource, useVideo, revealPageTop } from "../../hooks";
import { useGameDetails } from "../../store/model";
import { StoreProps } from "../types";
import { GameRow, PAGE_BG, StatusTag, SV_CSS } from "./common";

const HERO_W = 392;
const NAV_GRADIENT = "radial-gradient(107.95% 57.49% at 50% 100%, rgba(24,37,53,.2) 0%, rgba(24,37,53,.52) 5%, rgba(24,37,53,.85) 20%, rgb(24,37,53) 60%, rgb(25,35,48) 100%)";
const LIST_ROWS = 10;
const PREVIEW_H = 700;

interface HeroProps {
  game: Game;
  progress?: Progress;
  video?: VideoSource;
  first: boolean;
  onFocus: (game: Game, el: HTMLDivElement | null, first: boolean) => void;
  onOpen: (game: Game) => void;
}

export const HeroCapsule = memo(function HeroCapsule({ game, progress, video, first, onFocus, onOpen }: HeroProps) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <Focusable
      ref={ref}
      className="sv-hero ctk-ring"
      noFocusRing
      data-rom={game.rom_id}
      {...(first ? { "data-autofocus": "" } : {})}
      onActivate={() => onOpen(game)}
      onOKActionDescription="View"
      onGamepadFocus={() => {
        reveal(ref.current);
        onFocus(game, ref.current, first);
      }}
      style={{ width: HERO_W }}
    >
      <div style={{ position: "relative", height: 224, overflow: "hidden", background: C.ink }}>
        {game.art.hero ? <Art src={game.art.hero} small alt={game.name} /> : <WideArt game={game} style={{ height: 224, aspectRatio: "auto" }} />}
        {game.art.logo && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, boxSizing: "border-box", background: "rgba(0,0,0,.3)" }}>
            <Art src={game.art.logo} small bare fit="contain" style={{ width: "70%", height: 130 }} imgStyle={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,.6))" }} />
          </div>
        )}
        {/* Over the logo: once the preview plays it has the whole picture. */}
        <AmbientVideo source={video} active={!!video} delayMs={700} />
      </div>
      <div style={{ boxSizing: "border-box", height: 187, padding: "14px 14px 12px", background: C.storePanel, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 600, lineHeight: "24px", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{game.name}</div>
        {game.rating !== null && <div style={{ fontSize: 14, lineHeight: "20px", marginTop: 2 }}><span style={{ color: C.blue }}>{scoreWord(game.rating)}</span> <span style={{ color: "#fff" }}>({game.rating}%)</span></div>}
        <div style={{ display: "flex", gap: 6, marginTop: 10, overflow: "hidden" }}>
          {game.genres.slice(0, 3).map((t) => <TagChip key={t}>{t}</TagChip>)}
        </div>
        <div style={{ marginTop: "auto", display: "flex", justifyContent: "flex-end" }}>
          <StatusTag game={game} progress={progress} dark />
        </div>
      </div>
    </Focusable>
  );
});

function NavItem({ children, onActivate, onFocus }: { children: ReactNode; onActivate: () => void; onFocus: () => void }) {
  return <Focusable className="sv-nav" noFocusRing onActivate={onActivate} onGamepadFocus={onFocus} onOKActionDescription="Go">{children}</Focusable>;
}

interface TabDef { key: string; label: string; games: Game[] }
let rememberedTab = "recent";

function tabsOf(model: StoreModel, byName: Game[]): TabDef[] {
  const tabs: TabDef[] = [];
  if (model.recent) tabs.push({ key: "recent", label: "Recently added", games: model.recent.games });
  if (model.rated) tabs.push({ key: "rated", label: "Top rated", games: model.rated.games });
  if (model.installed) tabs.push({ key: "installed", label: "On this Device", games: model.installed.games });
  tabs.push({ key: "az", label: "A-Z", games: byName });
  return tabs;
}

function Preview({ game }: { game: Game }) {
  const details = useGameDetails(game.rom_id);
  const tags = tagsOf(game, details).slice(0, 6);
  const shots = details?.screenshots.slice(0, 4) ?? [];
  return (
    <div style={{ boxSizing: "border-box", width: 480, height: PREVIEW_H, flex: "0 0 auto", padding: 12, background: C.storeRow, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: 22, fontWeight: 500, lineHeight: "30px", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{game.name}</div>
      <div style={{ minHeight: 44, marginTop: 6, fontSize: 16, lineHeight: "22px" }}>
        {game.rating !== null && (
          <>
            <div style={{ color: C.storeText }}>Overall User Reviews</div>
            <div><span style={{ color: C.blue }}>{scoreWord(game.rating)}</span> <span style={{ color: "#fff" }}>({game.rating})</span></div>
          </>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, minHeight: 28, overflow: "hidden", maxHeight: 60 }}>
        {tags.map((t) => <TagChip key={t}>{t}</TagChip>)}
      </div>
      <div style={{ flex: 1, minHeight: 0, marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {shots.map((src) => (
          <div key={src} className="ctk-fade" style={{ flex: "1 1 0", minHeight: 0, background: "rgba(0,0,0,.25)" }}>
            <img src={src} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

interface ListProps {
  tabs: TabDef[];
  progress: Record<number, Progress>;
  remember: (selector: string | undefined) => void;
}

function TabbedList({ tabs, progress, remember }: ListProps) {
  const [tabKey, setTabKey] = useState(rememberedTab);
  const [previewId, setPreviewId] = useState<number>();
  const tab = tabs.find((t) => t.key === tabKey) ?? tabs[0];
  const rows = useMemo(() => tab.games.slice(0, LIST_ROWS), [tab]);
  const shown = rows.find((g) => g.rom_id === previewId) ?? rows[0];
  const pick = useCallback((key: string) => {
    rememberedTab = key;
    setTabKey(key);
  }, []);
  const onRowFocus = useCallback((g: Game, el: HTMLDivElement | null) => {
    setPreviewId(g.rom_id);
    remember(cardSelector(el, g.rom_id));
  }, [remember]);

  return (
    <div data-section="list" style={{ padding: `0 ${STORE_GUTTER}px 40px` }}>
      <Focusable flow-children="row" style={{ display: "flex", gap: 12, marginBottom: 16 }}>
        {tabs.map((t) => (
          <Focusable key={t.key} className={`sv-tab ctk-ring${t.key === tab.key ? " sv-on" : ""}`} noFocusRing onGamepadFocus={() => pick(t.key)} onActivate={() => pick(t.key)} onOKActionDescription="Show">{t.label}</Focusable>
        ))}
      </Focusable>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 20 }}>
        <Focusable flow-children="column" navEntryPreferPosition={NavEntryPositionPreferences.MAINTAIN_X} style={{ display: "flex", flexDirection: "column", gap: 10, flex: "0 0 auto" }}>
          {rows.map((g) => <GameRow key={g.rom_id} game={g} progress={progress[g.rom_id]} width={727} height={74} onFocus={onRowFocus} onOpen={openGamePage} />)}
        </Focusable>
        <div style={{ position: "sticky", top: 56 }}>
          <Preview game={shown} />
        </div>
      </div>
    </div>
  );
}

export function StoreHome({ state, progress }: StoreProps) {
  const model = useStoreModel(state);
  const root = useRef<HTMLDivElement>(null);
  const remember = useReturnFocus("store-home", root, true);
  const [heroId, setHeroId] = useState<number>();
  const heroDetails = useGameDetails(heroId);
  const heroVideo = useVideo(heroDetails, "small");
  const byName = useMemo(() => sortGames(model.games, "name"), [model.games]);
  const tabs = useMemo(() => tabsOf(model, byName), [model, byName]);

  const scrollTop = useCallback(() => revealPageTop(root.current), []);
  const focusIn = (selector: string) => root.current?.querySelector<HTMLElement>(selector)?.focus();

  const onHeroFocus = useCallback((g: Game, el: HTMLDivElement | null, first: boolean) => {
    setHeroId(g.rom_id);
    remember(cardSelector(el, g.rom_id));
    if (first) scrollTop();
  }, [remember, scrollTop]);
  const onTile = useCallback<TileFocus>((g, el) => remember(cardSelector(el, g.rom_id)), [remember]);
  const onConsole = useCallback((id: number) => remember(`[data-section="consoles"] [data-platform="${id}"]`), [remember]);

  const strip = (section: string, title: string, games: Game[], width: number, subtitle?: string) => (
    <Shelf title={title} subtitle={subtitle} section={section} gutter={STORE_GUTTER}>
      {games.map((g) => <WideCapsule key={g.rom_id} game={g} width={width} progress={progress[g.rom_id]} onFocus={onTile} onOpen={openGamePage} />)}
    </Shelf>
  );

  return (
    <Page background={PAGE_BG} scrollPaddingTop={60}>
      <style>{SV_CSS}</style>
      <div ref={root} style={{ color: C.storeText, paddingBottom: 40 }}>
        <Focusable flow-children="column">
          <div style={{ display: "flex", alignItems: "center", height: 46, marginTop: 40, padding: `0 ${STORE_GUTTER}px`, background: NAV_GRADIENT, boxShadow: "0 2px 2px rgba(0,0,0,.2)" }}>
            <Focusable flow-children="row" style={{ display: "flex", gap: 4 }}>
              <NavItem onActivate={scrollTop} onFocus={scrollTop}>Store Home</NavItem>
              {model.consoles.length > 0 && <NavItem onActivate={() => focusIn('[data-section="consoles"] [data-platform]')} onFocus={scrollTop}>Consoles</NavItem>}
              {model.rated && <NavItem onActivate={() => focusIn('[data-section="rated"] [data-rom]')} onFocus={scrollTop}>Top rated</NavItem>}
            </Focusable>
            <div style={{ marginLeft: "auto", fontSize: 13, color: "rgb(220,222,223)" }}>{model.games.length} games</div>
          </div>
          <div style={{ height: 14 }} />
          <Shelf title="Featured" section="featured" gutter={STORE_GUTTER}>
            {model.featured.map((g, i) => (
              <HeroCapsule key={g.rom_id} game={g} progress={progress[g.rom_id]} video={g.rom_id === heroId ? heroVideo : undefined} first={i === 0} onFocus={onHeroFocus} onOpen={openGamePage} />
            ))}
          </Shelf>
          {model.recent && strip("recent", "Recently added", model.recent.games, WIDE_W)}
          {model.consoles.length > 0 && (
            <Shelf title="Browse by console" section="consoles" gutter={STORE_GUTTER}>
              {model.consoles.map((c) => <ConsoleTile key={c.platform.id} entry={c} onFocus={onConsole} />)}
            </Shelf>
          )}
          {model.forYou && strip("foryou", model.forYou.title, model.forYou.games, WIDE_W, model.forYou.subtitle)}
          {model.rated && strip("rated", "Top rated", model.rated.games, WIDE_SMALL_W)}
          <TabbedList tabs={tabs} progress={progress} remember={remember} />
        </Focusable>
      </div>
    </Page>
  );
}

