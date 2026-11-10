import { Focusable, GamepadButton, GamepadEvent } from "@decky/ui";
import { ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { formatSize } from "../../../state";
import { ActionButton, C, Capsule, GUTTER, HeroArt, Logo, MediaSlides, MoreButton, Page, PillTabs, SectionHeader, Shelf, Stats, Summary, TagChip, TileFocus } from "../../kit";
import { cardSelector, formatDate, formatHours, isBusy, openGamePage, scoreWord, statusText, tagsOf, useReturnFocus, videoOf } from "../../hooks";
import { GameProps } from "../types";

type Tab = "overview" | "media" | "details" | "achievements";

const HERO_H = 350;
const TABS_TOP = 40;
const TABS_H = 50;

function DetailStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 700, lineHeight: "22px", letterSpacing: 0.5, textTransform: "uppercase", color: C.label }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 500, lineHeight: "22px", color: "#fff", overflowWrap: "anywhere" }}>{children}</div>
    </div>
  );
}

export function Game({ data }: GameProps) {
  const { game, details, progress, more, shots, backdrop, serverUrl } = data;
  const root = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const remember = useReturnFocus(`library-game-${game.rom_id}`, root, true);

  const achievements = details?.achievements ?? 0;
  const tabs = useMemo(() => {
    const list: { key: Tab; label: string }[] = [
      { key: "overview", label: "Overview" },
      { key: "media", label: "Media" },
      { key: "details", label: "Details" },
    ];
    if (achievements > 0) list.push({ key: "achievements", label: `Achievements ${achievements}` });
    return list;
  }, [achievements]);

  const onBumper = useCallback((e: GamepadEvent) => {
    const step = e.detail.button === GamepadButton.BUMPER_LEFT ? -1 : e.detail.button === GamepadButton.BUMPER_RIGHT ? 1 : 0;
    if (!step) return;
    const i = tabs.findIndex((t) => t.key === tab);
    const next = tabs[Math.max(0, Math.min(tabs.length - 1, i + step))];
    if (next) setTab(next.key);
  }, [tabs, tab]);

  const onPlayBar = useCallback((e: { currentTarget: HTMLElement }) => {
    remember(undefined);
    const page = e.currentTarget.closest<HTMLElement>(".ctk-page");
    page?.scrollTo({ top: 0, behavior: "instant" });
    setTimeout(() => page?.scrollTo({ top: 0, behavior: "instant" }), 160);
  }, [remember]);
  const onTile = useCallback<TileFocus>((g, el) => remember(cardSelector(el, g.rom_id)), [remember]);

  const busy = isBusy(game);
  const tags = tagsOf(game, details);
  const ratings = details?.age_ratings.filter((r) => r.cover) ?? [];
  const facts: [string, ReactNode | undefined | ""][] = [
    ["Developer", details?.developers.join(", ")],
    ["Publisher", details?.publishers.join(", ")],
    ["Platform", game.platform],
    ["Release date", details ? formatDate(details.released) : game.release_year ? String(game.release_year) : ""],
    ["Genres", (details?.genres.length ? details.genres : game.genres).join(", ")],
    ["Game modes", details?.game_modes.join(", ")],
    ["Players", details?.player_count],
    ["Series", details?.franchises.join(", ")],
    ["Region", game.regions.join(", ")],
    ["File name", details?.fs_name],
    ["Critic score", details?.critic_score != null ? `${Math.round(details.critic_score)}` : ""],
    ["User score", details?.user_score != null ? `${Math.round(details.user_score)}% · ${scoreWord(details.user_score)}` : ""],
  ];

  return (
    <Page background={C.page} scrollPaddingTop={TABS_TOP + TABS_H + 10}>
      <div ref={root}>
        <Focusable flow-children="column" onButtonDown={onBumper}>
          <HeroArt src={backdrop} height={HERO_H} video={videoOf(details)} fadeTo={C.page}>
            <div style={{ height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: `0 ${GUTTER}px 16px` }}>
              <div style={{ width: 430, height: 121, display: "flex", alignItems: "flex-end" }}>
                <Logo game={game} maxWidth={430} maxHeight={121} textStyle={{ fontSize: 34, fontWeight: 700, lineHeight: "38px", color: "#fff", textShadow: "0 2px 8px rgba(0,0,0,.6)" }} />
              </div>
            </div>
          </HeroArt>

          <div onFocus={onPlayBar}>
            <Focusable flow-children="row" style={{ display: "flex", alignItems: "center", gap: 20, height: 80, boxSizing: "border-box", padding: `16px ${GUTTER}px` }}>
              <ActionButton game={game} progress={progress[game.rom_id]} autoFocus />
              <Stats
                items={[
                  ["Size", formatSize(game.size_bytes)],
                  ["Released", details ? formatDate(details.released) : ""],
                  ["Players", details?.player_count],
                  ["Time to beat", formatHours(details?.hltb.main_story)],
                  ["Last played", details ? formatDate(details.last_played) : ""],
                  ["Status", busy ? statusText(game, progress[game.rom_id]) : ""],
                ]}
              />
              <div style={{ flex: 1 }} />
              <MoreButton game={game} serverUrl={serverUrl} />
            </Focusable>
          </div>

          <div style={{ position: "sticky", top: TABS_TOP, zIndex: 5, height: TABS_H, boxSizing: "border-box", display: "flex", justifyContent: "center", alignItems: "center", background: "rgba(14,20,27,.88)" }}>
            <PillTabs tabs={tabs} active={tab} onChange={setTab} />
          </div>

          <div style={{ minHeight: 380, padding: "16px 0 32px" }}>
            {tab === "overview" && (
              <div className="ctk-fade">
                {details?.summary && (
                  <div style={{ padding: `0 ${GUTTER}px 20px` }}>
                    <SectionHeader size={18} gutter={0}>About</SectionHeader>
                    <div style={{ marginTop: 8 }}>
                      <Summary text={details.summary} lines={6} fontSize={16} maxWidth={1100} />
                    </div>
                  </div>
                )}
                {tags.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: `0 ${GUTTER}px 24px` }}>
                    {tags.map((t) => <TagChip key={t}>{t}</TagChip>)}
                  </div>
                )}
                {more && more.games.length > 0 && (
                  <Shelf title="More like this" section="more" headerSize={18}>
                    {more.games.map((g) => <Capsule key={g.rom_id} game={g} progress={progress[g.rom_id]} onFocus={onTile} onOpen={openGamePage} />)}
                  </Shelf>
                )}
              </div>
            )}
            {tab === "media" && (
              <div className="ctk-fade">
                <MediaSlides video={videoOf(details)} shots={shots} title={game.name} />
              </div>
            )}
            {tab === "details" && (
              <div className="ctk-fade" style={{ padding: `0 ${GUTTER}px` }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "16px 24px" }}>
                  {facts.filter(([, v]) => v).map(([label, value]) => <DetailStat key={label} label={label}>{value}</DetailStat>)}
                  {ratings.length > 0 && (
                    <DetailStat label="Age rating">
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, paddingTop: 2 }}>
                        {ratings.map((r) => <img key={r.cover} src={r.cover} alt={`${r.category} ${r.rating}`} style={{ height: 48, width: "auto", display: "block" }} />)}
                      </div>
                    </DetailStat>
                  )}
                </div>
              </div>
            )}
            {tab === "achievements" && achievements > 0 && (
              <div className="ctk-fade" style={{ padding: `0 ${GUTTER}px` }}>
                <SectionHeader size={18} gutter={0}>Achievements</SectionHeader>
                <div style={{ marginTop: 8, fontSize: 16, color: C.subtitle }}>{achievements} achievements to earn</div>
              </div>
            )}
          </div>
        </Focusable>
      </div>
    </Page>
  );
}
