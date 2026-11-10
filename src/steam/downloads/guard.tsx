import { routerHook } from "@decky/api";
import { DialogButton } from "@decky/ui";
import { Component, ReactNode } from "react";
import { tweak, Undo, warnOnce } from "../core/tweak";

export const DOWNLOADS_ROUTE = "/library/downloads";

type Props = { children: ReactNode; onError(): void; onRetry(): void };

/**
 * Keeps a failure on the Downloads page (a bad record of ours, or anything else) inside that page. Leaving the page
 * unmounts it, so coming back starts fresh; Retry renders the page again in place.
 */
class DownloadsBoundary extends Component<Props, { error?: string }> {
  state: { error?: string } = {};
  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  componentDidCatch(err: unknown) {
    warnOnce("downloads page", err);
    try {
      this.props.onError();
    } catch {
      // the fallback still renders
    }
  }
  componentWillUnmount() {
    if (this.state.error === undefined) return;
    try {
      this.props.onRetry();
    } catch (err) {
      warnOnce("downloads retry", err);
    }
  }
  render() {
    if (this.state.error === undefined) return this.props.children;
    return (
      <div style={{ padding: "60px 40px", display: "flex", flexDirection: "column", gap: 16, maxWidth: 640 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Downloads could not be shown</div>
        <div style={{ opacity: 0.8 }}>
          ChickenTender took its downloads off this page. Steam's own downloads are not affected. ({this.state.error})
        </div>
        <DialogButton
          style={{ width: 200 }}
          onClick={() => {
            try {
              this.props.onRetry();
            } catch (err) {
              warnOnce("downloads retry", err);
            }
            this.setState({ error: undefined });
          }}
        >
          Retry
        </DialogButton>
      </div>
    );
  }
}

/** Wraps the Downloads route's content in our error boundary. */
export function guardDownloadsPage(onError: () => void, onRetry: () => void): Undo {
  return tweak("downloads-page-guard", () => {
    if (typeof routerHook?.addPatch !== "function") return;
    const patch = routerHook.addPatch(DOWNLOADS_ROUTE, (route: any) => {
      if (!route?.children || route.children.type === DownloadsBoundary) return route;
      return {
        ...route,
        children: (
          <DownloadsBoundary onError={onError} onRetry={onRetry}>
            {route.children}
          </DownloadsBoundary>
        ),
      };
    });
    return () => routerHook.removePatch(DOWNLOADS_ROUTE, patch);
  });
}
