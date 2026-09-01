// Persisted state for the Course Schedule pane (zustand + persist →
// localStorage key 'reodite-schedule'). The persisted slice mirrors the
// server payload: section picks identified by { code, section, term }, with a
// local-only snapshot cache so the grid paints before a catalog refetch.
import type { CourseDoc, CourseSection } from "@/src/lib/api-types";
import { normalizeDays, sectionGroup } from "@/src/lib/schedule";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** A picked section: ids for persistence plus a display snapshot resolved
 *  from the catalog at pick time. The snapshot is re-resolved on mount so
 *  catalog corrections (time changes, cancellations) flow through; stale
 *  snapshots get flagged rather than silently trusted. */
export interface ScheduleEntry {
  code: string;
  section: string;
  term: string;
  snapshot: {
    title: string;
    instructor: string | null;
    days: string[];
    start_time: string | null;
    end_time: string | null;
    status: string | null;
  };
}

/** Server-synced slice: identifiers only, per the route's contract. */
export interface SyncedSchedule {
  entries: { code: string; section: string; term: string }[];
  activeTerm: string;
}

interface ScheduleState {
  /** Account that owns the local snapshot cache. Null means an unclaimed guest schedule. */
  ownerId: string | null;
  /** Persisted edit journal protects changes made before server hydration completes. */
  dirty: boolean;
  revision: number;
  selectedComponents: string[];
  removedComponents: string[];
  removedCourses: string[];
  activeTermDirty: boolean;
  entries: ScheduleEntry[];
  /** Term tab the grid shows. Defaults to the first term across entries. */
  activeTerm: string;
  /** Catalog staleness flag: true when a re-resolve changed times or found
   *  a section that no longer exists. Set by use-schedule-sync. */
  stale: boolean;

  addEntry: (doc: CourseDoc, section: CourseSection) => void;
  addCourseSections: (doc: CourseDoc, sections: CourseSection[]) => void;
  removeEntry: (code: string, section: string, term: string) => void;
  removeCourse: (code: string, term: string) => void;
  setActiveTerm: (term: string) => void;
  setStale: (stale: boolean) => void;
  markSynced: (revision: number) => void;
}

export function normalizeScheduleCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/_V(?=\s)/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function entryId(e: Pick<ScheduleEntry, "code" | "section" | "term">): string {
  return `${normalizeScheduleCode(e.code)}::${e.section}::${e.term}`;
}

export function courseTermKey(code: string, term: string): string {
  return `${normalizeScheduleCode(code)}::${term}`;
}

