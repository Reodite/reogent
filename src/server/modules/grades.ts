import type { DataReader, DatasetModule, SearchClient } from "../core/types";

interface GradeRow {
  subject: string;
  course: string;
  section: string;
  year: number;
  session: string;
  title: string;
  professor: string;
  enrolled: number;
  avg: number | null;
  median: number | null;
  std_dev: number | null;
  percentile_25: number | null;
  percentile_75: number | null;
  high: number | null;
  low: number | null;
  distribution: Record<string, number>;
}

export const grades: DatasetModule = {
  name: "grades",
  indices: [
    {
      index: "grades",
      settings: {
        searchableAttributes: ["title", "professor"],
        filterableAttributes: ["subject", "course", "section", "year", "session", "avg"],
        sortableAttributes: ["year"],
      },
      async *read(store: DataReader) {
        const rows = (await store.getJson("grades/distributions.json")) as GradeRow[];
        yield* rows;
      },
      transform(raw: GradeRow) {
        if (raw.avg === null) return null;
        const id = `${raw.subject}-${raw.course}-${raw.section}-${raw.year}${raw.session}`;
        return { id, doc: raw };
      },
    },
  ],
  tools: [
    {
      spec: {
        name: "get_grades",
        description:
          "Get grade distributions for a specific UBC course. Returns matching grade records sorted by year descending.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              course_code: { type: "string", description: 'Course code, e.g. "CPSC 110"' },
              year: { type: "number", description: "Filter by year, e.g. 2024" },
              session: { type: "string", description: 'Filter by session: "W" or "S"' },
              professor: { type: "string", description: "Filter by professor name" },
            },
            required: ["course_code"],
          },
        },
      },
      async execute(input: Record<string, unknown>, search: SearchClient) {
        const code = String(input.course_code ?? "")
          .trim()
          .toUpperCase();
        const [subject, course] = code.split(/\s+/);
        if (!subject || !course) throw new Error(`Invalid course_code "${input.course_code}"`);

        const filters: string[] = [`subject = '${subject}'`, `course = '${course}'`];
        if (input.year !== undefined) filters.push(`year = ${input.year}`);
        if (input.session) filters.push(`session = '${String(input.session).toUpperCase()}'`);
        // professor is a searchable attribute, so use the query text for it
        const queryText = input.professor ? String(input.professor) : "";
        const res = await search.index("grades").search(queryText, {
          filter: filters.join(" AND "),
          sort: ["year:desc"],
          limit: 50,
        });
        const hits = res.hits;
        if (hits.length === 0) throw new Error(`No grade records found for "${input.course_code}"`);
        return { grades: hits };
      },
    },
    {
      spec: {
        name: "search_grades",
        description: "Search UBC grade data by keyword (matches title/professor) with optional filters.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              query: { type: "string", description: "Keywords to match against course title or professor" },
              subject: { type: "string", description: 'Subject code filter, e.g. "CPSC"' },
              min_avg: { type: "number", description: "Minimum class average" },
              max_avg: { type: "number", description: "Maximum class average" },
              year: { type: "number", description: "Filter by year" },
              limit: { type: "number", description: "Max results (default 20)" },
            },
            required: ["query"],
          },
        },
      },
      async execute(input: Record<string, unknown>, search: SearchClient) {
        const filters: string[] = [];
        if (input.subject) filters.push(`subject = '${String(input.subject).toUpperCase()}'`);
        if (input.year !== undefined) filters.push(`year = ${input.year}`);
        if (input.min_avg !== undefined) filters.push(`avg >= ${input.min_avg}`);
        if (input.max_avg !== undefined) filters.push(`avg <= ${input.max_avg}`);

        const res = await search.index("grades").search(String(input.query), {
          filter: filters.length > 0 ? filters.join(" AND ") : undefined,
          sort: ["year:desc"],
          limit: Math.min(Number(input.limit) || 20, 50),
        });
        const hits = res.hits;
        if (hits.length === 0) throw new Error(`No grade records matched "${input.query}"`);
        return { grades: hits };
      },
    },
  ],
};
