import { State } from "../../api";
import { Page } from "./Page";
import { MUTED } from "./theme";

/** The store pages rely on a paired RomM server and SteamGridDB art; both are set up in the Quick Access panel. */
export const needsSetup = (state: State) => !state.account.paired || !state.sgdb?.configured;

export function SetupPage() {
  return (
    <Page>
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 40px", fontSize: 18, color: MUTED }}>
        Open ChickenTender in the Quick Access menu to finish setup
      </div>
    </Page>
  );
}
