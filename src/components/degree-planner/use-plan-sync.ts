"use client";

// Syncs the planner store with the account's server-side plan. Signed-in
// users get their plan back on any device; guests stay localStorage-only.
//
// The server wins on the first mount per auth session. A missing server plan
// adopts only the account's cache or an explicitly owned guest plan. The auth
// provider clears foreign plans before publishing identity changes.
// Changes debounce and flush on pane unmount while ownership still matches.
// Saves use last-write-wins without cross-device conflict merging.
import { useAppAuth } from "@/src/components/auth/app-auth";
import { useApi } from "@/src/components/providers";
import { useEffect } from "react";
import { migratePersistedPlan, persistedSlice, usePlanner, type PersistedPlan } from "./planner-store";

const SAVE_DEBOUNCE_MS = 1000;

// The API instance belongs to one auth session. Pane remounts keep local
// edits; signing back in hydrates again even for the same account.
let hydratedApi: ReturnType<typeof useApi> | null = null;

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
      if (!pending || usePlanner.getState().ownerId !== userId) {
        pending = null;
        return;
      }
      const plan = pending;
      pending = null;
      api.savePlan(plan).catch(() => {
        // Transient failure — the next change (or next mount's adoption pass)
        // sends the full slice again.
      });
    };

    (async () => {
      if (hydratedApi !== api) {
        try {
          const { plan } = await api.getPlan();
          if (cancelled || usePlanner.getState().ownerId !== userId) return;
          hydratedApi = api;
          if (isApplicablePlan(plan)) {
            // Server wins: migrate legacy term names before applying the plan,
            // then start with fresh undo history.
            const { schemaVersion: _, ...migrated } = migratePersistedPlan(plan);
            usePlanner.setState({ ...migrated, ownerId: userId, past: [], future: [], flashBlockId: null });
          } else {
            // The auth boundary has already claimed or cleared the local cache.
            api.savePlan(persistedSlice(usePlanner.getState())).catch(() => {});
          }
        } catch {
          // Server unreachable — keep local; saves retry on later changes.
        }
      }
      if (cancelled || usePlanner.getState().ownerId !== userId) return;
      unsubscribe = usePlanner.subscribe((state, prev) => {
        if (state.ownerId !== userId || prev.ownerId !== userId) return;
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
