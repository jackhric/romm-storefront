import { Focusable, NavEntryPositionPreferences } from "@decky/ui";
import { CSSProperties, ReactNode, useCallback, useRef, useState, useEffect } from "react";
import { formatSize } from "../../state";
import { ActionButton, C, InfoBox, InfoRow, MediaSlides, MoreButton, Page, PageBackdrop, Shelf, Summary, TagChip, TileFocus, WideArt, WideCapsule } from "../kit";
import { openBrowse } from "../store/browse";
import { cardSelector, formatDate, formatHours, openGamePage, scoreWord, statusText, tagsOf, useReturnFocus, useVideo, holdPageTop } from "../hooks";
import { GameProps } from "../pages";
import { Heading, noop, PAGE_BG, SV_CSS } from "../store/styles";

const GUTTER = 61;
const BOX_BG: CSSProperties = { background: "rgba(14,20,27,.5)", height: "100%" };
const join = (v?: string[]) => (v && v.length ? v.join(", ") : "");

function ScoreLine({ label, score, count }: { label: string; score: number; count?: number }) {
  return (
    <div style={{ fontSize: 15, lineHeight: "26px" }}>
      <span style={{ color: C.description }}>{label}: </span>
      <span style={{ color: C.blue }}>{scoreWord(score)}</span>
      <span> ({score}%{count ? ` of ${count.toLocaleString()}` : ""})</span>
    </div>
  );
}

function Feature({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ background: C.storeRow, padding: "6px 12px", marginBottom: 2 }}>
      <div style={{ fontSize: 12, lineHeight: "16px", color: C.description, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 14, lineHeight: "20px", color: C.storeText, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>{children}</div>
    </div>
  );
}

