// Persisted state for the Degree Planner pane (zustand + persist middleware →
// localStorage key 'reodite-planner'). Persists everything the user has
// assembled — year columns, term layouts, block ids/codes, faculty/major/minor
// selection — so a refresh restores the plan in place.
//
// Course metadata (title, credits) is NOT persisted; the planner re-resolves
// each block's code against the course index at render time so catalog
// updates flow through to existing plans.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// Seasons following the UBC calendar: Winter session terms 1/2, and the
// optional Summer session (two half-length terms). A year always has the two
// winter terms; summer terms are added per year on demand.
export type Season = "w1" | "w2" | "s1" | "s2";

// A term either holds courses ("study") or is a co-op work term. Work terms
// hold no course blocks; they render as a distinct card and are excluded
// from credit-load checks. Prereq validation still walks them so a work
// term never counts its (empty) contents and simply passes time.
export type TermKind = "study" | "coop";

export type PlannerSidebarTab = "preferences" | "progress" | "courses";

export interface SeasonMeta {
  season: Season;
  short: string;
  months: string;
}

export const SEASON_META: Record<Season, SeasonMeta> = {
  w1: { season: "w1", short: "Winter 1", months: "Sep–Dec" },
  w2: { season: "w2", short: "Winter 2", months: "Jan–Apr" },
  s1: { season: "s1", short: "Summer 1", months: "May–Jun" },
  s2: { season: "s2", short: "Summer 2", months: "Jul–Aug" },
};

// Chronological season order: Summer 1 comes before Summer 2. Year terms
// are always stored in this order (winters first, summers last).
const SEASON_ORDER: Season[] = ["w1", "w2", "s1", "s2"];

// Credit-load sanity bounds per season. Summer terms are half-length, so a
// full summer term is ~6-8 credits; winter full-time is ~15.
export const TERM_CREDIT_TARGET: Record<Season, number> = { w1: 15, w2: 15, s1: 7, s2: 7 };
export const TERM_CREDIT_WARN: Record<Season, number> = { w1: 18, w2: 18, s1: 9, s2: 9 };

export interface PlannedBlock {
  id: string;
  code: string;
}

export interface Term {
  season: Season;
  kind: TermKind;
  blocks: PlannedBlock[];
  // Transcript course code for a co-op work term (e.g. "ARTC 110"), shown as
  // a label on the work-term card. Co-op credits don't count toward degree
  // credits, so this is display-only — never a draggable block.
  code?: string;
}

export interface Year {
  id: string;
  label: string;
  terms: Term[];
}

// The undoable slice of the plan — everything an action touches. Captured
// by reference (these fields are always replaced immutably) so snapshots
// are cheap and safe to keep on the history stacks.
export interface PlanSnapshot {
  years: Year[];
  ignoredBlocks: string[];
  checkedRequirements: string[];
}

interface PlannerState {
  years: Year[];
  faculty: string | null;
  major: string | null;
  minor: string | null;
  // Co-op participation flag. When true the structure panel offers the
  // canonical work-term sequence for the selected faculty.
  coop: boolean;
  sidebarCollapsed: boolean;
  sidebarTab: PlannerSidebarTab;
  lookupQuery: string;
  // Block IDs whose prereq/coreq errors the user chose to suppress.
  ignoredBlocks: string[];
  // Program-requirement rows the user manually ticked (transfer credit, AP,
  // courses they won't place on the board). See toggleRequirement.
  checkedRequirements: string[];
  // Undo / redo history of the plan slice. Session-only — excluded from
  // persistence via `partialize`, so a reload starts with empty history.
  past: PlanSnapshot[];
  future: PlanSnapshot[];

