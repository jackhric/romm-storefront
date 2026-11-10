import { Focusable } from "@decky/ui";
import { CSSProperties, memo, ReactNode, useRef } from "react";
import { Game, Progress } from "../../../api";
import { formatSize } from "../../../state";
import { C, STORE_GLOW, WideArt } from "../../kit";
import { isBusy, reveal, scoreWord, statusText } from "../../hooks";

export const PAGE_BG = `${STORE_GLOW}, ${C.storePage}`;
export const noop = () => {};

export const SV_CSS = `
.sv-nav { display: flex; align-items: center; box-sizing: border-box; height: 30px; padding: 0 10px; border-radius: 2px; font-size: 13px; font-weight: 500;
  color: rgb(220,222,223); white-space: nowrap; }
.sv-nav.gpfocus { background: #fff; color: ${C.ink}; }
.sv-hero { position: relative; flex: 0 0 auto; background: rgba(0,0,0,.2); box-shadow: 0 3px 6px rgba(0,0,0,.24); }
.sv-tab { box-sizing: border-box; display: flex; align-items: center; height: 46px; padding: 0 12px; border-radius: 3px; font-size: 14px; font-weight: 500; color: #fff;
  background: rgba(179,218,255,.08); white-space: nowrap; border-bottom: 2px solid transparent; }
.sv-tab.sv-on { background: rgba(26,160,255,.125); border-bottom-color: ${C.blue}; }
.sv-row { box-sizing: border-box; display: flex; flex: 0 0 auto; overflow: hidden; background: rgba(179,218,255,.08); transition: background-color .12s; }
.sv-row.gpfocus { background: rgba(179,218,255,.2); }
.sv-row img.sv-img { width: 100%; height: 100%; object-fit: cover; display: block; }
`;

const ellipsis: CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

export function Heading({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontSize: 14, fontWeight: 700, lineHeight: "22px", letterSpacing: 0.5, textTransform: "uppercase", color: C.title, borderBottom: "1px solid rgba(255,255,255,.1)", marginBottom: 8, ...style }}>{children}</div>;
}

export function StatusTag({ game, progress, dark }: { game: Game; progress?: Progress; dark?: boolean }) {
  if (game.status === "installed" && !dark) {
    return <div style={{ padding: "0 8px", height: 24, lineHeight: "24px", background: C.lime, color: C.ink, fontSize: 12, fontWeight: 700, letterSpacing: 0.3, whiteSpace: "nowrap" }}>ON THIS DEVICE</div>;
  }
  const text = isBusy(game) ? statusText(game, progress) : game.status === "installed" ? "On this Device" : formatSize(game.size_bytes);
  return <div style={{ padding: "0 10px", height: 28, lineHeight: "28px", borderRadius: 2, background: C.priceChip, color: "#fff", fontSize: 14, whiteSpace: "nowrap" }}>{text}</div>;
}

interface RowProps {
  game: Game;
  progress?: Progress;
  width: number;
  height: number;
  showRating?: boolean;
  autoFocus?: boolean;
  onFocus: (game: Game, el: HTMLDivElement | null, first: boolean) => void;
  onOpen: (game: Game) => void;
}

export const GameRow = memo(function GameRow({ game, progress, width, height, showRating, autoFocus, onFocus, onOpen }: RowProps) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <Focusable
      ref={ref}
      className="sv-row ctk-ring"
      noFocusRing
      data-rom={game.rom_id}
      {...(autoFocus ? { "data-autofocus": "" } : {})}
      onActivate={() => onOpen(game)}
      onOKActionDescription="View"
      onGamepadFocus={() => {
        reveal(ref.current);
        onFocus(game, ref.current, !!autoFocus);
      }}
      style={{ width, height }}
    >
      <div style={{ flex: "0 0 160px", width: 160, height, overflow: "hidden" }}>
        <WideArt game={game} />
      </div>
      <div style={{ flex: 1, minWidth: 0, padding: "6px 14px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ fontSize: 18, lineHeight: "22px", color: "#fff", ...ellipsis }}>{game.name}</div>
        <div style={{ fontSize: 14, lineHeight: "20px", color: C.storeText, ...ellipsis }}>{game.genres.slice(0, 4).join(", ") || game.platform}</div>
        {game.release_year && <div style={{ fontSize: 14, lineHeight: "20px", color: "rgb(101,128,165)" }}>Released: {game.release_year}</div>}
      </div>
      <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", alignSelf: "flex-end", gap: 12, padding: "0 12px 8px 0" }}>
        {showRating && game.rating !== null && <div style={{ fontSize: 14, color: C.blue, whiteSpace: "nowrap" }}>{scoreWord(game.rating)} ({game.rating})</div>}
        <StatusTag game={game} progress={progress} />
      </div>
    </Focusable>
  );
});
