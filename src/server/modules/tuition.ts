import type { DatasetModule, SearchClient } from "../core/types";

export interface TuitionDoc {
  program: string;
  program_slug: string;
  student_type: "domestic" | "international";
  cohort_year: number | null;
  cohort_rule: "exactly" | "or_later" | null;
  applies_to: string | null; // e.g. "Year 1" vs "Years 2 to 5"
  rate_type: string | null; // column qualifier, e.g. "Law courses"
  unit: string | null; // per_credit | per_instalment | per_year | per_term
  amount_cad: number; // single rate, or the sum of the instalment schedule
  instalments: number[] | null; // per_instalment schedules, in published order
}

// biome-ignore lint/suspicious/noExplicitAny: raw dataset rows
type Row = Record<string, any>;

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Keep every row with a numeric amount, whatever the billing unit — flat-fee
 *  programs bill per_instalment (74% of the table), not per_credit. Derive
 *  `program_slug` (4.2). The ID extends the design's 4-part key with
 *  applies_to, the column qualifier, and the unit — real data has per-year,
 *  per-course-level, and per-unit rate variants. */
export function transformTuition(row: Row): { id: string; doc: TuitionDoc } | null {
  if (typeof row.amount !== "number" || !row.program) return null;
  const qualifier = String(row.column ?? "").match(/\(([^)]+)\)\s*$/)?.[1] ?? null;
  const doc: TuitionDoc = {
    program: String(row.program),
    program_slug: slugify(String(row.program)),
    student_type: row.student_type,
    cohort_year: row.cohort_year ?? null,
    cohort_rule: row.cohort_rule ?? null,
    applies_to: row.applies_to ?? null,
    rate_type: qualifier && !/^commence/i.test(qualifier) ? qualifier : null,
    unit: row.unit ?? null,
    amount_cad: row.amount,
    instalments: null,
  };
  return { id: tuitionId(doc), doc };
}

function tuitionId(doc: TuitionDoc): string {
  return [
    doc.program_slug,
    doc.student_type,
    doc.cohort_year,
    doc.cohort_rule,
    slugify(doc.applies_to ?? ""),
    slugify(doc.rate_type ?? ""),
    slugify(doc.unit ?? ""),
  ].join("#");
}

/** Instalment schedules arrive as one indistinguishable row per instalment
 *  (same program/cohort/column, only the amount differs). Collapse each key
 *  group to one doc: `instalments` keeps the schedule, `amount_cad` its sum. */
export function meltTuition(rows: Row[]): TuitionDoc[] {
  const groups = new Map<string, TuitionDoc[]>();
  for (const row of rows) {
    const t = transformTuition(row);
    if (!t) continue;
    groups.set(t.id, [...(groups.get(t.id) ?? []), t.doc]);
  }
  return [...groups.values()].map((g) =>
    g.length === 1
      ? g[0]
      : {
          ...g[0],
          amount_cad: Math.round(g.reduce((s, r) => s + r.amount_cad, 0) * 100) / 100,
          instalments: g.map((r) => r.amount_cad),
        },
  );
}

/** Cohort resolution: exact-year match wins, else the newest `or_later` rule
 *  at or before the cohort year, else the rate with no cohort restriction. */
function pickCohortRow(rows: TuitionDoc[], cohortYear: number): TuitionDoc | null {
  const exact = rows.find((r) => r.cohort_rule === "exactly" && r.cohort_year === cohortYear);
  if (exact) return exact;
  const orLater = rows
    .filter((r) => r.cohort_rule === "or_later" && r.cohort_year !== null && r.cohort_year <= cohortYear)
    .sort((a, b) => (b.cohort_year ?? 0) - (a.cohort_year ?? 0))[0];
  if (orLater) return orLater;
  return rows.find((r) => r.cohort_year === null) ?? null;
}

/** Resolves tuition for the given program slug, student type, and cohort year.
 *  Replicates the per-tool logic but exported so get_costs can dispatch to it. */
export async function lookupTuition(
  input: { program_slug: string; student_type: string; cohort_year: number },
  search: SearchClient,
): Promise<Record<string, unknown>> {
  const slug = slugify(String(input.program_slug ?? ""));
  const studentType = String(input.student_type ?? "").toLowerCase();
  const cohortYear = Number(input.cohort_year);
  const bySlug = async (s: string) => {
    const res = await search.index("tuition").search("", {
      filter: `program_slug = '${s}' AND student_type = '${studentType}'`,
      limit: 50,
    });
    return res.hits as unknown as TuitionDoc[];
  };

  let rows = await bySlug(slug);
  if (rows.length === 0) {
    const fuzzy = await search.index("tuition").search(slug.replace(/-/g, " "), {
      filter: `student_type = '${studentType}'`,
      limit: 1,
    });
    const best = fuzzy.hits[0] as unknown as TuitionDoc | undefined;
    if (best) rows = await bySlug(best.program_slug);
  }
  const variants = new Map<string, TuitionDoc[]>();
  for (const r of rows) {
    const key = `${r.applies_to}#${r.rate_type}#${r.unit}`;
    variants.set(key, [...(variants.get(key) ?? []), r]);
  }
  const resolved = [...variants.values()].map((group) => pickCohortRow(group, cohortYear)).filter((r) => r !== null);
  if (resolved.length === 0) {
    throw new Error(
      `No tuition found for program "${input.program_slug}" (${studentType}, cohort ${cohortYear}). Try kind "estimate" for cost estimates, or a different program name (e.g. "Science" instead of "Computer Science").`,
    );
  }
  const primary =
    resolved.find((r) => r.unit === "per_credit" && r.applies_to === null && r.rate_type === null) ??
    resolved.find((r) => r.unit === "per_credit") ??
    resolved.find((r) => r.applies_to === null && r.rate_type === null) ??
    resolved[0];
  const others = resolved.filter((r) => r !== primary);
  return {
    program: primary.program,
    program_slug: primary.program_slug,
    student_type: primary.student_type,
    cohort_year: cohortYear,
    unit: primary.unit,
    amount_cad: primary.amount_cad,
    ...(primary.instalments ? { instalments: primary.instalments } : {}),
    ...(primary.unit === "per_credit" ? { per_credit_cad: primary.amount_cad } : {}),
    ...(primary.applies_to ? { applies_to: primary.applies_to } : {}),
    ...(primary.rate_type ? { rate_type: primary.rate_type } : {}),
    ...(others.length > 0
      ? {
          other_rates: others.map((r) => ({
            applies_to: r.applies_to,
            rate_type: r.rate_type,
            unit: r.unit,
            amount_cad: r.amount_cad,
            ...(r.instalments ? { instalments: r.instalments } : {}),
          })),
        }
      : {}),
  };
}

export const tuition: DatasetModule = {
  name: "tuition",
  indices: [
    {
      index: "tuition",
      settings: {
        searchableAttributes: ["program", "program_slug"],
        filterableAttributes: ["program_slug", "student_type", "cohort_year", "cohort_rule"],
      },
      async *read(store) {
        yield* meltTuition((await store.getJson("finances/tuition.json")) as Row[]);
      },
      transform(doc: TuitionDoc) {
        return { id: tuitionId(doc), doc };
      },
    },
  ],
  tools: [],
};
