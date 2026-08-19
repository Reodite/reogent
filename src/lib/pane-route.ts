import type { PaneId } from "@/src/components/shell/pane-registry";

/** URL slugs exposed under `/tools/<slug>`. Keys are the public path segments,
 *  values are the {@link PaneId} registered in {@link PANE_REGISTRY}. */
export const TOOL_SLUG_TO_PANE_ID: Record<string, PaneId> = {
  map: "map",
  courses: "course-lookup",
  prereq: "prereq-tree",
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
