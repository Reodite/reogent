// Browser-side cache of per-pane UI state, so switching tools (or reloading)
// restores what the user had — the prereq tree they built, the course they were
// looking up, the calendar month, the map camera/selection. One localStorage
// key holding { [paneId]: state }.
//
// Writes are PATCHES: `cachePaneState` merges into the stored record instead of
// replacing it, so surfaces that persist through a side channel (the campus
// map's camera + selected building) survive the shell writing `{ highlight }`
// for the same pane, and vice versa.

import type { PaneState } from "@/src/components/shell/pane-registry";

const KEY = "reodite.pane-state";

// ponytail: read+parse per call, no memo — payloads are tiny and a memo would
// leak state across vitest cases sharing the module instance.
function load(): Record<string, PaneState> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, PaneState>) : {};
  } catch {
    return {};
  }
}

/** Last-known state for a pane, or undefined when nothing was cached. */
export function getCachedPaneState(id: string): PaneState | undefined {
  const state = load()[id];
  return state && typeof state === "object" ? state : undefined;
}

/** Merges `patch` into the pane's cached state. Values must be JSON-serializable. */
export function cachePaneState(id: string, patch: PaneState): void {
  if (typeof window === "undefined") return;
  const store = load();
  store[id] = { ...store[id], ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Quota exceeded or storage unavailable — the session just won't persist.
  }
}
