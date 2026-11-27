import type { CitationSeed } from "@/src/server/citations/extractors";
import type { Citation } from "@/src/shared/citations/citation";

const dedupeKey = (s: CitationSeed): string => `${s.source_url ?? ""}\u0000${s.label}`;

/** Assigns contiguous 1-based indices, deduplicates by `source_url` and `label`,
 * and leaves `used` false until `stampUsed` runs on `done`. */
export function allocateCitations(seeds: CitationSeed[]): Citation[] {
  const seen = new Set<string>();
  const unique: CitationSeed[] = [];
  for (const s of seeds) {
    const key = dedupeKey(s);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(s);
    }
  }
  return unique.map((s, i) => ({ ...s, index: i + 1, used: false }));
}
