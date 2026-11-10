import { Focusable, NavEntryPositionPreferences } from "@decky/ui";
import { memo, ReactNode, useMemo, useRef, useState } from "react";
import { Game, Platform } from "../../api";
import { reveal } from "./Card";
import { platformLogo } from "./model";
import { CARD_GAP, MUTED, PAGE_X, STEAM, TILE_FACE, TILE_LIGHT } from "./theme";

const TILE = 160;

interface Props {
  platforms: Platform[];
  games: Game[];
  onFocus: (platformId: number, el: HTMLDivElement | null) => void;
  onOpen: (platformId: number) => void;
}

export const Consoles = memo(function Consoles({ platforms, games, onFocus, onOpen }: Props) {
  const consoles = useMemo(() => {
    const counts = new Map<number, number>();
    for (const g of games) counts.set(g.platform_id, (counts.get(g.platform_id) ?? 0) + 1);
    return platforms
      .filter((p) => counts.get(p.id))
      .map((p) => ({ platform: p, count: counts.get(p.id) ?? 0 }))
      .sort((a, b) => a.platform.name.localeCompare(b.platform.name));
  }, [platforms, games]);
  if (!consoles.length) return null;

  return (
    <div className="ct-consoles" data-section="consoles" style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, padding: `0 ${PAGE_X}px`, marginBottom: 2 }}>
        <div style={{ fontSize: 20, fontWeight: 500, letterSpacing: 0.2 }}>By Console</div>
        <div style={{ fontSize: 12, color: MUTED }}>{consoles.length} consoles</div>
      </div>
      <Focusable
        className="ct-strip"
        flow-children="row"
        navEntryPreferPosition={NavEntryPositionPreferences.MAINTAIN_X}
        style={{ display: "flex", gap: CARD_GAP, overflowX: "hidden", padding: `14px ${PAGE_X}px 16px`, scrollPaddingLeft: PAGE_X, scrollPaddingRight: PAGE_X }}
      >
        {consoles.map(({ platform, count }) => <Tile key={platform.id} platform={platform} count={count} onFocus={onFocus} onOpen={onOpen} />)}
      </Focusable>
    </div>
  );
});

function Tile({ platform, count, onFocus, onOpen }: { platform: Platform; count: number; onFocus: Props["onFocus"]; onOpen: Props["onOpen"] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);
  return (
    <Focusable
      ref={ref}
      className="ct-card"
      data-platform={platform.id}
      onActivate={() => onOpen(platform.id)}
      onGamepadFocus={() => {
        setFocused(true);
        onFocus(platform.id, ref.current);
        // The whole strip, so the grown tile clears Steam's footer and the row title stays in view.
        ref.current?.closest(".ct-consoles")?.scrollIntoView({ block: "nearest", behavior: "instant" });
        reveal(ref.current);
      }}
      onGamepadBlur={() => setFocused(false)}
      onOKActionDescription="Open"
      style={{ flex: "0 0 auto", borderRadius: 6, transform: focused ? "scale(1.06)" : "none", zIndex: focused ? 1 : undefined }}
    >
      <ConsoleFace platform={platform} size={TILE} focused={focused}>
        <div style={{ fontSize: 13, fontWeight: 500, lineHeight: "16px", color: focused ? STEAM.title : STEAM.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{platform.name}</div>
        <div style={{ fontSize: 11, lineHeight: "14px", color: STEAM.muted }}>{count} {count === 1 ? "game" : "games"}</div>
      </ConsoleFace>
    </Focusable>
  );
}

/** The square console face: Steam's dark surface, the logo lit from behind, an optional caption at the bottom. */
export function ConsoleFace({ platform, size, focused, children }: { platform: Platform; size: number; focused?: boolean; children?: ReactNode }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const logo = logoFailed ? "" : platformLogo(platform);
  const pad = Math.round(size * 0.07);
  return (
    <div
      style={{
        width: size,
        height: size,
        boxSizing: "border-box",
        borderRadius: 6,
        background: TILE_FACE,
        boxShadow: focused ? "0 0 0 2px #fff, 0 6px 18px rgba(0,0,0,0.6)" : "inset 0 0 0 1px rgba(255,255,255,0.06), 0 2px 8px rgba(0,0,0,0.5)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        padding: `${pad}px ${pad}px ${Math.round(pad * 0.9)}px`,
      }}
    >
      <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center", background: logo ? TILE_LIGHT : undefined, margin: `0 -${pad}px` }}>
        {logo ? (
          // IGDB pads older logos to a 160 px square of transparency, so the image takes the full height to show them large.
          <img src={logo} alt="" onError={() => setLogoFailed(true)} style={{ height: "100%", maxWidth: "86%", objectFit: "contain", display: "block", filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.3))" }} />
        ) : (
          <div style={{ color: STEAM.title, fontSize: Math.round(size / 9), fontWeight: 700, textAlign: "center", lineHeight: 1.15, padding: `0 ${pad}px` }}>{platform.name}</div>
        )}
      </div>
      {children && <div style={{ textAlign: "center", marginTop: 4 }}>{children}</div>}
    </div>
  );
}
