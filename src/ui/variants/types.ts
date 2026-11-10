import { FC } from "react";
import { Game, Platform, Progress, State } from "../../api";
import { GameData } from "../game/parts";

export interface StoreProps { state: State; progress: Record<number, Progress> }
export interface GameProps { state: State; data: GameData }
export interface ConsoleProps { state: State; platform: Platform; /** The console's games, unsorted. */ games: Game[]; progress: Record<number, Progress> }

/** One storefront layout: the three route pages. Each draws its own page (kit `Page`) and manages its own focus. */
export interface Variant {
  key: string;
  name: string;
  Store: FC<StoreProps>;
  Game: FC<GameProps>;
  Console: FC<ConsoleProps>;
}
