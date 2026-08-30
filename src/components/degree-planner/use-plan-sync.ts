"use client";

// Syncs the planner store with the account's server-side plan. Signed-in
// users get their plan back on any device; guests stay localStorage-only.
//
// Policy: on first mount per page load the server copy wins (it's the
// cross-device source of truth); if the server has nothing yet, the local
// plan is adopted upward so nothing already built is lost. After hydration,
// every change to the persisted slice is pushed with a debounce, and a
// pending push is flushed when the pane unmounts.
// ponytail: last-write-wins, no conflict merge — fine for a single user
// editing one board; add updated_at reconciliation if simultaneous
// multi-device editing ever matters.
import { useAppAuth } from "@/src/components/auth/app-auth";
import { useApi } from "@/src/components/providers";
import { useEffect } from "react";
import { persistedSlice, usePlanner, type PersistedPlan } from "./planner-store";

const SAVE_DEBOUNCE_MS = 1000;

// One server hydration per signed-in user per page load. Module-level so pane
// remounts (tab swaps) don't re-pull a stale server copy over fresher local
// edits that were still inside the debounce window.
let hydratedFor: string | null = null;

function samePersistedSlice(a: PersistedPlan, b: PersistedPlan): boolean {
  // The store replaces fields immutably, so reference equality per field is an
  // exact change signal — no deep compare needed.
  return (Object.keys(a) as (keyof PersistedPlan)[]).every((k) => a[k] === b[k]);
}

/** True when the payload looks like a plan this store version can apply. */
function isApplicablePlan(plan: unknown): plan is Partial<PersistedPlan> {
  return !!plan && typeof plan === "object" && Array.isArray((plan as { years?: unknown }).years);
}

export function usePlanSync(): void {
  const api = useApi();
  const { user, isGuest } = useAppAuth();
  const userId = !isGuest && user ? user.userId : null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: PersistedPlan | null = null;

    const flush = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (!pending) return;
      const plan = pending;
      pending = null;
      api.savePlan(plan).catch(() => {
        // Transient failure — the next change (or next mount's adoption pass)
        // sends the full slice again.
      });
    };

    (async () => {
      if (hydratedFor !== userId) {
        try {
          const { plan } = await api.getPlan();
          if (cancelled) return;
          hydratedFor = userId;
          if (isApplicablePlan(plan)) {
            // Server wins: fresh undo history, zustand persist re-mirrors to
            // localStorage on its own.
            usePlanner.setState({ ...plan, past: [], future: [] });
          } else {
            // No server copy yet — adopt what this browser already has.
            api.savePlan(persistedSlice(usePlanner.getState())).catch(() => {});
          }
        } catch {
          // Server unreachable — keep local; saves retry on later changes.
        }
      }
      if (cancelled) return;
      unsubscribe = usePlanner.subscribe((state, prev) => {
        const next = persistedSlice(state);
        if (samePersistedSlice(next, persistedSlice(prev))) return;
        pending = next;
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
      flush(); // an edit made just before switching tools still lands
    };
  }, [api, userId]);
}
