import { Game, Platform, Progress, State } from "../api";
import { GameData } from "./game/data";

export interface StoreProps { state: State; progress: Record<number, Progress> }
export interface GameProps { state: State; data: GameData }
export interface ConsoleProps { state: State; platform: Platform; /** The console's games, unsorted. */ games: Game[]; progress: Record<number, Progress> }
