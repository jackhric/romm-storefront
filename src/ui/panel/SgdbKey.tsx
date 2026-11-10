import { ButtonItem, Field, Navigation, PanelSection, PanelSectionRow, TextField } from "@decky/ui";
import { useState } from "react";
import { cancelSgdbSignin, SGDB_HOME, SgdbSigninStage, setSgdbKey, startSgdbSignin, State } from "../../api";

const STAGE_TEXT: Partial<Record<SgdbSigninStage, string>> = {
  opening: "Opening SteamGridDB…",
  login: "Signing in to SteamGridDB…",
  consent: "Press Sign In on the Steam page",
  reading: "Reading your API key…",
  verifying: "Checking the key…",
};

/** The second setup step: ChickenTender's storefront relies on SteamGridDB art, so a key is required. */
export function SgdbKey({ state }: { state: State }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const signin = state.sgdb.signin;
  const save = async () => {
    setBusy(true);
    try {
      await setSgdbKey(key.trim());
    } catch {
      // the state event carries the error
    } finally {
      setBusy(false);
    }
  };
  const signIn = () => {
    Navigation.NavigateToExternalWeb(SGDB_HOME);
    startSgdbSignin().catch(() => {});
  };
  return (
    <PanelSection title="SteamGridDB">
      <PanelSectionRow>
        <Field description="ChickenTender uses SteamGridDB for game artwork. Sign in with your Steam account and ChickenTender fetches your SteamGridDB API key itself." />
      </PanelSectionRow>
      {signin?.active ? (
        <>
          <PanelSectionRow>
            <Field label="Sign in with Steam" description={STAGE_TEXT[signin.stage] ?? "Working…"} />
          </PanelSectionRow>
          <PanelSectionRow>
            <ButtonItem layout="below" onClick={() => cancelSgdbSignin().catch(() => {})}>Cancel</ButtonItem>
          </PanelSectionRow>
        </>
      ) : (
        <PanelSectionRow>
          <ButtonItem layout="below" bottomSeparator="none" onClick={signIn}
            description={signin?.stage === "failed" ? signin.error : undefined}>
            Sign in with Steam
          </ButtonItem>
        </PanelSectionRow>
      )}
      <PanelSectionRow>
        <Field label="Or paste a key" description="steamgriddb.com → your profile → Preferences → API" />
      </PanelSectionRow>
      <PanelSectionRow>
        <TextField label="API key" bIsPassword value={key} onChange={(e) => setKey(e.target.value)} />
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" disabled={busy || !key.trim()} onClick={save}>Save</ButtonItem>
      </PanelSectionRow>
      {state.sgdb?.error && (
        <PanelSectionRow>
          <Field description={state.sgdb.error} />
        </PanelSectionRow>
      )}
    </PanelSection>
  );
}
