// The text under a cover: nothing at rest, the title and one meta line for the focused card only (TV style).
// The box always reserves its height, so focusing never shifts the row.
import { Game, Progress } from "../../api";
import { formatSize } from "../../state";
import { percent } from "./model";
import { bpx, MUTED } from "./theme";

const TITLE = { fontSize: bpx(16), lineHeight: `${bpx(20)}px` };
const META = { fontSize: bpx(13), lineHeight: `${bpx(16)}px`, color: MUTED };
const ellipsis = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } as const;

interface Props {
  game: Game;
  progress?: Progress;
  /** Shown instead of the status meta, e.g. a recommendation's reason. */
  note?: string;
  focused: boolean;
}

export function Caption({ game, progress, note, focused }: Props) {
  return (
    <div style={{ height: bpx(48), paddingTop: bpx(8), boxSizing: "border-box" }}>
      {focused && (
        <>
          <div style={{ ...TITLE, ...ellipsis }}>{game.name}</div>
          <div style={{ ...META, ...ellipsis }}>{note || focusMeta(game, progress)}</div>
        </>
      )}
    </div>
  );
}

function focusMeta(game: Game, p?: Progress): string {
  const system = game.slug.toUpperCase();
  if (p && p.status === "downloading") return `Downloading ${Math.round(percent(p))} %`;
  if (game.status === "queued") return "Queued";
  if (game.status === "installed") return `${system} · On this Device`;
  return [system, game.release_year, formatSize(game.size_bytes)].filter(Boolean).join(" · ");
}
