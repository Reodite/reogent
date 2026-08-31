import {
  createPlannerYear,
  usePlanner,
  type Season,
  type Term,
  type Year,
} from "@/src/components/degree-planner/planner-store";

interface CoopCoursePlacement {
  code: string;
  year: number;
  season: Season;
}

export interface CoopInfo {
  shortLabel: string;
  blurb: string;
  courses: (string | undefined)[];
  sequence: [number, Season][];
  studyCourses?: CoopCoursePlacement[];
  years: number;
}

export const COOP_SUPPORT: Record<string, CoopInfo> = {
  "The Faculty of Science": {
    shortLabel: "Science co-op",
    blurb: "A typical sequence uses four summer and winter work terms and ends with a study term.",
    courses: [undefined, undefined, undefined, undefined],
    sequence: [
      [1, "s1"],
      [2, "w2"],
      [3, "w1"],
      [3, "s1"],
    ],
    years: 5,
  },
  "The Faculty of Applied Science": {
    shortLabel: "Engineering co-op",
    blurb: "A typical sequence uses four work terms, including at least one winter work term.",
    courses: [undefined, undefined, undefined, undefined],
    sequence: [
      [1, "s1"],
      [2, "w2"],
      [3, "s1"],
      [4, "w1"],
    ],
    studyCourses: [{ code: "APSC 107", year: 0, season: "w2" }],
    years: 5,
  },
  "The Faculty of Arts": {
    shortLabel: "Arts co-op",
    blurb: "The sequence pairs three search terms with three work terms and ends with a study term.",
    courses: ["ARTC 110", "ARTC 210", "ARTC 310"],
    sequence: [
      [1, "s1"],
      [2, "w2"],
      [3, "s1"],
    ],
    studyCourses: [
      { code: "ARTC 100", year: 1, season: "w2" },
      { code: "ARTC 200", year: 2, season: "w1" },
      { code: "ARTC 300", year: 3, season: "w2" },
    ],
    years: 5,
  },
  "The Faculty of Commerce and Business Administration": {
    shortLabel: "Sauder co-op",
    blurb: "A typical sequence uses at least three work terms, including a winter work term.",
    courses: ["COMM 380", "COMM 381", "COMM 480"],
    sequence: [
      [1, "s1"],
      [2, "w2"],
      [3, "s1"],
    ],
    years: 5,
  },
  "The Faculty of Forestry and Environmental Stewardship": {
    shortLabel: "Forestry co-op",
    blurb: "A typical sequence spreads work terms across summer and winter sessions.",
    courses: [undefined, undefined, undefined],
    sequence: [
      [1, "s1"],
      [2, "w2"],
      [3, "s1"],
    ],
    years: 5,
  },
  "The Faculty of Land and Food Systems": {
    shortLabel: "LFS co-op",
    blurb: "A typical sequence starts after first year and includes a winter work term.",
    courses: [undefined, undefined, undefined],
    sequence: [
      [1, "s1"],
      [2, "w2"],
      [3, "s1"],
    ],
    years: 5,
  },
  "The Faculty of Pharmaceutical Sciences": {
    shortLabel: "PharmSci co-op",
    blurb: "The BPSc co-op sequence uses summer work terms within the program schedule.",
    courses: [undefined, undefined, undefined],
    sequence: [
      [1, "s1"],
      [2, "s1"],
      [3, "s1"],
    ],
    years: 5,
  },
};

export interface CoopSequenceResult {
  years: Year[];
  skippedTerms: number;
}

/** Builds an editable co-op template without replacing occupied terms. */
export function buildCoopSequence(faculty: string, currentYears: Year[]): CoopSequenceResult | null {
  const info = COOP_SUPPORT[faculty];
  if (!info) return null;

  const years = currentYears.map((year) => ({
    ...year,
    terms: year.terms.map((term) => ({ ...term, blocks: [...term.blocks] })),
  }));
  while (years.length < info.years) years.push(createPlannerYear(years.length));

  let skippedTerms = 0;
  info.sequence.forEach(([yearIndex, season], sequenceIndex) => {
    const year = years[yearIndex];
    if (!year) return;
    const seasons: Season[] = isSummerSeason(season) ? ["s1", "s2"] : [season];
    const terms = seasons.map((value) => ensureTerm(year, value));
    if (terms.some((term) => term.kind === "study" && term.blocks.length > 0)) {
      skippedTerms++;
      return;
    }
    for (const term of terms) {
      term.kind = "coop";
      term.blocks = [];
      term.code = info.courses[sequenceIndex];
    }
  });

  const plannedCodes = new Set(
    years.flatMap((year) => year.terms.flatMap((term) => term.blocks.map((block) => block.code))),
  );
  for (const placement of info.studyCourses ?? []) {
    if (plannedCodes.has(placement.code)) continue;
    const year = years[placement.year];
    if (!year) continue;
    const term = ensureTerm(year, placement.season);
    if (term.kind !== "study") continue;
    term.blocks.push({ id: newBlockId(), code: placement.code });
    plannedCodes.add(placement.code);
  }

  return { years, skippedTerms };
}

/** Applies a co-op template as one undoable planner action. */
export function applyCoopSequence(faculty: string): CoopSequenceResult | null {
  const planner = usePlanner.getState();
  const result = buildCoopSequence(faculty, planner.years);
  if (!result) return null;
  planner.replaceYears(result.years);
  return result;
}

function ensureTerm(year: Year, season: Season): Term {
  const existing = year.terms.find((term) => term.season === season);
  if (existing) return existing;
  const term: Term = { season, kind: "study", blocks: [] };
  year.terms.push(term);
  year.terms.sort((a, b) => seasonOrder(a.season) - seasonOrder(b.season));
  return term;
}

function isSummerSeason(season: Season): boolean {
  return season === "s1" || season === "s2";
}

function seasonOrder(season: Season): number {
  return { w1: 0, w2: 1, s1: 2, s2: 3 }[season];
}

function newBlockId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}
