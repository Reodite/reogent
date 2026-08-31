import type { Year } from "./planner-store";

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

/** Turns an internal `missing` token into a sentence the user can act on. */
export function describeIssue(token: string): string {
  if (token === "duplicate course in plan") {
    return "Duplicate — this course already appears elsewhere in your plan.";
  }
  if (token.startsWith("prereq ")) {
    return `Missing prerequisite: ${token.slice("prereq ".length)} must be completed in an earlier term.`;
  }
  if (token.startsWith("coreq ")) {
    return `Missing corequisite: ${token.slice("coreq ".length)} must be taken no later than this term.`;
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
