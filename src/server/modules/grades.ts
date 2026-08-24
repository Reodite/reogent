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
  /** Most recent year with records. */
  latest_year: number;
  /** Earliest year in the pooled record set. */
  earliest_year: number;
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
  let earliestYear = Number.POSITIVE_INFINITY;
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
    if (r.year < earliestYear) earliestYear = r.year;
    for (const [k, v] of Object.entries(r.distribution)) {
      buckets[k] = (buckets[k] ?? 0) + v;
      bucketEnrolled += v;
    }
  }
  const avg = totalEnrolled > 0 ? Math.round((weightedSum / totalEnrolled) * 10) / 10 : 0;
  const median = medianCount > 0 ? Math.round((sampleMedian / medianCount) * 10) / 10 : null;
  return {
    summary: {
      avg,
      median,
      sample_sections: rows.length,
      latest_year: latestYear,
      earliest_year: Number.isFinite(earliestYear) ? earliestYear : latestYear,
    },
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
  tools: [],
};
