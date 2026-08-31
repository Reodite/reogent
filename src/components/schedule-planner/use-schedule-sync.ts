"use client";

// Loads the account's server-side schedule into the store on first mount,
// pushes changes back with a debounce, and re-resolves every entry against
// the catalog so stale snapshots flag themselves.
//
// Adopt policy: server copy wins when it exists; otherwise whatever the
// browser already has is adopted upward. Same last-write-wins posture as the
// degree planner's use-plan-sync.
import { useAppAuth } from "@/src/components/auth/app-auth";
import { useApi } from "@/src/components/providers";
import { useEffect } from "react";
import {
  entryId,
  normalizeScheduleCode,
  syncedSlice,
  useSchedule,
  type ScheduleEntry,
  type SyncedSchedule,
} from "./schedule-store";

const SAVE_DEBOUNCE_MS = 1000;

let hydratedFor: string | null = null;

function sameSynced(a: SyncedSchedule, b: SyncedSchedule): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isSyncedSchedule(v: unknown): v is SyncedSchedule {
  if (!v || typeof v !== "object") return false;
  const candidate = v as { entries?: unknown; activeTerm?: unknown };
  return (
    Array.isArray(candidate.entries) &&
    candidate.entries.every(
      (entry) =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as { code?: unknown }).code === "string" &&
        typeof (entry as { section?: unknown }).section === "string" &&
        typeof (entry as { term?: unknown }).term === "string",
    ) &&
    (candidate.activeTerm === undefined || typeof candidate.activeTerm === "string")
  );
}

type Api = ReturnType<typeof useApi>;

/** Re-resolves entries against the catalog. Missing records keep their cached
 *  snapshots and set `stale` so a transient outage never loses a selection. */
async function resolveEntries(
  api: Api,
  ids: { code: string; section: string; term: string }[],
  current: Map<string, ScheduleEntry>,
): Promise<{ entries: ScheduleEntry[]; stale: boolean }> {
  const codes = [...new Set(ids.map((e) => normalizeScheduleCode(e.code)))];
  const docs = new Map<string, Awaited<ReturnType<typeof api.getCourse>> | null>();
  await Promise.all(
    codes.map(async (code) => {
      try {
        docs.set(code, await api.getCourse(code));
      } catch {
        docs.set(code, null);
      }
    }),
  );
  let stale = false;
  const entries: ScheduleEntry[] = [];
  for (const rawId of ids) {
    const id = { ...rawId, code: normalizeScheduleCode(rawId.code) };
    const doc = docs.get(id.code);
    const live = doc?.sections.find((s) => s.section === id.section && s.term === id.term);
    const existing = current.get(entryId(id));
    if (!doc || !live) {
      // Keep the identifier visible when the catalog is unavailable or the
      // section disappeared. A later successful resolve can restore details.
      entries.push(
        existing ?? {
          ...id,
          snapshot: {
            title: id.code,
            instructor: null,
            days: [],
            start_time: null,
            end_time: null,
            status: null,
          },
        },
      );
      stale = true;
      continue;
    }
    const next: ScheduleEntry = {
      code: id.code,
      section: id.section,
      term: id.term,
      snapshot: {
        title: doc.title,
        instructor: live.instructor ?? null,
        days: live.days,
        start_time: live.start_time ?? null,
        end_time: live.end_time ?? null,
        status: live.status ?? null,
      },
    };
    if (existing && JSON.stringify(existing.snapshot) !== JSON.stringify(next.snapshot)) stale = true;
    entries.push(next);
  }
  return { entries, stale };
}

export function useScheduleSync(): void {
  const api = useApi();
  const { user, isGuest } = useAppAuth();
  const userId = !isGuest && user ? user.userId : null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: SyncedSchedule | null = null;

    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (!pending) return;
      const payload = pending;
      pending = null;
      api.saveSchedule(payload).catch(() => {
        // Transient failure — next change re-sends the full slice.
      });
    };

    (async () => {
      if (hydratedFor !== userId) {
        try {
          const { schedule } = await api.getSchedule();
          if (cancelled) return;
          hydratedFor = userId;
          if (isSyncedSchedule(schedule)) {
            const current = new Map(useSchedule.getState().entries.map((e) => [entryId(e), e]));
            const { entries, stale } = await resolveEntries(api, schedule.entries, current);
            if (cancelled) return;
            useSchedule.setState({
              entries,
              activeTerm: schedule.activeTerm || entries[0]?.term || "",
              stale,
            });
          } else {
            // No server copy yet — adopt what this browser already has.
            api.saveSchedule(syncedSlice(useSchedule.getState())).catch(() => {});
          }
        } catch {
          // Server unreachable — keep local; saves retry on later changes.
        }
      }
      if (cancelled) return;
      unsubscribe = useSchedule.subscribe((state, prev) => {
        const next = syncedSlice(state);
        if (sameSynced(next, syncedSlice(prev))) return;
        pending = next;
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
      });
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
      flush();
    };
  }, [api, userId]);
}
