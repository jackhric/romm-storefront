import { Focusable, GamepadButton, GamepadEvent } from "@decky/ui";
import { FC, useEffect, useMemo, useRef, useState } from "react";
import { Game, Progress } from "../../../api";
import { formatSize } from "../../../state";
import { ActionButton, Art, Button, C, Capsule, ConsoleBanner, fitColumns, GUTTER, HeroArt, Logo, Page, PillTabs, SectionHeader, Shelf, TileGrid, usePageSize, WideArt } from "../../kit";
import { openGamePage, reveal, sortGames, StoreModel, useReturnFocus, useStoreModel, useVideo, warmVideos, revealPageTop } from "../../hooks";
import { backdropOf, coverOf, useGameDetails } from "../../store/model";
import { StoreProps } from "../types";
import { takeBrowseRequest } from "../../browse";
import { NativeTabRow, playTabSound } from "../../../steam/native";
import { Remember, SpotlightStyle, useTileFocus } from "./common";
import { SearchField, setRememberedQuery, useSearch } from "./filters";
import { LibraryView, presetLibrary } from "./Library";

type Section = "discover" | "browse" | "rated" | "new" | "consoles";
const SECTIONS: { key: Section; label: string }[] = [
  { key: "discover", label: "Discover" },
  { key: "browse", label: "Browse" },
  { key: "rated", label: "Top rated" },
  { key: "new", label: "New" },
  { key: "consoles", label: "Consoles" },
];

const TABS = SECTIONS.map((x) => ({ id: x.key, title: x.label }));
const SLIDE_MS = 8000;
const HERO_H = 460;

let rememberedSection: Section = "discover";

const toTop = revealPageTop;
const line = (g: Game, ...parts: (string | number | false | null | undefined)[]) => [...parts, g.platform].filter(Boolean).join(" · ");

export interface DiscoverProps { model: StoreModel; progress: Record<number, Progress>; remember: Remember }

