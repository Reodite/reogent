import type { DatasetModule } from "../core/types";
import { lookupTuition, slugify, type TuitionDoc } from "./tuition";

export interface CostEstimateDoc {
  program_id: number;
  program: string;
  degrees: string[];
  url: string;
  area: string;
  matched_by: string | null; // name-based match confidence — always surface it
  tuition_domestic: number | null;
  tuition_international: number | null;
  student_fees: number | null;
  books_supplies: number | null;
  educational_total_domestic: number | null;
  educational_total_international: number | null;
  custom_tuition_message: string | null;
}

export interface LivingCostDoc {
  item: string;
  variant: string | null;
  amount: number;
  basis: string | null;
}

export interface StudentFeeDoc {
  section: string | null;
  item: string;
  divider: string | null; // sub-row label, e.g. "Deferred examination written off-campus"
  context: string | null;
  student_type: string | null;
  cohort_year: number | null;
  unit: string | null;
  amount: number;
  amount_text: string | null;
  url: string | null;
}

// biome-ignore lint/suspicious/noExplicitAny: raw dataset rows
type Row = Record<string, any>;

function transformCostEstimate(row: Row): { id: string; doc: CostEstimateDoc } | null {
  if (row.program_id == null || !row.program) return null;
  return {
    id: String(row.program_id),
    doc: {
      program_id: row.program_id,
      program: String(row.program),
      degrees: Array.isArray(row.degrees) ? row.degrees : [],
      url: String(row.url ?? ""),
      area: String(row.area ?? ""),
      matched_by: row.matched_by ?? null,
      tuition_domestic: row.tuition_domestic ?? null,
      tuition_international: row.tuition_international ?? null,
      student_fees: row.student_fees ?? null,
      books_supplies: row.books_supplies ?? null,
      educational_total_domestic: row.educational_total_domestic ?? null,
      educational_total_international: row.educational_total_international ?? null,
      custom_tuition_message: row.custom_tuition_message ?? null,
    },
  };
}

export function transformLivingCost(row: Row): { id: string; doc: LivingCostDoc } | null {
  if (!row.item || typeof row.amount !== "number") return null;
  const doc: LivingCostDoc = {
    item: String(row.item),
    variant: row.variant ?? null,
    amount: row.amount,
    basis: row.basis ?? null,
  };
  return { id: slugify(`${doc.item}-${doc.variant ?? ""}`), doc };
}

export function transformStudentFee(row: Row): { id: string; doc: StudentFeeDoc } | null {
  if (!row.item || typeof row.amount !== "number") return null;
  const doc: StudentFeeDoc = {
    section: row.section ?? null,
    item: String(row.item),
    divider: row.divider || null,
    context: row.context ?? null,
    student_type: row.student_type ?? null,
    cohort_year: row.cohort_year ?? null,
    unit: row.unit ?? null,
    amount: row.amount,
    amount_text: row.amount_text ?? null,
    url: row.url ?? null,
  };
  return {
    // divider + amount_text are needed for uniqueness: some tables repeat the
    // same item across sub-rows, and one Dentistry pair differs only in amount
    id: [row.page, doc.section, doc.item, doc.student_type, doc.cohort_year, row.column, doc.divider, doc.amount_text]
      .map((p) => slugify(String(p ?? "")))
      .join("#"),
    doc,
  };
}

