// Client-side course search for the Degree Planner's mini lookup. Works over
// the same course index the Prereq Tree loads (`/api/course-index`), honouring
// the code/subject/filter conventions of the Course Finder plus a free-text
// title fallback so "linear algebra" surfaces MATH 152 etc.

import type { CourseIndexEntry } from "@/app/api/course-index/route";

export type ParsedQuery =
  | { kind: "none" }
  | { kind: "exact"; code: string }
  | { kind: "subject"; subject: string }
  | { kind: "filter"; subject: string; digit: number; op: "=" | "+" | "-" }
  | { kind: "invalidFilter"; reason: string };

/**
 * Parse a lookup-bar input into one of:
 *   - exact:   "CPSC 110" / "CPSC 22" → code-shaped query (1–4 digits).
 *   - subject: "CPSC"                → all courses in that subject
 *   - filter:  "CPSC 100 =" / "+" / "-" → all courses in subject whose first
 *              digit equals / is ≥ / is < the query's first digit
 *
 * "+" includes the boundary digit; "-" excludes it. So `200 +` covers 2xx
 * upward, `250 -` covers 1xx only, `100 =` is exactly 1xx.
 *
 * Filters are only accepted when the number is in X00 form (the canonical
 * level boundary). A trailing operator on any other number yields an
 * `invalidFilter` so the UI can explain instead of silently dropping it.
 */
export function parseQuery(raw: string): ParsedQuery {
  const q = raw.toUpperCase().trim();
  if (!q) return { kind: "none" };

  const opMatch = q.match(/^(.+?)\s*([=+-])$/);
  if (opMatch) {
    const prefix = opMatch[1].trim();
    const op = opMatch[2] as "=" | "+" | "-";
    const filterMatch = prefix.match(/^([A-Z]{2,4})(?:_V)?\s*(\d)00$/);
    if (filterMatch) {
      return {
        kind: "filter",
        subject: filterMatch[1],
        digit: Number(filterMatch[2]),
        op,
      };
    }
    return {
      kind: "invalidFilter",
      reason: "Filters need the X00 form, e.g. CPSC 100 =, DSCI 200 +, WRDS 100 -.",
    };
  }

  const exactMatch = q.match(/^([A-Z]{2,4})(?:_V)?\s*(\d{1,4}[A-Z]?)$/);
  if (exactMatch) {
    return { kind: "exact", code: `${exactMatch[1]} ${exactMatch[2]}` };
  }

  const subjectMatch = q.match(/^([A-Z]{1,5})(?:_V)?$/);
  if (subjectMatch) {
    return { kind: "subject", subject: subjectMatch[1] };
  }

  return { kind: "none" };
}

/**
 * Lightweight course search for the planner's mini-lookup. Combines code-
 * shaped queries (subject / code / filter) with a free-text title pass:
 *   - exact code → single hit (or prefix expansion if no exact match)
 *   - subject → all codes in that subject
 *   - filter → subject filtered by level
 *   - anything else → substring match on code + title
 *
 * Returns at most `limit` entries.
 */
export function searchCourses(index: Map<string, CourseIndexEntry>, rawQuery: string, limit = 25): CourseIndexEntry[] {
  const trimmed = rawQuery.trim();
  if (!trimmed) return [];
  const parsed = parseQuery(trimmed);
  const codes = Array.from(index.keys()).sort();
  const out: CourseIndexEntry[] = [];
  const seen = new Set<string>();
  const push = (entry: CourseIndexEntry | undefined) => {
    if (!entry) return;
    if (seen.has(entry.code)) return;
    seen.add(entry.code);
    out.push(entry);
  };

  if (parsed.kind === "exact") {
    const exact = index.get(parsed.code);
    if (exact) push(exact);
    if (out.length < limit) {
      for (const code of codes) {
        if (out.length >= limit) break;
        if (code === parsed.code) continue;
        if (code.startsWith(parsed.code)) push(index.get(code));
      }
    }
  } else if (parsed.kind === "subject") {
    const prefix = `${parsed.subject} `;
    for (const code of codes) {
      if (out.length >= limit) break;
      if (code.startsWith(prefix)) push(index.get(code));
    }
  } else if (parsed.kind === "filter") {
    const prefix = `${parsed.subject} `;
    for (const code of codes) {
      if (out.length >= limit) break;
      if (!code.startsWith(prefix)) continue;
      const num = code.split(" ")[1];
      if (!num) continue;
      const d = Number(num[0]);
      if (Number.isNaN(d)) continue;
      const ok = parsed.op === "=" ? d === parsed.digit : parsed.op === "+" ? d >= parsed.digit : d < parsed.digit;
      if (ok) push(index.get(code));
    }
  }

  // Free-text title pass — runs when we have no code hits OR when the user
  // typed something the code parser dropped on the floor (kind: 'none' /
  // 'invalidFilter'). Substring match against code + title, case-insensitive.
  if (out.length < limit) {
    const needle = trimmed.toLowerCase();
    for (const entry of index.values()) {
      if (out.length >= limit) break;
      if (seen.has(entry.code)) continue;
      const hay = `${entry.code} ${entry.title}`.toLowerCase();
      if (hay.includes(needle)) push(entry);
    }
  }

  return out.slice(0, limit);
}