/** The sectioned store page; `Body` is what the Discover section shows. */
export function makeStore(Body: FC<DiscoverProps>): FC<StoreProps> {
  return function Store({ state, progress }: StoreProps) {
  const model = useStoreModel(state);
  const request = useRef<ReturnType<typeof takeBrowseRequest> | null>(null);
  if (request.current === null) {
    request.current = takeBrowseRequest();
    if (request.current) {
      rememberedSection = "browse";
      presetLibrary("browse", { platformId: request.current.platformId ?? 0, genre: request.current.genre ?? "", installed: false });
      setRememberedQuery(request.current.query ?? "");
    }
  }
  const [section, setSection] = useState(rememberedSection);
  // What is drawn lags the active tab by Steam's 80 ms exit, so the old section can leave before the new one enters.
  const [shown, setShown] = useState(rememberedSection);
  const [dir, setDir] = useState<"" | "l" | "r">("");
  const root = useRef<HTMLDivElement>(null);
  const search = useSearch((q) => {
    if (!q.trim()) return;
    rememberedSection = "browse";
    setSection("browse");
  });
  const remember = useReturnFocus("spotlight-store", root, true, section === "discover" ? "[data-autofocus]" : "[data-rom], [data-platform]");

  const swap = useRef(0);
  const focusBody = useRef(false);
  const change = (key: Section) => {
    if (key === section) return;
    const win = root.current?.ownerDocument.defaultView;
    setDir(SECTIONS.findIndex((x) => x.key === key) > SECTIONS.findIndex((x) => x.key === section) ? "r" : "l");
    rememberedSection = key;
    setSection(key);
    // The page window's timer: this script's own are throttled to about one a second.
    win?.clearTimeout(swap.current);
    if (win) swap.current = win.setTimeout(() => setShown(key), 80);
    else setShown(key);
  };

  useEffect(() => {
    toTop(root.current);
    if (!focusBody.current) return;
    focusBody.current = false;
    // The section that had focus is gone; Steam puts focus into the new tab's content.
    const body = root.current?.querySelector(".sp-body");
    const first = ["[data-autofocus]", "[data-rom]", "[data-platform]", ".ctk-button"].map((q) => body?.querySelector<HTMLElement>(q)).find(Boolean);
    first?.focus();
  }, [shown]);

  const onButtonDown = (e: GamepadEvent) => {
    const step = e.detail.button === GamepadButton.BUMPER_LEFT ? -1 : e.detail.button === GamepadButton.BUMPER_RIGHT ? 1 : 0;
    if (!step) return;
    const next = SECTIONS[SECTIONS.findIndex((x) => x.key === section) + step];
    if (!next) return;
    focusBody.current = true;
    playTabSound();
    change(next.key);
  };
  const leaving = shown !== section;

  return (
    <Page>
      <SpotlightStyle />
      <Focusable ref={root} flow-children="column" onButtonDown={onButtonDown}>
        <Focusable flow-children="row" style={{ display: "flex", alignItems: "center", gap: 16, padding: `48px ${GUTTER}px 0` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {NativeTabRow
              ? <NativeTabRow tabs={TABS} activeTab={section} onShowTab={(id) => change(id as Section)} showGlyphs wrapAround={false} className="sp-tabs" />
              : <PillTabs tabs={SECTIONS} active={section} onChange={change} />}
          </div>
          <SearchField text={search.text} box={search.box} onType={search.type} />
        </Focusable>
        <div key={shown} className={`sp-body${dir ? ` sp-${leaving ? "exit" : "enter"}-${dir}` : ""}`} style={{ paddingTop: 18, paddingBottom: 24 }}>
          {shown === "discover" && <Body model={model} progress={progress} remember={remember} />}
          {shown === "browse" && <LibraryView id="browse" title="Browse library" games={model.games} consoles={model.consoles} order="sort" query={search.query} onClearQuery={search.clear} progress={progress} remember={remember} />}
          {shown === "rated" && <LibraryView id="rated" title="Top rated" games={model.games} consoles={model.consoles} order="rating" cap={70} query={search.query} onClearQuery={search.clear} progress={progress} remember={remember} />}
          {shown === "new" && <LibraryView id="new" title="New on your server" games={model.games} consoles={model.consoles} order="added" cap={70} query={search.query} onClearQuery={search.clear} progress={progress} remember={remember} />}
          {shown === "consoles" && <Consoles model={model} remember={remember} />}
        </div>
      </Focusable>
    </Page>
  );
  };
}

const BANNER_W = 290;

function Consoles({ model, remember }: { model: StoreModel; remember: Remember }) {
  const { columns, width } = fitColumns(usePageSize().width, BANNER_W);
  return (
    <div data-section="consoles-grid">
      <TileGrid
        items={model.consoles}
        columns={columns}
        render={(c) => <ConsoleBanner key={c.platform.id} entry={c} width={width} onFocus={(id) => remember(`[data-section="consoles-grid"] [data-platform="${id}"]`)} />}
      />
    </div>
  );
}

function Discover({ model, progress, remember }: DiscoverProps) {
  const onFocus = useTileFocus(remember);
  const newest = useMemo(() => sortGames(model.games.filter((g) => g.release_year), "year").slice(0, 5), [model.games]);
  const third = useMemo(() => {
    if (model.installed) return { title: "On this Device", games: model.installed.games.slice(0, 5), meta: (g: Game) => line(g, formatSize(g.size_bytes)) };
    return { title: "Largest", games: sortGames(model.games, "size").slice(0, 5), meta: (g: Game) => line(g, formatSize(g.size_bytes)) };
  }, [model.games, model.installed]);
  type Chart = { key: string; title: string; games: Game[]; meta: (g: Game) => string };
  const charts = ([
    { key: "rated", title: "Top rated", games: model.rated?.games.slice(0, 5) ?? [], meta: (g) => line(g, g.rating !== null && `★ ${g.rating}`) },
    { key: "newest", title: "Newest releases", games: newest, meta: (g) => line(g, g.release_year) },
    { key: "third", title: third.title, games: third.games, meta: third.meta },
  ] as Chart[]).filter((c) => c.games.length);

  return (
    <>
      <Spotlight picks={model.featured.slice(0, 5)} progress={progress} remember={remember} />
      <div style={{ height: 24 }} />
      {model.recent && (
        <Shelf title={model.recent.title} section="recent">
          {model.recent.games.map((g) => <Capsule key={g.rom_id} game={g} progress={progress[g.rom_id]} onFocus={onFocus} onOpen={openGamePage} />)}
        </Shelf>
      )}
      {model.forYou && (
        <Shelf title={model.forYou.title} section="foryou">
          {model.forYou.games.map((g) => <Capsule key={g.rom_id} game={g} progress={progress[g.rom_id]} onFocus={onFocus} onOpen={openGamePage} />)}
        </Shelf>
      )}
      {charts.length > 0 && (
        <Focusable flow-children="row" style={{ display: "flex", gap: 24, padding: `0 ${GUTTER}px`, marginBottom: 22 }}>
          {charts.map((c) => (
            <div key={c.key} data-section={`chart-${c.key}`} style={{ flex: 1, minWidth: 0 }}>
              <SectionHeader gutter={0}>{c.title}</SectionHeader>
              <Focusable flow-children="column" style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 12 }}>
                {c.games.map((g, i) => <ChartRow key={g.rom_id} game={g} rank={i + 1} meta={c.meta(g)} onFocus={onFocus} />)}
              </Focusable>
            </div>
          ))}
        </Focusable>
      )}
      {model.consoles.length > 0 && (
        <Shelf title="Consoles" section="consoles">
          {model.consoles.map((c) => <ConsoleBanner key={c.platform.id} entry={c} width={250} height={130} onFocus={(id) => remember(`[data-section="consoles"] [data-platform="${id}"]`)} />)}
        </Shelf>
      )}
    </>
  );
}

