import { Component, ReactNode } from "react";
import { C, GUTTER } from "./tokens";

/** Keeps a page that fails to draw from taking Steam's window with it. */
export class Guard extends Component<{ what: string; children: ReactNode }, { error?: string }> {
  state: { error?: string } = {};
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  render() {
    if (this.state.error) {
      return <div style={{ padding: `80px ${GUTTER}px`, color: C.title }}>ChickenTender could not draw {this.props.what}: {this.state.error}</div>;
    }
    return this.props.children;
  }
}
