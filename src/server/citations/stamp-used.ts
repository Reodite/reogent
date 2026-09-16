import { citationMarkers, type Citation } from "@/src/shared/citations/citation";

/** Marks citations named by single or comma-separated markers in final text.
 * Live citations keep `used: false` until this runs on `done`.
 * Leaves the input unchanged; returns it when no positive safe indices appear. */
export function stampUsed(citations: Citation[], finalAssistantText: string): Citation[] {
  if (citations.length === 0) return citations;
  const used = new Set<number>();
  for (const marker of citationMarkers(finalAssistantText)) {
    for (const reference of marker.references) {
      const index = Number(reference);
      if (Number.isSafeInteger(index) && index > 0) used.add(index);
    }
  }
  if (used.size === 0) return citations;
  return citations.map((c) => (used.has(c.index) ? { ...c, used: true } : c));
}
