import type { PaneId } from "@/src/components/shell/pane-registry";
import { canonicalize } from "@/src/shared/course-code";

/** URL slugs exposed under `/tools/<slug>`. Keys are the public path segments,
 *  values are the {@link PaneId} registered in {@link PANE_REGISTRY}. */
export const TOOL_SLUG_TO_PANE_ID: Record<string, PaneId> = {
  map: "map",
  courses: "course-lookup",
  prereq: "prereq-tree",
  planner: "degree-planner",
  schedule: "schedule",
  calendar: "calendar",
};

/** Inverse of {@link TOOL_SLUG_TO_PANE_ID}: every registered pane maps to its
 *  public slug (or null if none exists). */
export const PANE_ID_TO_TOOL_SLUG: Record<PaneId, string | null> = Object.fromEntries(
  Object.entries(TOOL_SLUG_TO_PANE_ID).map(([slug, id]) => [id, slug]),
) as Record<PaneId, string | null>;

/** Resolves a `/tools/<slug>` segment to its {@link PaneId}, or null when the
 *  slug is not a known tool. */
export function parseToolSlug(slug: string | undefined | null): PaneId | null {
  if (!slug) return null;
  return TOOL_SLUG_TO_PANE_ID[slug] ?? null;
}

/** Returns the public `/tools/<slug>` segment for a pane, or null when the pane
 *  has no slug (e.g. registered externally without one). */
export function paneIdToSlug(id: PaneId): string | null {
  return PANE_ID_TO_TOOL_SLUG[id] ?? null;
}

/** URL segment for a course detail page: "MATH 100" → "MATH100". */
export function courseCodeToSlug(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase();
}

/** Canonical "SUBJ NUM" code from a detail-page segment ("MATH100", "math-100"), or null when the segment is not a full code. */
export function courseSlugToCode(slug: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    return null;
  }
  const r = canonicalize(decoded);
  return r?.kind === "code" ? r.raw : null;
}