export const costs: DatasetModule = {
  name: "costs",
  indices: [
    {
      index: "program_cost_estimates",
      settings: {
        searchableAttributes: ["program", "degrees"],
        filterableAttributes: ["area"],
      },
      async *read(store) {
        yield* (await store.getJson("finances/program_cost_estimates.json")) as Row[];
      },
      transform: transformCostEstimate,
    },
    {
      index: "living_costs",
      settings: {
        searchableAttributes: ["item"],
        filterableAttributes: ["variant", "basis"],
      },
      async *read(store) {
        yield* (await store.getJson("finances/living_costs.json")) as Row[];
      },
      transform: transformLivingCost,
    },
    {
      index: "student_fees",
      settings: {
        searchableAttributes: ["item", "divider", "section", "context"],
        filterableAttributes: ["student_type"],
      },
      async *read(store) {
        yield* (await store.getJson("finances/student_fees.json")) as Row[];
      },
      transform: transformStudentFee,
    },
  ],
  tools: [
    {
      spec: {
        name: "get_costs",
        description:
          "One tool for money questions at UBC: tuition rates (kind 'tuition'), UBC's published first-year cost estimate (kind 'estimate'), living-cost figures (kind 'living'), and Board-approved student fees (kind 'fees'). All amounts in CAD. If kind 'tuition' finds no rate for a program, try kind 'estimate' instead — it covers programs the tuition table doesn't.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              kind: {
                type: "string",
                enum: ["tuition", "estimate", "living", "fees"],
                description: 'What to look up: "tuition", "estimate", "living", or "fees"',
              },
              program_slug: {
                type: "string",
                description: 'Tuition: slugified program name, e.g. "bachelor-of-science". Words also work.',
              },
              student_type: {
                type: "string",
                description: 'Tuition: "domestic" or "international"',
              },
              cohort_year: {
                type: "number",
                description: "Tuition: year the student starts the program, e.g. 2026",
              },
              program: {
                type: "string",
                description: 'Estimate: program name, e.g. "Computer Science"',
              },
              item: {
                type: "string",
                description: 'Living: optional filter, e.g. "housing" or "meal"',
              },
              query: { type: "string", description: "Fees: keywords to match fee names and sections" },
              fees_student_type: {
                type: "string",
                description: 'Fees: optional filter, "domestic" or "international"',
              },
            },
            required: ["kind"],
          },
        },
      },
      async execute(input, search) {
        const kind = String(input.kind ?? "");
        switch (kind) {
          case "tuition": {
            const slug = input.program_slug ? String(input.program_slug) : "";
            const stype = input.student_type ? String(input.student_type) : "";
            const cy = input.cohort_year;
            if (!slug || !stype || cy === undefined) {
              throw new Error(
                `kind 'tuition' requires program_slug (got "${slug}"), student_type (got "${stype}"), and cohort_year (got ${cy})`,
              );
            }
            const studentType = String(input.student_type).toLowerCase();
            const cohortYear = Number(input.cohort_year);
            try {
              return {
                kind: "tuition",
                ...(await lookupTuition(
                  {
                    program_slug: String(input.program_slug),
                    student_type: String(input.student_type),
                    cohort_year: Number(input.cohort_year),
                  },
                  search,
                )),
              };
            } catch {
              // No exact tuition row. Search per-token: Meilisearch ANDs query
              // terms, so "bachelor of arts" won't match "Arts" (no "bachelor"
              // token). Fall back by trying each word individually.
              const words = String(input.program_slug)
                .replace(/-/g, " ")
                .split(/\s+/)
                .filter((w) => w.length >= 3);
              let best: TuitionDoc | undefined;
              for (const word of words) {
                const res = await search.index("tuition").search(word, {
                  filter: `student_type = '${studentType}'`,
                  limit: 1,
                });
                best = res.hits[0] as unknown as TuitionDoc | undefined;
                if (best) break;
              }
              if (best) {
                const result = await lookupTuition(
                  { program_slug: best.program_slug, student_type: studentType, cohort_year: cohortYear },
                  search,
                );
                return { ...result, note: `Closest match for "${input.program_slug}"` };
              }
              // No programs at all for this student type.
              return {
                kind: "tuition",
                found: false,
                requested_program_slug: String(input.program_slug),
                message: `No tuition data found for "${input.program_slug}" (${studentType}). Try kind="estimate" for a cost estimate instead.`,
              };
            }
          }
          case "estimate": {
            if (!input.program) throw new Error("kind 'estimate' requires program");
            const res = await search.index("program_cost_estimates").search(String(input.program), { limit: 1 });
            const doc = res.hits[0] as unknown as CostEstimateDoc | undefined;
            if (!doc) {
              throw new Error(
                `No published cost estimate for "${input.program}" — UBC has no estimate for some programs`,
              );
            }
            const { matched_by, ...rest } = doc;
            return { kind: "estimate", ...rest, match_confidence: matched_by };
          }
          case "living": {
            const res = await search.index("living_costs").search(input.item ? String(input.item) : "", {
              limit: 50,
            });
            const hits = res.hits;
            if (hits.length === 0) throw new Error(`No living-cost figures matched "${input.item}"`);
            return { kind: "living", living_costs: hits as unknown as LivingCostDoc[] };
          }
          case "fees": {
            if (!input.query) throw new Error("kind 'fees' requires query");
            const filter = input.fees_student_type
              ? `student_type = '${String(input.fees_student_type).toLowerCase()}'`
              : undefined;
            const res = await search.index("student_fees").search(String(input.query), { filter, limit: 20 });
            const hits = res.hits;
            if (hits.length === 0) throw new Error(`No student fees matched "${input.query}"`);
            return { kind: "fees", fees: hits as unknown as StudentFeeDoc[] };
          }
          default:
            throw new Error(`Unknown kind "${kind}" — expected tuition, estimate, living, or fees`);
        }
      },
    },
  ],
};