  setYearCount: (n: number) => void;
  replaceYears: (years: Year[]) => void;
  addBlock: (yearId: string, termIdx: number, code: string) => void;
  // Batch insert (used by autofill) so the whole fill is a single undo step.
  addBlocks: (items: { yearId: string; termIdx: number; code: string }[]) => void;
  moveBlock: (blockId: string, toYearId: string, toTermIdx: number, toPos: number) => void;
  removeBlock: (blockId: string) => void;
  clearAllBlocks: () => void;
  // Toggle this year's Summer session (adds s1+s2 or removes them).
  toggleSummer: (yearId: string) => void;
  // Mark a term as a co-op work term (or back to study). Flipping to coop
  // clears its blocks — done after UI confirmation.
  setTermKind: (yearId: string, termIdx: number, kind: TermKind) => void;
  setCoop: (enabled: boolean) => void;
  toggleIgnoreBlock: (blockId: string) => void;
  toggleRequirement: (key: string) => void;
  setProgram: (level: "faculty" | "major" | "minor", value: string | null) => void;
  toggleSidebar: () => void;
  setSidebarTab: (tab: PlannerSidebarTab) => void;
  setLookupQuery: (q: string) => void;
  // Step the plan back / forward through the history stacks. No-ops when the
  // respective stack is empty.
  undo: () => void;
  redo: () => void;
}

/** The durable slice of planner state — what localStorage keeps and what the
 *  server stores per account. Excludes the session-only undo/redo stacks. */
export type PersistedPlan = Pick<
  PlannerState,
  | "years"
  | "faculty"
  | "major"
  | "minor"
  | "coop"
  | "sidebarCollapsed"
  | "sidebarTab"
  | "lookupQuery"
  | "ignoredBlocks"
  | "checkedRequirements"
> & { schemaVersion: 2 };

export function persistedSlice(s: PlannerState): PersistedPlan {
  return {
    schemaVersion: 2,
    years: s.years,
    faculty: s.faculty,
    major: s.major,
    minor: s.minor,
    coop: s.coop,
    sidebarCollapsed: s.sidebarCollapsed,
    sidebarTab: s.sidebarTab,
    lookupQuery: s.lookupQuery,
    ignoredBlocks: s.ignoredBlocks,
    checkedRequirements: s.checkedRequirements,
  };
}

export const MIN_YEARS = 3;
export const MAX_YEARS = 6;
export const DEFAULT_YEARS = 4;

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

function newTerm(season: Season): Term {
  return { season, kind: "study", blocks: [] };
}

export function createPlannerYear(index: number): Year {
  return {
    id: newId(),
    label: `Year ${index + 1}`,
    terms: [newTerm("w1"), newTerm("w2")],
  };
}

