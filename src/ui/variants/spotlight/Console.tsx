import { Focusable } from "@decky/ui";
import { useRef } from "react";
import { consoleLogo } from "../../consoleLogos";
import { Page } from "../../kit";
import { useReturnFocus } from "../../hooks";
import { ConsoleProps } from "../types";
import { SpotlightStyle } from "./common";
import { LibraryView } from "./Library";

/** One console's games: the shared library view with the console fixed. */
export function Console({ platform, games, progress }: ConsoleProps) {
  const root = useRef<HTMLDivElement>(null);
  const remember = useReturnFocus(`library-console-${platform.id}`, root, true, "[data-rom]");
  const logo = consoleLogo(platform.slug);
  const title = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 14, verticalAlign: "top" }}>
      {logo && <img src={logo} alt="" style={{ height: 28, maxWidth: 220, objectFit: "contain", display: "block" }} />}
      <span>{platform.name}</span>
    </span>
  );
  return (
    <Page>
      <SpotlightStyle />
      <Focusable ref={root} flow-children="column" style={{ paddingTop: 64, paddingBottom: 24 }}>
        <LibraryView id={`console-${platform.id}`} title={title} games={games} order="sort" progress={progress} remember={remember} />
      </Focusable>
    </Page>
  );
}
