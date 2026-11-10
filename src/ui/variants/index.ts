import { classic } from "./classic";
import { variant as library } from "./library";
import { variant as mashup } from "./mashup";
import { variant as spotlight } from "./spotlight";
import { variant as store } from "./store";
import { Variant } from "./types";

export type { ConsoleProps, GameProps, StoreProps, Variant } from "./types";

/** The layouts in the bake-off; the first is the default. */
export const VARIANTS: Variant[] = [mashup, store, library, spotlight, classic];

export const variantFor = (layout: string): Variant => VARIANTS.find((v) => v.key === layout) ?? VARIANTS[0];
