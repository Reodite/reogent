/** Winter session terms and the two optional summer terms, in academic-year order. */
export type Season = "w1" | "w2" | "s1" | "s2";

/** Co-op work terms hold no course blocks and contribute no degree credits. */
export type TermKind = "study" | "coop";

/** Labels and calendar months for a planner season. */
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

export const SEASON_ORDER: Season[] = ["w1", "w2", "s1", "s2"];

// Summer terms last half as long as winter terms.
export const TERM_CREDIT_TARGET: Record<Season, number> = { w1: 15, w2: 15, s1: 7, s2: 7 };
export const TERM_CREDIT_WARN: Record<Season, number> = { w1: 18, w2: 18, s1: 8, s2: 8 };

/** A course placement with stable identity for movement and removal. */
export interface PlannedBlock {
  id: string;
  code: string;
}

/** A study or co-op term in a degree plan. */
export interface Term {
  season: Season;
  kind: TermKind;
  blocks: PlannedBlock[];
  /** Display-only transcript code for a co-op work term; excluded from degree credits and dragging. */
  code?: string;
}

/** An academic year containing ordered terms. */
export interface Year {
  id: string;
  label: string;
  terms: Term[];
}

export const MIN_YEARS = 3;
export const MAX_YEARS = 6;
export const DEFAULT_YEARS = 4;

/** Creates a planner identifier, using a random-string fallback when UUID support is unavailable. */
export function createPlannerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}

/** Creates an empty study term for the supplied season. */
export function createStudyTerm(season: Season): Term {
  return { season, kind: "study", blocks: [] };
}

/** Creates an academic year with both winter study terms. */
export function createPlannerYear(index: number): Year {
  return {
    id: createPlannerId(),
    label: `Year ${index + 1}`,
    terms: [createStudyTerm("w1"), createStudyTerm("w2")],
  };
}

/** Identifies either half of the summer session. */
export function isSummer(season: Season): boolean {
  return season === "s1" || season === "s2";
}
