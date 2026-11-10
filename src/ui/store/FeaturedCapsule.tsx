import { Focusable } from "@decky/ui";
import { memo, useRef } from "react";
import { Game, Progress } from "../../api";
import { AmbientVideo, Art, backdropArt, C, CardBackdrop, TagChip, WideArt } from "../kit";
import { reveal, scoreWord, VideoSource } from "../hooks";
import { StatusTag } from "./styles";

const HERO_W = 392;

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
      <div style={{ boxSizing: "border-box", height: 187, padding: "14px 14px 12px", background: C.storePanel, position: "relative", isolation: "isolate", overflow: "hidden", display: "flex", flexDirection: "column", minWidth: 0 }}>
        <CardBackdrop src={backdropArt(game)} style={{ zIndex: -1 }} />
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

