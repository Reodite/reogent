import type { DatasetModule } from "../core/types";
import { slugify } from "./tuition";

export interface KeyDateDoc {
  kind: "academic" | "holiday";
  name: string;
  applies_to: string | null;
  date_text: string | null;
  start: string | null; // ISO yyyy-mm-dd — sorts correctly as a string
  end: string | null;
  ubc_specific: boolean | null; // holidays only: UBC's own, not a BC stat
  source_url: string | null;
}

// biome-ignore lint/suspicious/noExplicitAny: raw dataset rows
type Row = Record<string, any>;

export function transformAcademicDate(row: Row): { id: string; doc: KeyDateDoc } | null {
  if (!row.event) return null;
  const doc: KeyDateDoc = {
    kind: "academic",
    name: String(row.event),
    applies_to: row.applies_to ?? null,
    date_text: row.date_text ?? null,
    start: row.start ?? null,
    end: row.end ?? null,
    ubc_specific: null,
    source_url: row.source_url ?? null,
  };
  return {
    id: [
      "academic",
      slugify(doc.name),
      slugify(String(row.section ?? "")),
      doc.start ?? slugify(doc.date_text ?? ""),
    ].join("#"),
    doc,
  };
}

export function transformHoliday(row: Row): { id: string; doc: KeyDateDoc } | null {
  if (!row.name || !row.date) return null;
  const doc: KeyDateDoc = {
    kind: "holiday",
    name: String(row.name),
    applies_to: null,
    date_text: row.date_text ?? null,
    start: String(row.date),
    end: null,
    ubc_specific: Boolean(row.ubc_specific),
    source_url: row.source_url ?? null,
  };
  return { id: ["holiday", slugify(doc.name), doc.start].join("#"), doc };
}

export const calendar: DatasetModule = {
  name: "calendar",
  indices: [
    {
      index: "key_dates",
      settings: {
        searchableAttributes: ["name", "applies_to", "date_text"],
        filterableAttributes: ["kind"],
        sortableAttributes: ["start"],
      },
      async *read(store) {
        for (const row of (await store.getJson("academic-calendar/vancouver/dates.json")) as Row[]) {
          yield { kind: "academic", row };
        }
        for (const row of (await store.getJson("campus-services/statutory_holidays.json")) as Row[]) {
          yield { kind: "holiday", row };
        }
      },
      transform(tagged: { kind: string; row: Row }) {
        return tagged.kind === "academic" ? transformAcademicDate(tagged.row) : transformHoliday(tagged.row);
      },
    },
  ],
  tools: [
    {
      spec: {
        name: "get_key_dates",
        description:
          "UBC Vancouver key dates: term starts and ends, exam periods, add/drop and withdrawal deadlines, and statutory holidays (including UBC-specific ones). Returns dates sorted chronologically.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: 'Optional keywords, e.g. "withdrawal", "exam period", "Winter Term 1"',
              },
              kind: {
                type: "string",
                description: 'Optional filter: "academic" (deadlines, terms, exams) or "holiday"',
              },
              limit: { type: "number", description: "Max results (default 20)" },
            },
            required: [],
          },
        },
      },
      async execute(input, search) {
        const filter = input.kind ? `kind = '${String(input.kind)}'` : undefined;
        const res = await search.index("key_dates").search(input.query ? String(input.query) : "", {
          filter,
          sort: ["start:asc"],
          limit: Math.min(Number(input.limit) || 20, 66), // the whole index is 66 rows
        });
        const hits = res.hits;
        if (hits.length === 0) throw new Error(`No key dates matched "${input.query}"`);
        return { dates: hits as unknown as KeyDateDoc[] };
      },
    },
  ],
};
