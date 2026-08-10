import { Component, type ReactNode } from "react";

/**
 * Catches render errors in children and renders `fallback`.
 * Renders nothing if no fallback is provided.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}