function initialYears(): Year[] {
  return Array.from({ length: DEFAULT_YEARS }, (_, i) => createPlannerYear(i));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// Walk every term and remove the block with the given id. Returns a new
// years array so React re-renders.
function removeBlockEverywhere(years: Year[], blockId: string): Year[] {
  return years.map((y) => ({
    ...y,
    terms: y.terms.map((t) => ({
      ...t,
      blocks: t.blocks.filter((b) => b.id !== blockId),
    })),
  }));
}

// Cap the undo depth so a long session can't grow the history unbounded.
const MAX_HISTORY = 100;

function snapshot(s: PlannerState): PlanSnapshot {
  return {
    years: s.years,
    ignoredBlocks: s.ignoredBlocks,
    checkedRequirements: s.checkedRequirements,
  };
}

// Turn a plain state patch into a *tracked* one: pushes the pre-change
// snapshot onto the undo stack and clears the redo stack. Pass `null` for a
// no-op so no spurious checkpoint is recorded.
function commit(s: PlannerState, patch: Partial<PlannerState> | null): PlannerState | Partial<PlannerState> {
  if (!patch) return s;
  return {
    ...patch,
    past: [...s.past, snapshot(s)].slice(-MAX_HISTORY),
    future: [],
  };
}

export function isSummer(season: Season): boolean {
  return season === "s1" || season === "s2";
}

/** Normalizes local and server plans into the current seasonal term model. */
export function migratePersistedPlan(persisted: unknown): PersistedPlan {
  const raw = persisted && typeof persisted === "object" ? (persisted as Record<string, unknown>) : {};
  const seasonMap: Record<string, Season> = {
    fall: "w1",
    spring: "w2",
    summer: "s1",
    term4: "s2",
    w1: "w1",
    w2: "w2",
    s1: "s1",
    s2: "s2",
  };
  const rawYears = Array.isArray(raw.years) ? raw.years : [];
  const years = rawYears.map((value, yearIndex): Year => {
    const rawYear = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const rawTerms = Array.isArray(rawYear.terms) ? rawYear.terms : [];
    const terms: Term[] = [];
    for (const termValue of rawTerms) {
      if (!termValue || typeof termValue !== "object") continue;
      const rawTerm = termValue as Record<string, unknown>;
      const season = typeof rawTerm.season === "string" ? seasonMap[rawTerm.season] : undefined;
      if (!season || terms.some((term) => term.season === season)) continue;
      const blocks = Array.isArray(rawTerm.blocks)
        ? rawTerm.blocks.flatMap((block): PlannedBlock[] => {
            if (!block || typeof block !== "object") return [];
            const rawBlock = block as Record<string, unknown>;
            if (typeof rawBlock.code !== "string") return [];
            return [{ id: typeof rawBlock.id === "string" ? rawBlock.id : newId(), code: rawBlock.code }];
          })
        : [];
      const kind: TermKind = rawTerm.kind === "coop" ? "coop" : "study";
      terms.push({
        season,
        kind,
        blocks: kind === "coop" ? [] : blocks,
        code: typeof rawTerm.code === "string" ? rawTerm.code : undefined,
      });
    }
    for (const season of ["w1", "w2"] as Season[]) {
      if (!terms.some((term) => term.season === season)) terms.push(newTerm(season));
    }
    if (terms.some((term) => isSummer(term.season))) {
      for (const season of ["s1", "s2"] as Season[]) {
        if (!terms.some((term) => term.season === season)) terms.push(newTerm(season));
      }
    }
    terms.sort((a, b) => SEASON_ORDER.indexOf(a.season) - SEASON_ORDER.indexOf(b.season));
    return {
      id: typeof rawYear.id === "string" ? rawYear.id : newId(),
      label: typeof rawYear.label === "string" ? rawYear.label : `Year ${yearIndex + 1}`,
      terms,
    };
  });
  const sidebarTab =
    raw.sidebarTab === "progress" || raw.sidebarTab === "courses" || raw.sidebarTab === "preferences"
      ? raw.sidebarTab
      : "preferences";
  return {
    schemaVersion: 2,
    years: years.length > 0 ? years : initialYears(),
    faculty: typeof raw.faculty === "string" ? raw.faculty : null,
    major: typeof raw.major === "string" ? raw.major : null,
    minor: typeof raw.minor === "string" ? raw.minor : null,
    coop: raw.coop === true,
    sidebarCollapsed: raw.sidebarCollapsed === true,
    sidebarTab,
    lookupQuery: typeof raw.lookupQuery === "string" ? raw.lookupQuery : "",
    ignoredBlocks: Array.isArray(raw.ignoredBlocks)
      ? raw.ignoredBlocks.filter((id): id is string => typeof id === "string")
      : [],
    checkedRequirements: Array.isArray(raw.checkedRequirements)
      ? raw.checkedRequirements.filter((key): key is string => typeof key === "string")
      : [],
  };
}

export const usePlanner = create<PlannerState>()(
  persist(
    (set) => ({
      years: initialYears(),
      faculty: null,
      major: null,
      minor: null,
      coop: false,
      sidebarCollapsed: false,
      sidebarTab: "preferences",
      lookupQuery: "",
      ignoredBlocks: [],
      checkedRequirements: [],
      past: [],
      future: [],

      setYearCount: (n) =>
        set((s) => {
          const target = clamp(n, MIN_YEARS, MAX_YEARS);
          const current = s.years.length;
          if (target === current) return s;
          if (target > current) {
            const extra = Array.from({ length: target - current }, (_, i) => createPlannerYear(current + i));
            return commit(s, { years: [...s.years, ...extra] });
          }
          // Shrinking: trim from the tail. Blocks in removed years are
          // dropped — the UI confirms before calling when data would be lost.
          return commit(s, { years: s.years.slice(0, target) });
        }),

      replaceYears: (years) => set((s) => commit(s, { years })),

      addBlock: (yearId, termIdx, code) =>
        set((s) => {
          // Refuse exact duplicates: the same course code may live in the
          // plan only once. The UI surfaces a duplicate-state via validation
          // for legacy plans; new inserts are rejected here.
          for (const y of s.years) {
            for (const t of y.terms) {
              if (t.blocks.some((b) => b.code === code)) return s;
            }
          }
          const destination = s.years.find((y) => y.id === yearId)?.terms[termIdx];
          if (destination?.kind !== "study") return s;
          const block: PlannedBlock = { id: newId(), code };
          const years = s.years.map((y) => {
            if (y.id !== yearId) return y;
            const terms = y.terms.map((t, i) => (i === termIdx ? { ...t, blocks: [...t.blocks, block] } : t));
            return { ...y, terms };
          });
          return commit(s, { years });
        }),

      addBlocks: (items) =>
        set((s) => {
          if (items.length === 0) return s;
          const next = s.years.map((y) => ({
            ...y,
            terms: y.terms.map((t) => ({ ...t, blocks: [...t.blocks] })),
          }));
          const seen = new Set<string>();
          for (const y of next) {
            for (const t of y.terms) {
              for (const b of t.blocks) seen.add(b.code);
            }
          }
          let changed = false;
          for (const { yearId, termIdx, code } of items) {
            if (seen.has(code)) continue;
            const y = next.find((yy) => yy.id === yearId);
            const t = y?.terms[termIdx];
            if (t?.kind !== "study") continue;
            t.blocks.push({ id: newId(), code });
            seen.add(code);
            changed = true;
          }
          return commit(s, changed ? { years: next } : null);
        }),

      moveBlock: (blockId, toYearId, toTermIdx, toPos) =>
        set((s) => {
          let moved: PlannedBlock | null = null;
          // First pass: pluck the block. Track the source so we know
          // whether to insert at `toPos` or `toPos - 1` (a within-term
          // move shifts the index when we remove before re-inserting).
          let sourceYearId: string | null = null;
          let sourceTermIdx = -1;
          let sourcePos = -1;
          for (const y of s.years) {
            for (let ti = 0; ti < y.terms.length; ti++) {
              const idx = y.terms[ti].blocks.findIndex((b) => b.id === blockId);
              if (idx !== -1) {
                moved = y.terms[ti].blocks[idx];
                sourceYearId = y.id;
                sourceTermIdx = ti;
                sourcePos = idx;
                break;
              }
            }
            if (moved) break;
          }
          if (!moved) return s;
          const destination = s.years.find((y) => y.id === toYearId)?.terms[toTermIdx];
          if (destination?.kind !== "study") return s;

          const years = s.years.map((y) => ({
            ...y,
            terms: y.terms.map((t) => ({
              ...t,
              blocks: t.blocks.filter((b) => b.id !== blockId),
            })),
          }));

          // Index adjustment for same-term reorders: removing from `sourcePos`
          // before re-inserting shifts every later position down by one.
          let insertAt = toPos;
          if (sourceYearId === toYearId && sourceTermIdx === toTermIdx && sourcePos < toPos) {
            insertAt = toPos - 1;
          }

          const next = years.map((y) => {
            if (y.id !== toYearId) return y;
            const terms = y.terms.map((t, i) => {
              if (i !== toTermIdx) return t;
              const blocks = [...t.blocks];
              const clamped = clamp(insertAt, 0, blocks.length);
              blocks.splice(clamped, 0, moved as PlannedBlock);
              return { ...t, blocks };
            });
            return { ...y, terms };
          });
          return commit(s, { years: next });
        }),

      removeBlock: (blockId) =>
        set((s) =>
          commit(s, {
            years: removeBlockEverywhere(s.years, blockId),
            ignoredBlocks: s.ignoredBlocks.filter((id) => id !== blockId),
          }),
        ),

      clearAllBlocks: () =>
        set((s) =>
          commit(s, {
            years: s.years.map((y) => ({
              ...y,
              terms: y.terms.map((t) => ({ ...t, blocks: [] })),
            })),
            ignoredBlocks: [],
          }),
        ),

      toggleSummer: (yearId) =>
        set((s) => {
          const yeardata = s.years.find((y) => y.id === yearId);
          if (!yeardata) return s;
          const hasSummer = yeardata.terms.some((t) => isSummer(t.season));
          let terms: Term[];
          if (hasSummer) {
            // Removal empties the summer terms (UI confirms first).
            terms = yeardata.terms.filter((t) => !isSummer(t.season));
          } else {
            terms = [...yeardata.terms, newTerm("s1"), newTerm("s2")];
          }
          const years = s.years.map((y) => (y.id === yearId ? { ...y, terms } : y));
          return commit(s, { years });
        }),

      setTermKind: (yearId, termIdx, kind) =>
        set((s) => {
          const years = s.years.map((y) => {
            if (y.id !== yearId) return y;
            const terms = y.terms.map((t, i) => {
              if (i !== termIdx) return t;
              return {
                ...t,
                kind,
                blocks: kind === "coop" ? [] : t.blocks,
                code: kind === "study" ? undefined : t.code,
              };
            });
            return { ...y, terms };
          });
          return commit(s, { years });
        }),

      setCoop: (enabled) => set({ coop: enabled }),

      toggleIgnoreBlock: (blockId) =>
        set((s) =>
          commit(s, {
            ignoredBlocks: s.ignoredBlocks.includes(blockId)
              ? s.ignoredBlocks.filter((id) => id !== blockId)
              : [...s.ignoredBlocks, blockId],
          }),
        ),

      toggleRequirement: (key) =>
        set((s) =>
          commit(s, {
            checkedRequirements: s.checkedRequirements.includes(key)
              ? s.checkedRequirements.filter((k) => k !== key)
              : [...s.checkedRequirements, key],
          }),
        ),

      setProgram: (level, value) => set(() => ({ [level]: value }) as Partial<PlannerState>),

      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      setSidebarTab: (tab) => set({ sidebarTab: tab }),

      setLookupQuery: (q) => set({ lookupQuery: q }),

      undo: () =>
        set((s) => {
          if (s.past.length === 0) return s;
          const prev = s.past[s.past.length - 1];
          return {
            ...prev,
            past: s.past.slice(0, -1),
            future: [snapshot(s), ...s.future].slice(0, MAX_HISTORY),
          };
        }),

      redo: () =>
        set((s) => {
          if (s.future.length === 0) return s;
          const nxt = s.future[0];
          return {
            ...nxt,
            past: [...s.past, snapshot(s)].slice(-MAX_HISTORY),
            future: s.future.slice(1),
          };
        }),
    }),
    {
      name: "reodite-planner",
      storage: createJSONStorage(() => localStorage),
      version: 2,
      // The history stacks (past/future) are intentionally omitted so undo
      // state never bloats localStorage and a reload starts with a clean
      // history. Same slice the account sync sends to the server.
      partialize: persistedSlice,
      migrate: (persisted) => migratePersistedPlan(persisted),
    },
  ),
);
