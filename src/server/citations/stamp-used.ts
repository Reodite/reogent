import type { Citation } from "@/src/shared/citations/citation";

const MARKER_RE = /\[(\d+)\]/g;

/** Marks `used: true` on every citation whose 1-indexed `index` appears as a
 * `[N]` marker in the final assistant text. Live `citations` events carry
 * `used: false`; this runs only on `done` (Property 20). Returns a fresh array;
 * the input is not mutated. */
export function stampUsed(citations: Citation[], finalAssistantText: string): Citation[] {
  if (citations.length === 0) return citations;
  const used = new Set<number>();
  for (const m of finalAssistantText.matchAll(MARKER_RE)) {
    const n = Number(m[1]);
    if (Number.isInteger(n)) used.add(n);
  }
  if (used.size === 0) return citations;
  return citations.map((c) => (used.has(c.index) ? { ...c, used: true } : c));
}
