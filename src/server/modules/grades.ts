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

export interface GradeSummary {
  avg: number;
  median: number | null;
  sample_sections: number;
  latest_year: number;
}

export interface GradeDistribution {
  buckets: Record<string, number>;
  total_enrolled: number;
  sample_sections: number;
}

/** Normalizes a course subject for the grades index: "CPSC_V" → "CPSC", "MATH_V" → "MATH". */
function gsSubject(subject: string): string {
  const s = subject.trim().toUpperCase();
  return s.replace(/_(V|K|F)$/, "");
}

/**
 * Pooled course-average over recent grade records. Returns the
 * enrollment-weighted mean of section averages, or null when no records exist.
 */
export async function courseAverage(search: SearchClient, subject: string, course: string): Promise<number | null> {
  const res = await search.index("grades").search("", {
    filter: `subject = '${gsSubject(subject)}' AND course = '${course}'`,
    sort: ["year:desc"],
    limit: 200,
  });
  const rows = res.hits as unknown as GradeRow[];
  if (rows.length === 0) return null;
  let weightedSum = 0;
  let totalEnrolled = 0;
  for (const r of rows) {
    if (r.avg === null) continue;
    weightedSum += r.avg * r.enrolled;
    totalEnrolled += r.enrolled;
  }
  return totalEnrolled > 0 ? Math.round((weightedSum / totalEnrolled) * 10) / 10 : null;
}

/**
 * Pooled grade summary + distribution for a course. Returns null when no
 * records exist. The histogram buckets are summed across all matching sections.
 */
export async function courseGrades(
  search: SearchClient,
  subject: string,
  course: string,
): Promise<{ summary: GradeSummary; distribution: GradeDistribution } | null> {
  const res = await search.index("grades").search("", {
    filter: `subject = '${gsSubject(subject)}' AND course = '${course}'`,
    sort: ["year:desc"],
    limit: 200,
  });
  const rows = res.hits as unknown as GradeRow[];
  if (rows.length === 0) return null;
  let weightedSum = 0;
  let totalEnrolled = 0;
  let sampleMedian = 0;
  let medianCount = 0;
  let latestYear = 0;
  const buckets: Record<string, number> = {};
  let bucketEnrolled = 0;
  for (const r of rows) {
    if (r.avg !== null) {
      weightedSum += r.avg * r.enrolled;
      totalEnrolled += r.enrolled;
    }
    if (r.median !== null) {
      sampleMedian += r.median;
      medianCount++;
    }
    if (r.year > latestYear) latestYear = r.year;
    for (const [k, v] of Object.entries(r.distribution)) {
      buckets[k] = (buckets[k] ?? 0) + v;
      bucketEnrolled += v;
    }
  }
  const avg = totalEnrolled > 0 ? Math.round((weightedSum / totalEnrolled) * 10) / 10 : 0;
  const median = medianCount > 0 ? Math.round((sampleMedian / medianCount) * 10) / 10 : null;
  return {
    summary: { avg, median, sample_sections: rows.length, latest_year: latestYear },
    distribution: { buckets, total_enrolled: bucketEnrolled, sample_sections: rows.length },
  };
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
