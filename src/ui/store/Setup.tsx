import { State } from "../../api";
import { C, Page } from "../kit";

/** The store pages rely on a paired RomM server and SteamGridDB art; both are set up in the Quick Access panel. */
export const needsSetup = (state: State) => !state.account.paired || !state.sgdb?.configured;

export function SetupPage() {
  return (
    <Page>
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 40px", fontSize: 18, color: C.subtitle }}>
        Open ChickenTender in the Quick Access menu to finish setup
      </div>
    </Page>
  );
}
