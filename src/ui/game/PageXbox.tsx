// The game detail page layout: a tall hero with the title, a meta line and a left-aligned button row, then stacked
// sections (Screenshots, About, Details chips, Similar games). Past the hero a slim band keeps the title and
// the button on screen.
import { Focusable } from "@decky/ui";
import { Fragment, ReactNode, useEffect, useRef, useState } from "react";
import { FaBuilding, FaGamepad, FaGlobeAmericas, FaHdd, FaLayerGroup, FaUserFriends } from "react-icons/fa";
import { HeroBackground } from "../store/HeroBackground";
import { Title } from "../store/Title";
import { BG, MUTED, PAGE_X, TEXT } from "../store/theme";
import { bpx } from "../store/theme";
import { FactKey, facts, GameData, LABEL, MoreButton, MoreLikeThis, PrimaryButton, ProgressNote, Section, Sharp, ShotStrip, Summary, VALUE } from "./parts";

const HERO_H = bpx(596);
const BAND_H = bpx(56 + 96);
const GAP = bpx(48);

const CHIPS: [FactKey, ReactNode][] = [
  ["Size", <FaHdd />],
  ["Players", <FaUserFriends />],
  ["Region", <FaGlobeAmericas />],
  ["Modes", <FaGamepad />],
  ["Series", <FaLayerGroup />],
  ["Developer", <FaBuilding />],
];

export function PageXbox({ data }: { data: GameData }) {
  const { game, details, shots } = data;
  const all = facts(game, details);
  const meta = [details?.publishers[0] || details?.developers[0], game.release_year, game.genres.slice(0, 2).join(", ")].filter(Boolean).join("  ·  ");
  const chips = CHIPS.filter(([k]) => all[k]);
  const root = useRef<HTMLDivElement>(null);
  const [band, setBand] = useState(false);
  // SteamGridDB heroes are full-resolution art; only RomM's low-resolution screenshots want hard pixels.
  const Backdrop = game.art.hero && data.backdrop === game.art.hero ? Fragment : Sharp;

  useEffect(() => {
    const page = root.current?.closest<HTMLElement>(".ct-page");
    if (!page) return;
    // Keeps what Steam scrolls into view below the band rather than under it.
    const before = page.style.scrollPaddingTop;
    page.style.scrollPaddingTop = `${BAND_H + 12}px`;
    const onScroll = () => setBand(page.scrollTop > HERO_H - BAND_H);
    page.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      page.removeEventListener("scroll", onScroll);
      page.style.scrollPaddingTop = before;
    };
  }, []);

  return (
    <Focusable ref={root} flow-children="column" style={{ display: "flex", flexDirection: "column", paddingBottom: 24 }}>
      {/* First in the column, so up from the hero's buttons reaches it while it shows. */}
      <div style={{ position: "sticky", top: 0, height: 0, zIndex: 3 }}>
        {band && (
          <Focusable flow-children="row" className="ct-fade" style={{ height: BAND_H, boxSizing: "border-box", background: "rgba(23,26,33,0.97)", boxShadow: "0 4px 16px rgba(0,0,0,0.5)", display: "flex", alignItems: "center", gap: bpx(24), padding: `${bpx(56)}px ${bpx(60)}px 0` }}>
            <div style={{ fontSize: bpx(28), fontWeight: 700, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{game.name}</div>
            <PrimaryButton game={game} width={bpx(220)} height={bpx(48)} fontSize={bpx(18)} />
          </Focusable>
        )}
      </div>

      <Backdrop>
      <HeroBackground src={data.backdrop} fadeTo={BG} brightness={0.85} style={{ height: HERO_H, background: BG }}>
        {/* In flow, not absolutely placed: Steam scrolled an absolutely placed focused button to the top of the page. */}
        <div style={{ height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: `0 ${PAGE_X}px ${HERO_H - bpx(510 + 56)}px ${bpx(60)}px` }}>
          <Title game={game} maxWidth="40%" maxHeight={Math.round(HERO_H * 0.35)} textStyle={{ fontSize: bpx(64), fontWeight: 700, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textShadow: "0 2px 12px rgba(0,0,0,0.7)" }} />
          <div style={{ fontSize: bpx(18), color: MUTED, marginTop: 4 }}>{meta}</div>
          <Focusable flow-children="row" style={{ display: "flex", gap: bpx(12), alignItems: "center", marginTop: bpx(20) }}>
            <PrimaryButton game={game} width={bpx(260)} height={bpx(56)} fontSize={bpx(20)} focusOnMount style={{ borderRadius: 4 }} />
            <MoreButton data={data} size={bpx(56)} />
            <div style={{ marginLeft: bpx(12) }}>
              <ProgressNote game={game} progress={data.progress[game.rom_id]} width={bpx(300)} />
            </div>
          </Focusable>
        </div>
      </HeroBackground>
      </Backdrop>

      <div style={{ display: "flex", flexDirection: "column", gap: GAP, marginTop: bpx(24) }}>
        {shots.length > 0 && (
          <Section title="Screenshots" size={bpx(28)} gap={bpx(4)}>
            <ShotStrip shots={shots} title={game.name} width={bpx(380)} gap={bpx(16)} padX={bpx(60)} />
          </Section>
        )}
        {details?.summary && (
          <Section title="About" size={bpx(28)}>
            <div style={{ padding: `0 ${bpx(60)}px` }}>
              <Summary text={details.summary} lines={5} fontSize={bpx(20)} maxWidth={bpx(1100)} />
            </div>
          </Section>
        )}
        {chips.length > 0 && (
          <Section title="Details" size={bpx(28)}>
            <Focusable flow-children="row" style={{ display: "flex", flexWrap: "wrap", gap: bpx(16), padding: `0 ${bpx(60)}px` }}>
              {chips.map(([k, icon]) => <Chip key={k} icon={icon} label={k} value={all[k] as string} />)}
            </Focusable>
          </Section>
        )}
        {!details && <div style={{ padding: `0 ${PAGE_X}px`, color: MUTED }}>Loading details…</div>}
        <MoreLikeThis data={data} />
      </div>
    </Focusable>
  );
}

function Chip({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <Focusable
      onActivate={() => {}}
      noFocusRing
      onGamepadFocus={() => setFocused(true)}
      onGamepadBlur={() => setFocused(false)}
      style={{ width: bpx(220), height: bpx(72), boxSizing: "border-box", display: "flex", alignItems: "center", gap: bpx(14), padding: `0 ${bpx(16)}px`, borderRadius: 4, background: focused ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.06)", outline: focused ? `2px solid ${TEXT}` : "none" }}
    >
      <div style={{ fontSize: bpx(24), color: MUTED, display: "flex", flex: "0 0 auto" }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={LABEL}>{label}</div>
        <div style={{ ...VALUE, fontSize: bpx(16) }}>{value}</div>
      </div>
    </Focusable>
  );
}
