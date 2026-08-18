import type { Citation, CitationSeed } from "@/src/shared/citations/citation";

const dedupeKey = (s: CitationSeed): string => `${s.source_url ?? ""}\u0000${s.label}`;

/** Assigns 1-indexed `index`, dedupes by `source_url`+`label`, leaves `used`
 * false until `stampUsed` runs on `done`. Satisfies Property 18: the returned
 * `index` values form exactly `1..length` with no gaps or duplicates. */
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