function ChartRow({ game, rank, meta, onFocus }: { game: Game; rank: number; meta: string; onFocus: (g: Game, el: HTMLDivElement | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cover = coverOf(game);
  return (
    <Focusable
      ref={ref}
      className="sp-row ctk-ring"
      noFocusRing
      data-rom={game.rom_id}
      onActivate={() => openGamePage(game)}
      onOKActionDescription="View"
      onGamepadFocus={() => {
        reveal(ref.current);
        onFocus(game, ref.current);
      }}
      style={{ gap: 12, padding: "6px 12px 6px 10px" }}
    >
      <div style={{ flex: "0 0 22px", fontSize: 18, fontWeight: 700, color: C.description, textAlign: "center" }}>{rank}</div>
      <div style={{ flex: "0 0 40px", height: 60, background: C.ink }}><Art src={cover} small /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 500, lineHeight: "20px", color: C.title, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{game.name}</div>
        <div style={{ fontSize: 13, lineHeight: "18px", color: C.description, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta}</div>
      </div>
    </Focusable>
  );
}

export function Spotlight({ picks, progress, remember, playVideo = true }: { picks: Game[]; progress: Record<number, Progress>; remember: Remember; playVideo?: boolean }) {
  const [idx, setIdx] = useState(0);
  const [retry, setRetry] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const game = picks[idx] ?? picks[0];
  const details = useGameDetails(game.rom_id);
  const video = useVideo(details, "large");
  useEffect(() => warmVideos(picks), [picks]);

  useEffect(() => {
    if (picks.length < 2) return;
    const t = setTimeout(() => {
      if (box.current?.querySelector(".gpfocus")) setRetry((n) => n + 1);
      else setIdx((i) => (i + 1) % picks.length);
    }, SLIDE_MS);
    return () => clearTimeout(t);
  }, [idx, retry, picks.length]);

  const viewGame = () => {
    remember('[data-section="spotlight"] .ctk-button');
    openGamePage(game);
  };

  return (
    <Focusable ref={box} flow-children="row" data-section="spotlight" style={{ display: "flex", gap: 17, padding: `0 ${GUTTER}px` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <HeroArt src={backdropOf(game, details)} height={HERO_H} video={video} playVideo={playVideo} fadeTo={C.ink} shadeLeft>
          <div style={{ height: "100%", boxSizing: "border-box", maxWidth: 580, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 10, padding: "0 0 24px 28px" }}>
            <Logo game={game} maxWidth={320} maxHeight={110} textStyle={{ fontSize: 34, fontWeight: 700, lineHeight: "40px", color: "#fff" }} />
            <div style={{ fontSize: 14, color: C.body, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{game.genres.slice(0, 4).join(" · ") || game.platform}</div>
            <div style={{ minHeight: 63, fontSize: 15, lineHeight: "21px", color: C.subtitle, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>{details?.summary}</div>
            <Focusable flow-children="row" onGamepadFocus={() => toTop(box.current)} style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <ActionButton game={game} progress={progress[game.rom_id]} width={180} autoFocus />
              <Button label="View game" onClick={viewGame} style={{ height: 48, padding: "0 24px", fontSize: 16 }}>View game</Button>
            </Focusable>
          </div>
        </HeroArt>
      </div>
      <Focusable flow-children="column" style={{ width: 290, flex: "0 0 auto", display: "flex", flexDirection: "column", gap: 4 }}>
        {picks.map((g, i) => (
          <Focusable
            key={g.rom_id}
            className={`sp-pick ctk-ring${i === idx ? " sp-on" : ""}`}
            noFocusRing
            onActivate={() => openGamePage(g)}
            onOKActionDescription="View"
            onGamepadFocus={() => setIdx(i)}
            style={{ flex: 1, minHeight: 0, gap: 12, padding: "0 12px" }}
          >
            <PickLogo game={g} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, lineHeight: "18px", color: C.title, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{g.name}</div>
              <div style={{ fontSize: 12, lineHeight: "16px", color: C.description, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.platform}</div>
            </div>
          </Focusable>
        ))}
      </Focusable>
    </Focusable>
  );
}

function PickLogo({ game }: { game: Game }) {
  return (
    <div style={{ flex: "0 0 104px", height: 56, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Art src={game.art.logo} small bare fit="contain" fallback={<WideArt game={game} />} />
    </div>
  );
}

export const Store = makeStore(Discover);
