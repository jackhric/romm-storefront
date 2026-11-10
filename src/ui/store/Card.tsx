import { Focusable, ProgressBar } from "@decky/ui";
import { ReactNode, useRef, useState } from "react";
import { Game, Progress } from "../../api";
import { Caption } from "./Caption";
import { coverOf, percent } from "./model";
import { ACCENT, CARD_W } from "./theme";

interface Props {
  game: Game;
  progress?: Progress;
  onFocus: (game: Game, el: HTMLDivElement | null) => void;
  onOpen: (game: Game) => void;
  /** Shown instead of the status line while the game is not downloading. */
  note?: string;
  width?: number;
  onSecondary?: () => void;
  secondaryLabel?: string;
}

export function Card({ game, progress, onFocus, onOpen, note, width = CARD_W, onSecondary, secondaryLabel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Own focus state for the scale: a focusClassName was dropped when a progress event re-rendered the card.
  const [focused, setFocused] = useState(false);
  const busy = game.status === "queued" || game.status === "downloading";
  return (
    <Focusable
      ref={ref}
      className="ct-card"
      data-rom={game.rom_id}
      onGamepadFocus={() => {
        setFocused(true);
        onFocus(game, ref.current);
        reveal(ref.current);
      }}
      onGamepadBlur={() => setFocused(false)}
      onActivate={() => onOpen(game)}
      onOKActionDescription="Details"
      onSecondaryButton={onSecondary}
      onSecondaryActionDescription={onSecondary ? secondaryLabel : undefined}
      style={{ width, flex: "0 0 auto", display: "flex", flexDirection: "column", borderRadius: 4, transform: focused ? "scale(1.1)" : "none", zIndex: focused ? 1 : undefined }}
    >
      <div style={{ width: "100%", aspectRatio: "3 / 4", background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden", position: "relative", boxShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
        {coverOf(game) && <img src={coverOf(game)} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
        {game.status === "installed" && <Badge color="#4c9a2a">{check}</Badge>}
        {game.status === "partial" && <Badge color={ACCENT}>Resume</Badge>}
        {game.status === "queued" && <Badge color="rgba(0,0,0,0.75)">Queued</Badge>}
        {busy && (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", padding: "4px 6px" }}>
            <ProgressBar nProgress={percent(progress)} indeterminate={!progress} />
          </div>
        )}
      </div>
      <Caption game={game} progress={progress} note={note} focused={focused} />
    </Focusable>
  );
}

// Steam also scrolls the focused element into view (smoothly, ~80 ms later; the page's scroll-padding keeps the
// row title and the footer clear for both). This one is instant because Steam draws its focus ring where the
// card is at focus time, and runs again on the next frame in case the card had not been laid out yet.
export function reveal(el: HTMLDivElement | null) {
  if (!el) return;
  const go = () => el.scrollIntoView({ block: "nearest", inline: "center", behavior: "instant" });
  go();
  requestAnimationFrame(go);
}

const check = (
  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
    <path d="M2 6.5 L4.8 9.2 L10 3.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function Badge({ color, children }: { color: string; children: ReactNode }) {
  return (
    <div style={{ position: "absolute", right: 5, top: 5, background: color, borderRadius: 10, padding: "2px 7px", fontSize: 10, fontWeight: 600, lineHeight: "14px", display: "flex", alignItems: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.6)" }}>
      {children}
    </div>
  );
}
