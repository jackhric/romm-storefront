import { Component, ReactNode } from "react";
import { BG, CSS, PAGE_X, TEXT } from "./theme";

const FOOTER_H = 42;

export function Page({ children }: { children: ReactNode }) {
  return (
    // Ends above Steam's footer so a card scrolled "into view" is never under it; the top stays under the
    // transparent header for the full-bleed hero, with scroll-padding keeping focused rows below it.
    <div className="ct-page" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: FOOTER_H, overflowY: "auto", overflowX: "hidden", scrollPaddingTop: 90, scrollPaddingBottom: 8, background: BG, color: TEXT }}>
      <style>{CSS}</style>
      {children}
    </div>
  );
}

export class Guard extends Component<{ what: string; children: ReactNode }, { error?: string }> {
  state: { error?: string } = {};
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  render() {
    if (this.state.error) {
      return <div style={{ padding: `80px ${PAGE_X}px`, color: TEXT }}>ChickenTender could not draw {this.props.what}: {this.state.error}</div>;
    }
    return this.props.children;
  }
}
