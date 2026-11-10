import { Focusable, NavEntryPositionPreferences } from "@decky/ui";
import { ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { FaPlay } from "react-icons/fa";
import { formatSize } from "../../../state";
import { ActionButton, AmbientVideo, C, Capsule, GUTTER, HeroArt, Logo, MoreButton, Page, SectionHeader, Shelf, Summary, TagChip, openLightbox } from "../../kit";
import { cardSelector, formatDate, formatHours, isBusy, openGamePage, reveal, scoreWord, statusText, tagsOf, useReturnFocus, videoOf, revealPageTop } from "../../hooks";
import { coverOf } from "../../store/model";
import { GameProps } from "../types";
import { SpotlightStyle } from "./common";

const BAND_H = 500;
const join = (v?: string[]) => (v && v.length ? v.join(", ") : "");

export function Game({ data }: GameProps) {
  const { game, details, progress, shots, more, serverUrl } = data;
  const root = useRef<HTMLDivElement>(null);
  const remember = useReturnFocus(`spotlight-game-${game.rom_id}`, root, true);
  const onMoreFocus = useCallback((g: typeof game, el: HTMLDivElement | null) => remember(cardSelector(el, g.rom_id)), [remember]);
  const cover = coverOf(game);
  const video = videoOf(details);
  const developer = join(details?.developers);
  const score = details ? details.user_score ?? details.critic_score ?? game.rating : game.rating;
  const year = details?.released ? details.released.slice(0, 4) : game.release_year;
  const meta = [developer, game.genres.slice(0, 3).join(", ")].filter(Boolean).join(" · ");
  const tags = tagsOf(game, details);
  const toTop = () => revealPageTop(root.current);

  const rows: [string, string][] = [
    ["Platform", game.platform],
    ["Developer", developer],
    ["Publisher", join(details?.publishers)],
    ["Release date", details?.released ? formatDate(details.released) : year ? String(year) : ""],
    ["Size", `${formatSize(game.size_bytes)}${game.multi ? " · several files" : ""}`],
    ["Players", details?.player_count ?? ""],
    ["Game modes", join(details?.game_modes)],
    ["Series", join(details?.franchises)],
    ["Time to beat", formatHours(details?.hltb.main_story)],
    ["Achievements", details?.achievements ? String(details.achievements) : ""],
    ["Region", join(game.regions)],
  ];

  return (
    <Page>
      <SpotlightStyle />
      <Focusable ref={root} flow-children="column">
        <HeroArt src={data.backdrop} height={BAND_H} video={video} fadeTo={C.page} shadeLeft>
          <div style={{ height: "100%", boxSizing: "border-box", display: "flex", alignItems: "flex-end", gap: 24, padding: `0 ${GUTTER}px 28px` }}>
            <div style={{ flex: "0 0 200px", height: 300, background: C.ink, boxShadow: "0 8px 24px rgba(0,0,0,.5)" }}>
              {cover && <img src={cover} alt={game.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              <Logo game={game} maxWidth={270} maxHeight={85} textStyle={{ fontSize: 30, fontWeight: 700, lineHeight: "36px", color: "#fff" }} />
              {meta && <div style={{ fontSize: 15, color: C.subtitle, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta}</div>}
              <div style={{ display: "flex", gap: 24, fontSize: 15, color: C.body }}>
                {score !== null && score !== undefined && <span><span style={{ color: C.blue }}>{scoreWord(score)}</span> ({score})</span>}
                {year && <span>Released {year}</span>}
              </div>
              <Focusable flow-children="row" onGamepadFocus={toTop} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <ActionButton game={game} progress={progress[game.rom_id]} width={200} autoFocus />
                <MoreButton game={game} serverUrl={serverUrl} />
                {isBusy(game) && <div style={{ marginLeft: 8, fontSize: 14, color: C.subtitle, whiteSpace: "nowrap" }}>{statusText(game, progress[game.rom_id])}</div>}
              </Focusable>
            </div>
          </div>
        </HeroArt>

        <div style={{ display: "flex", gap: 60, padding: `28px ${GUTTER}px 0` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Media video={video} shots={shots} loaded={!!details} title={game.name} />
            {details?.summary && (
              <div style={{ marginTop: 28 }}>
                <SectionHeader size={18} gutter={0}>About</SectionHeader>
                <div style={{ marginTop: 10 }}><Summary text={details.summary} lines={6} fontSize={15} maxWidth={920} /></div>
              </div>
            )}
            {tags.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 24 }}>{tags.map((t) => <TagChip key={t}>{t}</TagChip>)}</div>}
          </div>
          <div style={{ flex: "0 0 300px" }}>
            <SectionHeader size={18} gutter={0}>Details</SectionHeader>
            <div style={{ marginTop: 10 }}>
              {rows.filter(([, v]) => v).map(([label, value]) => (
                <div key={label} style={{ display: "flex", gap: 12, padding: "9px 0", fontSize: 14, lineHeight: "20px", borderBottom: "1px solid rgba(255,255,255,.1)" }}>
                  <div style={{ flex: "0 0 40%", color: C.description }}>{label}</div>
                  <div style={{ flex: 1, minWidth: 0, textAlign: "right", color: C.title, overflowWrap: "anywhere" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {more && (
          <div style={{ marginTop: 36 }}>
            <Shelf title={more.title} section="more" headerSize={18}>
              {more.games.map((g) => <Capsule key={g.rom_id} game={g} progress={progress[g.rom_id]} onFocus={onMoreFocus} onOpen={openGamePage} />)}
            </Shelf>
          </div>
        )}
        <div style={{ height: 24 }} />
      </Focusable>
    </Page>
  );
}

type Item = { kind: "video" } | { kind: "shot"; index: number };

function Media({ video, shots, loaded, title }: { video?: ReturnType<typeof videoOf>; shots: string[]; loaded: boolean; title: string }) {
  const items = useMemo<Item[]>(() => [...(video ? [{ kind: "video" } as Item] : []), ...shots.map((_, index) => ({ kind: "shot", index }) as Item)], [video, shots]);
  const [sel, setSel] = useState(0);
  const offset = video ? 1 : 0;
  if (!loaded) return <div style={{ width: "100%", aspectRatio: "16 / 9", background: C.ink }} />;
  if (!items.length) return null;
  const current = items[Math.min(sel, items.length - 1)];
  return (
    <div>
      <div className="sp-main" style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", background: "#000", overflow: "hidden" }}>
        {current.kind === "shot" ? <img key={shots[current.index]} className="ctk-fade" src={shots[current.index]} alt="" /> : (
          <>
            {shots[0] && <img src={shots[0]} alt="" style={{ opacity: 0.6 }} />}
            <AmbientVideo source={video} active delayMs={300} />
          </>
        )}
      </div>
      <Focusable flow-children="row" navEntryPreferPosition={NavEntryPositionPreferences.MAINTAIN_X} className="ctk-strip" style={{ display: "flex", gap: 8, overflowX: "hidden", padding: "10px 4px 4px", margin: "0 -4px" }}>
        {items.map((it, i) => (
          <Thumb
            key={it.kind === "video" ? "video" : shots[it.index]}
            active={i === sel}
            onSelect={() => setSel(i)}
            onActivate={it.kind === "shot" ? () => openLightbox(shots, it.index, title, (n) => setSel(n + offset)) : undefined}
          >
            {it.kind === "video" ? (
              <>
                {shots[0] && <img src={shots[0]} alt="" loading="lazy" style={{ opacity: 0.6 }} />}
                <Center><FaPlay size={22} /></Center>
              </>
            ) : <img src={shots[it.index]} alt="" loading="lazy" />}
          </Thumb>
        ))}
      </Focusable>
    </div>
  );
}

const Center = ({ children }: { children: ReactNode }) => (
  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,.85)" }}>{children}</div>
);

function Thumb({ active, onSelect, onActivate, children }: { active: boolean; onSelect: () => void; onActivate?: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <Focusable
      ref={ref}
      className={`sp-thumb ctk-ring${active ? " sp-on" : ""}`}
      noFocusRing
      onActivate={onActivate}
      onOKActionDescription={onActivate ? "View" : undefined}
      onGamepadFocus={() => {
        onSelect();
        reveal(ref.current);
      }}
      style={{ width: 135, height: 76 }}
    >
      {children}
    </Focusable>
  );
}
