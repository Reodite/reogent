import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { TERM_CREDIT_TARGET, type Year } from "@/src/components/degree-planner/planner-store";
import { isSatisfied, parsePrereq } from "@/src/shared/prereq-ast";

export interface CourseTarget {
  yearId: string;
  termIdx: number;
}

/** Finds the nearest study term that fits the course and its prerequisites. */
export function findCourseTarget(
  years: Year[],
  courseIndex: Map<string, CourseIndexEntry>,
  code: string,
  preferredYear: number,
): CourseTarget | null {
  if (years.some((year) => year.terms.some((term) => term.blocks.some((block) => block.code === code)))) return null;

  const entry = courseIndex.get(code);
  const courseCredits = entry?.credits ?? 3;
  const prereq = parsePrereq(entry?.prerequisite);
  const coreq = parsePrereq(entry?.corequisite);
  const completed = new Set<string>();
  const slots: Array<{
    target: CourseTarget;
    yearIndex: number;
    ready: boolean;
    fits: boolean;
  }> = [];

  years.forEach((year, yearIndex) => {
    year.terms.forEach((term, termIdx) => {
      if (term.kind !== "study") return;
      const current = new Set(term.blocks.map((block) => block.code));
      const sameOrBefore = new Set([...completed, ...current]);
      const load = term.blocks.reduce((sum, block) => sum + (courseIndex.get(block.code)?.credits ?? 3), 0);
      slots.push({
        target: { yearId: year.id, termIdx },
        yearIndex,
        ready: (!prereq || isSatisfied(prereq, completed)) && (!coreq || isSatisfied(coreq, sameOrBefore)),
        fits: load + courseCredits <= TERM_CREDIT_TARGET[term.season],
      });
      for (const currentCode of current) completed.add(currentCode);
    });
  });

  if (slots.length === 0) return null;
  const startYear = Math.max(0, Math.min(preferredYear, years.length - 1));
  const preferred = slots.filter((slot) => slot.yearIndex >= startYear);
  const candidates = preferred.length > 0 ? preferred : slots;
  return (
    candidates.find((slot) => slot.ready && slot.fits)?.target ??
    candidates.find((slot) => slot.ready)?.target ??
    candidates.find((slot) => slot.fits)?.target ??
    candidates[0].target
  );
}
