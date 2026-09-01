"use client";

// Loads the account's server-side schedule into the store on first mount,
// pushes changes back with a debounce, and re-resolves every entry against
// the catalog so stale snapshots flag themselves.
//
// Adopt policy: the server wins unless the user edits while hydration is in
// flight. Guest schedules may be adopted once; account-owned local caches
// never cross into another account.
import { useAppAuth } from "@/src/components/auth/app-auth";
import { useApi } from "@/src/components/providers";
import { normalizeDays } from "@/src/lib/schedule";
import { useEffect, useLayoutEffect } from "react";
import {
  claimScheduleOwner,
  clearOwnedScheduleForGuest,
  componentKey,
  courseTermKey,
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
        days: normalizeDays(live.days),
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

/** Applies persisted local edit intent to freshly resolved server entries.
 *  Component/course tombstones remove equivalent server choices even when the
 *  server's exact section identifier differs from the stale local snapshot. */
export function mergeHydratedEntries(
  remote: ScheduleEntry[],
  current: ScheduleEntry[],
  selectedComponents: string[],
  removedComponents: string[],
  removedCourses: string[],
): ScheduleEntry[] {
  const selected = new Set(selectedComponents);
  const removed = new Set(removedComponents);
  const removedCourseSet = new Set(removedCourses);
  const merged = new Map(
    remote
      .filter(
        (entry) =>
          !removedCourseSet.has(courseTermKey(entry.code, entry.term)) &&
          !removed.has(componentKey(entry.code, entry.term, entry.section)),
      )
      .map((entry) => [entryId(entry), entry]),
  );

  for (const entry of current) {
    const key = componentKey(entry.code, entry.term, entry.section);
    if (!selected.has(key)) continue;
    for (const [id, candidate] of merged) {
      if (componentKey(candidate.code, candidate.term, candidate.section) === key) merged.delete(id);
    }
    merged.set(entryId(entry), entry);
  }
  return [...merged.values()];
}

export function useScheduleSync(): void {
  const api = useApi();
  const { user, isGuest } = useAppAuth();
  const userId = !isGuest && user ? user.userId : null;

  useLayoutEffect(() => {
    if (isGuest) clearOwnedScheduleForGuest();
  }, [isGuest]);

  useEffect(() => {
    if (!userId) return;

    claimScheduleOwner(userId);
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending: { schedule: SyncedSchedule; revision: number } | null = null;
    let hydrating = hydratedFor !== userId;
    let applyingServer = false;

    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      if (!pending) return;
      const save = pending;
      pending = null;
      api
        .saveSchedule(save.schedule)
        .then(() => {
          const current = useSchedule.getState();
          if (current.ownerId === userId) current.markSynced(save.revision);
        })
        .catch(() => {
          // Keep unsynced intent for the next edit or mount.
          if (!pending) pending = save;
        });
    };

    const scheduleFlush = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, SAVE_DEBOUNCE_MS);
    };

    unsubscribe = useSchedule.subscribe((state, prev) => {
      const next = syncedSlice(state);
      if (sameSynced(next, syncedSlice(prev)) || applyingServer) return;
      pending = { schedule: next, revision: state.revision };
      if (!hydrating) scheduleFlush();
    });

    if (!hydrating && useSchedule.getState().dirty) {
      const current = useSchedule.getState();
      pending = { schedule: syncedSlice(current), revision: current.revision };
      scheduleFlush();
    }

    (async () => {
      if (!hydrating) return;
      try {
        const { schedule } = await api.getSchedule();
        if (cancelled) return;
        if (isSyncedSchedule(schedule)) {
          const currentCache = new Map(useSchedule.getState().entries.map((entry) => [entryId(entry), entry]));
          const resolved = await resolveEntries(api, schedule.entries, currentCache);
          if (cancelled) return;

          applyingServer = true;
          const current = useSchedule.getState();
          if (current.dirty) {
            const entries = mergeHydratedEntries(
              resolved.entries,
              current.entries,
              current.selectedComponents,
              current.removedComponents,
              current.removedCourses,
            );
            useSchedule.setState({
              ownerId: userId,
              entries,
              activeTerm: current.activeTermDirty ? current.activeTerm : schedule.activeTerm || entries[0]?.term || "",
              stale: resolved.stale || current.stale,
            });
            const merged = useSchedule.getState();
            pending = { schedule: syncedSlice(merged), revision: merged.revision };
          } else {
            useSchedule.setState({
              ownerId: userId,
              dirty: false,
              selectedComponents: [],
              removedComponents: [],
              removedCourses: [],
              activeTermDirty: false,
              entries: resolved.entries,
              activeTerm: schedule.activeTerm || resolved.entries[0]?.term || "",
              stale: resolved.stale,
            });
            pending = null;
          }
          applyingServer = false;
        } else {
          const current = useSchedule.getState();
          pending = { schedule: syncedSlice(current), revision: current.revision };
        }
        hydratedFor = userId;
      } catch {
        // Keep the local cache and retry server hydration on the next mount.
      } finally {
        hydrating = false;
        if (!cancelled && pending) scheduleFlush();
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
      if (!hydrating) flush();
    };
  }, [api, userId]);
}
