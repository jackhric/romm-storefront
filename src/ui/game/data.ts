// The game page's data.
import { useEffect, useMemo, useState } from "react";
import { Game, GameDetails, Progress, Recommendation, similarGames } from "../../api";
import { useBackendState, useProgress } from "../../state";
import { backdropOf, Row as RowModel, similarRow, useDetailsState } from "../store/model";

export interface GameData {
  game: Game;
  details?: GameDetails;
  /** Details are known (or failed): decide art that depends on them only when this is true. */
  settled: boolean;
  progress: Record<number, Progress>;
  more?: RowModel;
  shots: string[];
  /** SteamGridDB's hero, else the first screenshot (sharp landscape art); the cover only once details say there are no screenshots. */
  backdrop?: string;
  serverUrl: string;
}

export function useGameData(romId: number) {
  const state = useBackendState();
  const progress = useProgress();
  const game = state?.library.games.find((g) => g.rom_id === romId);
  const { details, settled } = useDetailsState(romId, true);
  const [similar, setSimilar] = useState<Recommendation[]>();
  useEffect(() => {
    let live = true;
    similarGames(romId).then((r) => live && setSimilar(r)).catch(() => live && setSimilar([]));
    return () => {
      live = false;
    };
  }, [romId]);
  const games = state?.library.games;
  const more = useMemo(() => (games && similar ? similarRow(games, similar, romId) : undefined), [games, similar, romId]);
  const shots = details?.screenshots ?? [];
  const data: GameData | undefined = game && {
    game,
    details,
    settled,
    progress,
    more,
    shots,
    backdrop: backdropOf(game, details),
    serverUrl: state?.server.url ?? "",
  };
  return { state, data };
}
