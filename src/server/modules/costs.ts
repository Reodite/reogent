import type { DatasetModule } from "../core/types";
import { slugify } from "./tuition";

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

export function transformCostEstimate(row: Row): { id: string; doc: CostEstimateDoc } | null {
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
        name: "get_cost_estimate",
        description:
          "UBC's own first-year cost estimate for an undergraduate program: tuition (domestic and international), student fees, books and supplies, and totals, in CAD. The program-to-estimate link is name-based — report the match_confidence to the user.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              program: { type: "string", description: 'Program name, e.g. "Computer Science"' },
            },
            required: ["program"],
          },
        },
      },
      async execute(input, search) {
        const res = await search.index("program_cost_estimates").search(String(input.program), { limit: 1 });
        const doc = res.hits[0] as unknown as CostEstimateDoc | undefined;
        if (!doc) {
          throw new Error(`No published cost estimate for "${input.program}" — UBC has no estimate for some programs`);
        }
        const { matched_by, ...rest } = doc;
        return { ...rest, match_confidence: matched_by };
      },
    },
    {
      spec: {
        name: "get_living_costs",
        description:
          "UBC Vancouver's published living-cost figures in CAD: housing, meal plans, and groceries, with the basis (per month, per year) for each.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              item: { type: "string", description: 'Optional filter, e.g. "housing" or "meal"' },
            },
            required: [],
          },
        },
      },
      async execute(input, search) {
        const res = await search.index("living_costs").search(input.item ? String(input.item) : "", { limit: 50 });
        const hits = res.hits;
        if (hits.length === 0) throw new Error(`No living-cost figures matched "${input.item}"`);
        return { living_costs: hits as unknown as LivingCostDoc[] };
      },
    },
    {
      spec: {
        name: "search_student_fees",
        description:
          "Search UBC Vancouver's Board-approved student fees (athletics, health, U-Pass, society fees, ...) by keyword. Amounts are CAD.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              query: { type: "string", description: "Keywords to match fee names and sections" },
              student_type: { type: "string", description: 'Optional filter: "domestic" or "international"' },
            },
            required: ["query"],
          },
        },
      },
      async execute(input, search) {
        const filter = input.student_type ? `student_type = '${String(input.student_type).toLowerCase()}'` : undefined;
        const res = await search.index("student_fees").search(String(input.query), {
          filter,
          limit: 20,
        });
        const hits = res.hits;
        if (hits.length === 0) throw new Error(`No student fees matched "${input.query}"`);
        return { fees: hits as unknown as StudentFeeDoc[] };
      },
    },
  ],
};
