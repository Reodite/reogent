import type { Person } from "../types";

export interface Term {
  key: string; // '2026-fall'
  label: string; // 'Fall 2026'
  start: string; // ISO seasonal boundary
  end: string; // ISO seasonal boundary
}

type Season = "Spring" | "Summer" | "Fall";

function termFor(year: number, season: Season): Term {
  if (season === "Spring") {
    return { key: `${year}-spring`, label: `Spring ${year}`, start: `${year}-01-01`, end: `${year}-04-30` };
  }
  if (season === "Summer") {
    return { key: `${year}-summer`, label: `Summer ${year}`, start: `${year}-05-01`, end: `${year}-08-31` };
  }
  return { key: `${year}-fall`, label: `Fall ${year}`, start: `${year}-09-01`, end: `${year}-12-31` };
}

function termAt(iso: string): Term {
  const year = Number.parseInt(iso.slice(0, 4), 10);
  const month = Number.parseInt(iso.slice(5, 7), 10);
  if (month >= 9) return termFor(year, "Fall");
  if (month >= 5) return termFor(year, "Summer");
  return termFor(year, "Spring");
}

function nextTerm(term: Term): Term {
  if (term.key.endsWith("-spring")) return termFor(Number.parseInt(term.key, 10), "Summer");
  if (term.key.endsWith("-summer")) return termFor(Number.parseInt(term.key, 10), "Fall");
  return termFor(Number.parseInt(term.key, 10) + 1, "Spring");
}

/**
 * Derives every seasonal bucket touched by the group's section ranges. A
 * full-year section contributes to Fall and Spring rather than stretching the
 * Fall bucket across winter and admitting unrelated Spring-only classes.
 */
export function deriveTerms(people: Person[]): Term[] {
  const buckets = new Map<string, Term>();
  for (const person of people) {
    for (const section of person.schedule?.sections ?? []) {
      const { termStart, termEnd } = section;
      if (!termStart || !termEnd) continue;
      let term = termAt(termStart);
      for (let count = 0; count < 24 && term.start <= termEnd; count++) {
        if (term.end >= termStart) buckets.set(term.key, term);
        term = nextTerm(term);
      }
    }
  }
  return [...buckets.values()].sort((a, b) => a.start.localeCompare(b.start));
}

/** Term containing today, else the nearest upcoming, else the latest. */
export function defaultTermKey(terms: Term[], todayIso: string): string | null {
  if (terms.length === 0) return null;
  const current = terms.find((term) => todayIso >= term.start && todayIso <= term.end);
  if (current) return current.key;
  const upcoming = terms.find((term) => term.start > todayIso);
  if (upcoming) return upcoming.key;
  return terms[terms.length - 1].key;
}
