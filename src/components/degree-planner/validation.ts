import type { Year } from "@/src/lib/planner-model";
import type { CourseIndexEntry } from "@/src/shared/course-index";
import { isSatisfied, missingPrereqs, parsePrereq } from "@/src/shared/prereq-ast";

// Shared type for the per-block prereq/coreq evaluation result. Computed
// once per planner render in degree-planner-pane.tsx (memoized) and passed
// down to each CourseBlock so the error border + tooltip stays in sync with
// the cumulative completed-set walk.
//
// `completedBefore` / `completedSameOrBefore` carry the snapshot of taken
// courses at the moment this block was evaluated — prereqs check against
// the first, coreqs against the second. They're passed through to the
// CourseInfoPopup so it can re-evaluate the AST and highlight at clause
// granularity (the whole "either A or B" if all branches are unmet, only
// the unmet half of "A and B", and so on).

/** Returns every course code placed more than once. */
export function findDuplicateCourseCodes(years: Year[]): Set<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const year of years) {
    for (const term of year.terms) {
      for (const block of term.blocks) {
        if (seen.has(block.code)) duplicates.add(block.code);
        seen.add(block.code);
      }
    }
  }
  return duplicates;
}

export interface BlockValidation {
  ok: boolean;
  missing: string[];
  completedBefore: Set<string>;
  completedSameOrBefore: Set<string>;
}

/** Evaluates each placement against earlier-term prerequisites and same-or-earlier corequisites without mutating the plan. */
export function validatePlan(
  years: Year[],
  courseIndex: Map<string, CourseIndexEntry> | null,
  ignoredSet: Set<string>,
): Map<string, BlockValidation> {
  const out = new Map<string, BlockValidation>();
  if (!courseIndex) return out;
  const duplicateCodes = findDuplicateCourseCodes(years);
  const cumulative = new Set<string>();
  for (const year of years) {
    for (const term of year.terms) {
      const codesThisTerm = new Set(term.blocks.map((b) => b.code));
      const completedBefore = new Set(cumulative);
      const completedSameOrBefore = new Set([...cumulative, ...codesThisTerm]);
      for (const block of term.blocks) {
        const entry = courseIndex.get(block.code);
        const missing = duplicateCodes.has(block.code) ? ["duplicate course in plan"] : [];
        if (!entry) {
          const ignored = ignoredSet.has(block.id);
          out.set(block.id, {
            ok: missing.length === 0 || ignored,
            missing,
            completedBefore,
            completedSameOrBefore,
          });
          continue;
        }
        const prereqAst = parsePrereq(entry.prerequisite);
        const coreqAst = parsePrereq(entry.corequisite);
        if (prereqAst && !isSatisfied(prereqAst, completedBefore)) {
          missing.push(...missingPrereqs(prereqAst, completedBefore).map((m) => `prereq ${m}`));
        }
        if (coreqAst && !isSatisfied(coreqAst, completedSameOrBefore)) {
          missing.push(...missingPrereqs(coreqAst, completedSameOrBefore).map((m) => `coreq ${m}`));
        }
        const ignored = ignoredSet.has(block.id);
        out.set(block.id, {
          ok: missing.length === 0 || ignored,
          missing,
          completedBefore,
          completedSameOrBefore,
        });
      }
      for (const code of codesThisTerm) cumulative.add(code);
    }
  }
  return out;
}

/** Turns an internal `missing` token into a sentence the user can act on. */
export function describeIssue(token: string): string {
  if (token === "duplicate course in plan") {
    return "Duplicate course: it already appears elsewhere in your plan.";
  }
  if (token.startsWith("prereq ")) {
    return `Prerequisite: complete ${token.slice("prereq ".length)} in an earlier term.`;
  }
  if (token.startsWith("coreq ")) {
    return `Corequisite: take ${token.slice("coreq ".length)} in this term or an earlier term.`;
  }
  return token;
}

// Neutral fallback for rare cases where a block id isn't in the
// validations map yet (e.g. the drag overlay racing the recompute).
// Empty completed sets cause the popup to render prereqs/coreqs without
// highlighting — safer than crashing.
export const EMPTY_VALIDATION: BlockValidation = {
  ok: true,
  missing: [],
  completedBefore: new Set(),
  completedSameOrBefore: new Set(),
};
