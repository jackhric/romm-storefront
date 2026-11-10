import { CSSProperties, ReactNode } from "react";
import { Game, Progress } from "../../api";
import { formatSize } from "../../state";
import { C, STORE_GLOW } from "../kit";
import { isBusy, statusText } from "../hooks";

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

