import { DialogButton, Focusable, ProgressBar } from "@decky/ui";
import { useState } from "react";
import { Game, GameDetails, Progress } from "../../api";
import { formatSize } from "../../state";
import { actionLabel, backdropOf, coverOf, metaLine, percent } from "./model";
import { HeroBackground } from "./HeroBackground";
import { Title } from "./Title";
import { ACCENT, BG, MUTED, PAGE_X } from "./theme";

export const HERO_H = 400;

interface Props {
  game: Game;
  details?: GameDetails;
  progress?: Progress;
  onOpen: (game: Game) => void;
  onButtonFocus: (focused: boolean) => void;
}

export function Hero({ game, details, progress, onOpen, onButtonFocus }: Props) {
  // SteamGridDB's hero, else a landscape screenshot like Steam's hero art; a cover only when the game has neither.
  const backdrop = backdropOf(game, details);
  const cover = coverOf(game);
  const [focused, setFocused] = useState(false);
  const busy = game.status === "queued" || game.status === "downloading";
  const credits = [details?.developers.join(", "), details?.player_count && details.player_count !== "1" ? `${details.player_count} players` : "", game.regions.join(", ")].filter(Boolean).join("  ·  ");
  return (
    <HeroBackground src={backdrop} fadeTo={BG} style={{ height: HERO_H, background: BG }}>
      <div style={{ position: "absolute", left: PAGE_X, right: PAGE_X, bottom: 26, display: "flex", gap: 28, alignItems: "flex-end" }}>
        <div style={{ height: 240, flex: "0 0 auto", borderRadius: 4, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.6)", background: "rgba(255,255,255,0.06)" }}>
          {cover && <img key={game.rom_id} className="ct-fade" src={cover} alt="" style={{ height: "100%", width: "auto", minWidth: 120, maxWidth: 260, objectFit: "cover", display: "block" }} />}
        </div>
        <div key={game.rom_id} className="ct-fade" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", color: MUTED }}>{game.platform}</div>
          {/* The column is ~3/4 of the hero's width, so 55 % of it is ~40 % of the hero. */}
          <Title game={game} maxWidth="55%" maxHeight={Math.round(HERO_H * 0.3)} textStyle={{ fontSize: 32, fontWeight: 700, lineHeight: 1.1, textShadow: "0 2px 8px rgba(0,0,0,0.6)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} />
          <div style={{ fontSize: 14, color: "rgba(223,227,230,0.85)", display: "flex", gap: 16, alignItems: "center" }}>
            <span>{metaLine(game)}</span>
            {game.rating !== null && <Rating value={game.rating} />}
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.4, color: "rgba(223,227,230,0.9)", maxWidth: 760, minHeight: 20, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
            {details ? details.summary : ""}
          </div>
          <Focusable flow-children="row" style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 6 }}>
            <DialogButton
              onClick={() => onOpen(game)}
              onGamepadFocus={() => { setFocused(true); onButtonFocus(true); }}
              onGamepadBlur={() => { setFocused(false); onButtonFocus(false); }}
              onOKActionDescription={actionLabel(game)}
              style={{ width: "auto", minWidth: 180, padding: "12px 28px", fontSize: 15, fontWeight: 600, ...(focused || game.status === "installed" ? {} : { background: ACCENT, color: "#fff" }) }}
            >
              {actionLabel(game)}
            </DialogButton>
            <div style={{ fontSize: 13, color: MUTED, minWidth: 0 }}>
              {busy ? (
                <div style={{ width: 260 }}>
                  <ProgressBar nProgress={percent(progress)} indeterminate={!progress} />
                  <div style={{ marginTop: 4 }}>{progress ? `${formatSize(progress.done_bytes)} of ${formatSize(progress.total_bytes)}${progress.bps ? ` · ${formatSize(progress.bps)}/s` : ""}` : "Starting…"}</div>
                </div>
              ) : (
                <>
                  <div>{game.status === "installed" ? "On this Device · " : ""}{formatSize(game.size_bytes)}{game.multi ? " · several files" : ""}</div>
                  {credits && <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{credits}</div>}
                </>
              )}
            </div>
          </Focusable>
        </div>
      </div>
    </HeroBackground>
  );
}

export function Rating({ value }: { value: number }) {
  const color = value >= 75 ? "#66c0f4" : value >= 50 ? "#b9a074" : "#c15755";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color }}>
      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path fill={color} d="M12 2l3 7 7 .6-5.3 4.7 1.7 7.2L12 17.8 5.6 21.5l1.7-7.2L2 9.6 9 9z" /></svg>
      {value}
    </span>
  );
}
