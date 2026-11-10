import { Variant } from "../types";
import { StoreConsole } from "./Console";
import { StoreGame } from "./Game";
import { StoreHome } from "./Home";

export const variant: Variant = { key: "store", name: "Steam Store", Store: StoreHome, Game: StoreGame, Console: StoreConsole };