export function StoreGame({ data }: GameProps) {
  const { game, details, settled, progress, more, shots, backdrop, serverUrl } = data;
  const root = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  // Anything focused in the head of the page (the button row, a picture) brings the whole head back into view.
  useEffect(() => {
    const el = head.current;
    if (!el) return;
    const toTop = () => holdPageTop(el);
    el.addEventListener("focusin", toTop);
    return () => el.removeEventListener("focusin", toTop);
  }, []);
  const remember = useReturnFocus(`store-game-${game.rom_id}`, root, true);
  const onTile = useCallback<TileFocus>((g, el) => remember(cardSelector(el, g.rom_id)), [remember]);
  const video = useVideo(details, "large");
  const p = progress[game.rom_id];
  const tags = tagsOf(game, details).slice(0, 18);
  const genre = game.genres[0];
  const ageRatings = details?.age_ratings ?? [];

  const boxes: ReactNode[] = [];
  const user = details?.user_score ?? null;
  const critic = details?.critic_score ?? null;
  if (user !== null || critic !== null || game.rating !== null) {
    boxes.push(
      <InfoBox key="reviews" title="Reviews" style={BOX_BG}>
        {user !== null && <ScoreLine label="Users" score={user} count={details?.user_score_count} />}
        {critic !== null && <ScoreLine label="Critics" score={critic} />}
        {user === null && critic === null && game.rating !== null && <ScoreLine label="Rating" score={game.rating} />}
      </InfoBox>,
    );
  }
  boxes.push(
    <InfoBox key="device" title="On this Device" style={BOX_BG}>
      <InfoRow label="Status">{game.status === "available" ? "Not downloaded" : statusText(game, p)}</InfoRow>
      <InfoRow label="Size">{`${formatSize(game.size_bytes)}${game.multi ? " · several files" : ""}`}</InfoRow>
      <InfoRow label="File">{details?.fs_name}</InfoRow>
    </InfoBox>,
  );
  if (tags.length) {
    boxes.push(
      <InfoBox key="tags" title="Tags" style={BOX_BG}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, paddingTop: 4 }}>{tags.map((t) => <TagChip key={t}>{t}</TagChip>)}</div>
      </InfoBox>,
    );
  }
  boxes.push(
    <InfoBox key="info" title="Game info" style={BOX_BG}>
      <InfoRow label="Developer">{join(details?.developers)}</InfoRow>
      <InfoRow label="Publisher">{join(details?.publishers)}</InfoRow>
      <InfoRow label="Released">{(details?.released && formatDate(details.released)) || (game.release_year ? String(game.release_year) : "")}</InfoRow>
      <InfoRow label="Platform">{game.platform}</InfoRow>
      <InfoRow label="Players">{details?.player_count}</InfoRow>
      <InfoRow label="Time to beat">{formatHours(details?.hltb.main_story)}</InfoRow>
    </InfoBox>,
  );
  const lines: ReactNode[][] = [];
  for (let i = 0; i < boxes.length; i += 2) lines.push(boxes.slice(i, i + 2));

  const features: [string, ReactNode][] = [];
  const push = (label: string, value: ReactNode) => value && features.push([label, value]);
  push("Game modes", join(details?.game_modes));
  push("Perspectives", join(details?.perspectives));
  push("Series", join(details?.franchises));
  push("Region", join(game.regions));
  if (ageRatings.length) {
    push("Age ratings", ageRatings.map((a) => (a.cover ? <img key={a.rating + a.category} src={a.cover} alt={`${a.category} ${a.rating}`} style={{ height: 36 }} /> : <span key={a.rating + a.category}>{a.category} {a.rating}</span>)));
  }
  push("Achievements", details?.achievements ? `${details.achievements} achievements` : "");
  const summary = details?.summary.trim();
  const [dice] = useState(Math.random);
  // Latched: the background is chosen once, after details are known, and never replaced.
  const chosen = useRef<string | undefined>(undefined);
  if (!chosen.current && settled) chosen.current = (shots.length ? shots[Math.floor(dice * shots.length)] : backdrop) || undefined;
  const blurred = chosen.current;

  return (
    <Page background={PAGE_BG} scrollPaddingTop={60}>
      <style>{SV_CSS}</style>
      <PageBackdrop src={blurred ?? ""} />
      <div ref={root} style={{ position: "relative", zIndex: 1, color: C.storeText, paddingBottom: 40 }}>
        <Focusable flow-children="column">
          <Focusable ref={head} flow-children="row" style={{ display: "flex", gap: 11, paddingTop: 96, paddingLeft: GUTTER, marginBottom: 14 }}>
            <div style={{ flex: "0 0 370px", width: 370, height: 457, display: "flex", flexDirection: "column" }}>
              <WideArt game={game} style={{ aspectRatio: "auto", height: 173, flex: "0 0 auto" }} />
              <div style={{ boxSizing: "border-box", flex: 1, minHeight: 0, padding: "8px 12px 12px", background: C.storePanel, display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: 22, fontWeight: 700, lineHeight: "29px", color: C.title }}>{game.name}</div>
                {!settled && <div style={{ height: 120 }} />}
                {summary && <div style={{ fontSize: 15, lineHeight: "20px", color: C.body, height: 120, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 6, WebkitBoxOrient: "vertical" }}>{summary}</div>}
                <Focusable flow-children="row" style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                  <ActionButton game={game} progress={p} blue autoFocus style={{ flex: 1, minWidth: 0 }} />
                  <MoreButton game={game} serverUrl={serverUrl} />
                </Focusable>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0, margin: "-4px 0" }}>
              {!settled ? (
                <div className="ctk-skel" style={{ width: 813, height: 457, margin: "4px 0" }} />
              ) : video || shots.length ? (
                <MediaSlides video={video} shots={shots} title={game.name} logo={game.art.logo} gutter={GUTTER} padLeft={0} />
              ) : (
                <div style={{ width: 813, height: 457, margin: "4px 0", background: C.ink }}>
                  {backdrop && <img src={backdrop} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                </div>
              )}
            </div>
          </Focusable>

          {!settled && <div style={{ height: 330 }} />}
          {settled && <div className="ctk-fade" style={{ padding: `0 ${GUTTER}px`, marginBottom: 24 }}>
            <Focusable flow-children="column" navEntryPreferPosition={NavEntryPositionPreferences.MAINTAIN_X} style={{ display: "flex", flexDirection: "column", gap: 17 }}>
              {lines.map((line, i) => (
                <Focusable key={i} flow-children="row" navEntryPreferPosition={NavEntryPositionPreferences.MAINTAIN_X} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 17 }}>
                  {line.map((box, j) => <Focusable key={j} className="ctk-ring" noFocusRing onActivate={noop} style={{ minWidth: 0 }}>{box}</Focusable>)}
                </Focusable>
              ))}
            </Focusable>
          </div>}

          {settled && (summary || features.length > 0) && (
            <Focusable flow-children="row" style={{ display: "flex", gap: 24, padding: `0 ${GUTTER}px`, marginBottom: 28, alignItems: "flex-start" }}>
              <div style={{ flex: "1 1 0", minWidth: 0 }}>
                {summary && (
                  <>
                    <Heading>About this game</Heading>
                    <Summary text={summary} lines={10} fontSize={16} maxWidth={900} />
                  </>
                )}
              </div>
              {features.length > 0 && (
                <Focusable className="ctk-ring" noFocusRing onActivate={noop} style={{ flex: "0 0 355px", width: 355 }}>
                  <Heading>Features</Heading>
                  {features.map(([label, value]) => <Feature key={label} label={label}>{value}</Feature>)}
                </Focusable>
              )}
            </Focusable>
          )}

          {more && (
            <Shelf title="More like this" section="more" gutter={GUTTER}>
              {more.games.map((g) => <WideCapsule key={g.rom_id} game={g} width={251} progress={progress[g.rom_id]} onFocus={onTile} onOpen={openGamePage} />)}
              <Focusable className="ctk-ring" noFocusRing onActivate={() => openBrowse(genre ? { genre } : { platformId: game.platform_id })} onOKActionDescription="Browse" style={{ flex: "0 0 auto", width: 160, height: 151, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 12, boxSizing: "border-box", background: C.storeRow, color: C.title, fontSize: 16 }}>
                {`View more ${genre ?? game.platform} games`}
              </Focusable>
            </Shelf>
          )}
        </Focusable>
      </div>
    </Page>
  );
}