export function componentKey(code: string, term: string, section: string): string {
  return `${courseTermKey(code, term)}::${sectionGroup(section)}`;
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

/** Canonical display label shared with the schedule sharer: "CPSC 221 101". */
export function entryLabel(e: Pick<ScheduleEntry, "code" | "section">): string {
  return `${normalizeScheduleCode(e.code)} ${e.section}`;
}

export function syncedSlice(s: ScheduleState): SyncedSchedule {
  return {
    entries: s.entries.map(({ code, section, term }) => ({ code: normalizeScheduleCode(code), section, term })),
    activeTerm: s.activeTerm,
  };
}

function applyEntries(entries: ScheduleEntry[]): ScheduleEntry[] {
  // Dedupe by identity; last write wins for the snapshot.
  const seen = new Map<string, ScheduleEntry>();
  for (const e of entries) seen.set(entryId(e), e);
  return [...seen.values()];
}

/** Ownerless version-1 caches cannot prove which account created them, so the
 *  version-2 migration discards their entries instead of risking cross-account
 *  adoption. */
export function migrateScheduleState(persisted: unknown, version: number): unknown {
  if (version >= 2) return persisted;
  return {
    ...(persisted as object),
    ownerId: null,
    dirty: false,
    revision: 0,
    selectedComponents: [],
    removedComponents: [],
    removedCourses: [],
    activeTermDirty: false,
    entries: [],
    activeTerm: "",
    stale: false,
  };
}

export const useSchedule = create<ScheduleState>()(
  persist(
    (set) => ({
      ownerId: null,
      dirty: false,
      revision: 0,
      selectedComponents: [],
      removedComponents: [],
      removedCourses: [],
      activeTermDirty: false,
      entries: [],
      activeTerm: "",
      stale: false,

      addEntry: (doc, section) =>
        set((s) => {
          const term = section.term ?? "";
          const code = normalizeScheduleCode(doc.code);
          const component = sectionGroup(section.section);
          const withoutPreviousChoice = s.entries.filter(
            (e) =>
              !(normalizeScheduleCode(e.code) === code && e.term === term && sectionGroup(e.section) === component),
          );
          const selectedKey = componentKey(code, term, section.section);
          const courseKey = courseTermKey(code, term);
          const activeTerm =
            s.entries.some((e) => e.term === s.activeTerm) && s.activeTerm !== "" ? s.activeTerm : term;
          return {
            dirty: true,
            revision: s.revision + 1,
            activeTermDirty: s.activeTermDirty || activeTerm !== s.activeTerm,
            selectedComponents: unique([...s.selectedComponents, selectedKey]),
            removedComponents: s.removedComponents.filter((key) => key !== selectedKey),
            removedCourses: s.removedCourses.filter((key) => key !== courseKey),
            entries: applyEntries([
              ...withoutPreviousChoice,
              {
                code,
                section: section.section,
                term,
                snapshot: {
                  title: doc.title,
                  instructor: section.instructor ?? null,
                  days: normalizeDays(section.days),
                  start_time: section.start_time ?? null,
                  end_time: section.end_time ?? null,
                  status: section.status ?? null,
                },
              },
            ]),
            // A newly added entry in a fresh term takes over the tab when the
            // current term has no visible entries — otherwise the user adds a
            // section and sees nothing happen.
            activeTerm,
          };
        }),

      addCourseSections: (doc, sections) =>
        set((s) => {
          if (sections.length === 0) return s;
          const code = normalizeScheduleCode(doc.code);
          const selectedGroups = new Set(sections.map((section) => sectionGroup(section.section)));
          const terms = new Set(sections.map((section) => section.term ?? ""));
          const entries = s.entries.filter(
            (entry) =>
              normalizeScheduleCode(entry.code) !== code ||
              !terms.has(entry.term) ||
              !selectedGroups.has(sectionGroup(entry.section)),
          );
          const additions = sections.map((section) => ({
            code,
            section: section.section,
            term: section.term ?? "",
            snapshot: {
              title: doc.title,
              instructor: section.instructor ?? null,
              days: normalizeDays(section.days),
              start_time: section.start_time ?? null,
              end_time: section.end_time ?? null,
              status: section.status ?? null,
            },
          }));
          const selectedKeys = additions.map((entry) => componentKey(entry.code, entry.term, entry.section));
          const courseKeys = new Set(additions.map((entry) => courseTermKey(entry.code, entry.term)));
          const nextTerm = additions[0].term;
          const activeTerm =
            s.entries.some((entry) => entry.term === s.activeTerm) && s.activeTerm !== "" ? s.activeTerm : nextTerm;
          return {
            dirty: true,
            revision: s.revision + 1,
            activeTermDirty: s.activeTermDirty || activeTerm !== s.activeTerm,
            selectedComponents: unique([...s.selectedComponents, ...selectedKeys]),
            removedComponents: s.removedComponents.filter((key) => !selectedKeys.includes(key)),
            removedCourses: s.removedCourses.filter((key) => !courseKeys.has(key)),
            entries: applyEntries([...entries, ...additions]),
            activeTerm,
          };
        }),

      removeEntry: (code, section, term) =>
        set((s) => {
          const key = componentKey(code, term, section);
          return {
            dirty: true,
            revision: s.revision + 1,
            selectedComponents: s.selectedComponents.filter((candidate) => candidate !== key),
            removedComponents: unique([...s.removedComponents, key]),
            entries: s.entries.filter(
              (e) =>
                !(
                  normalizeScheduleCode(e.code) === normalizeScheduleCode(code) &&
                  e.section === section &&
                  e.term === term
                ),
            ),
          };
        }),

      removeCourse: (code, term) =>
        set((s) => {
          const key = courseTermKey(code, term);
          return {
            dirty: true,
            revision: s.revision + 1,
            selectedComponents: s.selectedComponents.filter((candidate) => !candidate.startsWith(`${key}::`)),
            removedComponents: s.removedComponents.filter((candidate) => !candidate.startsWith(`${key}::`)),
            removedCourses: unique([...s.removedCourses, key]),
            entries: s.entries.filter(
              (e) => normalizeScheduleCode(e.code) !== normalizeScheduleCode(code) || e.term !== term,
            ),
          };
        }),

      setActiveTerm: (term) =>
        set((s) =>
          term === s.activeTerm
            ? s
            : { activeTerm: term, activeTermDirty: true, dirty: true, revision: s.revision + 1 },
        ),

      setStale: (stale) => set({ stale }),

      markSynced: (revision) =>
        set((s) =>
          s.revision !== revision
            ? s
            : {
                dirty: false,
                selectedComponents: [],
                removedComponents: [],
                removedCourses: [],
                activeTermDirty: false,
              },
        ),
    }),
    {
      name: "reodite-schedule",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      migrate: migrateScheduleState,
    },
  ),
);

/** Claims the local cache for an account. A cache owned by another account is
 *  cleared instead of being uploaded across accounts. Null ownership denotes
 *  an explicit guest schedule and may be adopted by the first signed-in user. */
export function claimScheduleOwner(userId: string): void {
  const state = useSchedule.getState();
  if (state.ownerId !== null && state.ownerId !== userId) {
    useSchedule.setState({
      ownerId: userId,
      dirty: false,
      revision: 0,
      selectedComponents: [],
      removedComponents: [],
      removedCourses: [],
      activeTermDirty: false,
      entries: [],
      activeTerm: "",
      stale: false,
    });
    return;
  }
  if (state.ownerId === null) useSchedule.setState({ ownerId: userId });
}

/** Clears account-owned snapshots before displaying the guest planner. */
export function clearOwnedScheduleForGuest(): void {
  if (useSchedule.getState().ownerId === null) return;
  useSchedule.setState({
    ownerId: null,
    dirty: false,
    revision: 0,
    selectedComponents: [],
    removedComponents: [],
    removedCourses: [],
    activeTermDirty: false,
    entries: [],
    activeTerm: "",
    stale: false,
  });
}

/** Distinct terms across entries: newest session first, term N ascending
 *  inside a session ("2026-27 Winter Term 1" before "... Term 2"). */
export function distinctTerms(entries: ScheduleEntry[]): string[] {
  const sess = (t: string) => t.match(/^\d{4}-\d{2}/)?.[0] ?? t;
  const rest = (t: string) => t.replace(/^\d{4}-\d{2}\s*/, "");
  return [...new Set(entries.map((e) => e.term))].sort((a, b) => {
    const d = sess(b).localeCompare(sess(a));
    return d !== 0 ? d : rest(a).localeCompare(rest(b));
  });
}
