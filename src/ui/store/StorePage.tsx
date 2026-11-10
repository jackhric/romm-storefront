import { Focusable, GamepadButton, GamepadEvent } from "@decky/ui";
import { FaEye } from "react-icons/fa";
import { FC, useEffect, useRef, useState } from "react";
import { Game, Progress } from "../../api";
import { ActionButton, Art, C, IconButton, ConsoleBanner, FocusBackdrop, fitColumns, GUTTER, HeroArt, Logo, Page, PillTabs, showInBackdrop, TileGrid, usePageSize, WideArt } from "../kit";
import { openGamePage, StoreModel, useReturnFocus, useStoreModel, useVideo, warmVideos, revealPageTop } from "../hooks";
import { backdropOf, useGameDetails } from "./model";
import { StoreProps } from "../pages";
import { takeBrowseRequest } from "./browse";
import { NativeTabRow, playTabSound } from "../../steam";
import { Remember, SpotlightStyle } from "./catalog";
import { SearchField, setRememberedQuery, useSearch } from "./filters";
import { LibraryView, presetLibrary } from "./LibraryView";

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
      <FocusBackdrop visible={shown === "discover"} />
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
    remember('[data-section="spotlight"] .ctk-icon');
    openGamePage(game);
  };

  return (
    <Focusable ref={box} flow-children="row" data-section="spotlight" style={{ display: "flex", gap: 17, padding: `0 ${GUTTER}px` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <HeroArt src={backdropOf(game, details)} height={HERO_H} video={video} playVideo={playVideo} fadeTo={C.ink} shadeLeft drift>
          <div style={{ height: "100%", boxSizing: "border-box", maxWidth: 580, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 10, padding: "0 0 24px 28px" }}>
            <Logo game={game} maxWidth={320} maxHeight={110} textStyle={{ fontSize: 34, fontWeight: 700, lineHeight: "40px", color: "#fff" }} />
            <div style={{ fontSize: 14, color: C.body, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{game.genres.slice(0, 4).join(" · ") || game.platform}</div>
            <div style={{ minHeight: 63, fontSize: 15, lineHeight: "21px", color: C.subtitle, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>{details?.summary}</div>
            <Focusable flow-children="row" onGamepadFocus={() => {
              toTop(box.current);
              showInBackdrop(game);
            }} style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <ActionButton game={game} progress={progress[game.rom_id]} width={180} autoFocus />
              <IconButton label="View game" onClick={viewGame}><FaEye size={20} /></IconButton>
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
            onGamepadFocus={() => {
              setIdx(i);
              showInBackdrop(g);
            }}
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

