// The layout from before the bake-off, kept as the baseline to compare against.
import { ConsoleView } from "../ConsolePage";
import { PageXbox } from "../game/PageXbox";
import { Storefront } from "../Store";
import { Page } from "../store/Page";
import { Variant } from "./types";

export const classic: Variant = {
  key: "classic",
  name: "Classic",
  Store: () => <Storefront />,
  Game: ({ data }) => <Page><PageXbox data={data} /></Page>,
  Console: ({ platform }) => <ConsoleView platformId={platform.id} />,
};
