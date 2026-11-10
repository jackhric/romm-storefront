import { CSSProperties, useState } from "react";
import { Game } from "../../api";

/** The game's SteamGridDB logo where it has one, else (or when it fails to load) the name in `textStyle`. */
export function Title({ game, maxWidth, maxHeight, textStyle }: { game: Game; maxWidth: string | number; maxHeight: number; textStyle: CSSProperties }) {
  const [failed, setFailed] = useState<string>();
  const logo = game.art.logo;
  if (!logo || failed === logo) return <div style={textStyle}>{game.name}</div>;
  return (
    <img
      src={logo}
      alt={game.name}
      className="ct-smooth"
      onError={() => setFailed(logo)}
      style={{ display: "block", alignSelf: "flex-start", width: "auto", height: "auto", maxWidth, maxHeight, objectFit: "contain", objectPosition: "left bottom", filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.6))" }}
    />
  );
}
