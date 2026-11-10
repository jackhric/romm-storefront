import { Variant } from "../types";
import { Console } from "./Console";
import { Game } from "./Game";
import { Store } from "./Store";

export const variant: Variant = { key: "library", name: "Library", Store, Game, Console };
