// A request to open the store's Browse section already filtered, e.g. from a game page's "View more".
import { Navigation } from "@decky/ui";
import { STORE_ROUTE } from "../../api";

export interface BrowseFilter {
  query?: string;
  genre?: string;
  platformId?: number;
}

let pending: BrowseFilter | undefined;

/** Opens the store on Browse with this filter applied. */
export function openBrowse(filter: BrowseFilter) {
  pending = filter;
  Navigation.Navigate(STORE_ROUTE);
}

/** The filter a caller asked for, handed over once; the store page reads it when it mounts. */
export function takeBrowseRequest(): BrowseFilter | undefined {
  const request = pending;
  pending = undefined;
  return request;
}
