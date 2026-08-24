import { describe, expect, it } from "vitest";
import type { SearchClient } from "../core/types";
import { courseAverage, courseGrades } from "./grades";

interface GradeRow {
  subject: string;
  course: string;
  year: number;
  enrolled: number;
  avg: number | null;
  median: number | null;
  distribution: Record<string, number>;
}

function gradeSearch(rows: GradeRow[]): SearchClient {
  return {
    index: () => ({
      search: async (_q: string, opts?: Record<string, unknown>) => {
        const filter = String(opts?.filter ?? "");
        const subjectMatch = filter.match(/subject = '([^']+)'/);
        const courseMatch = filter.match(/course = '([^']+)'/);
        return {
          hits: rows.filter(
            (r) => (!subjectMatch || r.subject === subjectMatch[1]) && (!courseMatch || r.course === courseMatch[1]),
          ),
        };
      },
    }),
  } as unknown as SearchClient;
}

const rows: GradeRow[] = [
  {
    subject: "CPSC",
    course: "110",
    year: 2024,
    enrolled: 10,
    avg: 80,
    median: 82,
    distribution: { "80-84": 6, "90-100": 4 },
  },
  {
    subject: "CPSC",
    course: "110",
    year: 2025,
    enrolled: 20,
    avg: 70,
    median: 72,
    distribution: { "70-74": 12, "80-84": 8 },
  },
];

describe("grades pooling helpers (agent-tool-redesign)", () => {
  it("courseAverage is enrollment-weighted across records", async () => {
    // (80*10 + 70*20) / 30 = 73.3
    expect(await courseAverage(gradeSearch(rows), "CPSC", "110")).toBeCloseTo(73.3, 1);
  });

  it("courseAverage normalizes the _V subject suffix", async () => {
    expect(await courseAverage(gradeSearch(rows), "CPSC_V", "110")).toBeCloseTo(73.3, 1);
  });

  it("courseAverage returns null when no record matches", async () => {
    expect(await courseAverage(gradeSearch(rows), "MATH", "200")).toBeNull();
  });

  it("courseGrades pools buckets across all records and reports the median", async () => {
    const out = await courseGrades(gradeSearch(rows), "CPSC", "110");
    expect(out?.summary.avg).toBeCloseTo(73.3, 1);
    // (82+72)/2
    expect(out?.summary.median).toBeCloseTo(77, 1);
    expect(out?.summary.sample_sections).toBe(2);
    expect(out?.distribution.buckets["80-84"]).toBe(14);
    expect(out?.distribution.buckets["90-100"]).toBe(4);
    expect(out?.distribution.total_enrolled).toBe(30);
  });

  it("courseGrades returns null when no record matches", async () => {
    expect(await courseGrades(gradeSearch(rows), "MATH", "200")).toBeNull();
  });

  it("courseGrades skips records with a null avg for the weighted mean", async () => {
    const withNull = [
      ...rows,
      { subject: "CPSC", course: "110", year: 2023, enrolled: 5, avg: null, median: null, distribution: {} },
    ];
    const out = await courseGrades(gradeSearch(withNull), "CPSC", "110");
    expect(out?.summary.sample_sections).toBe(3);
    expect(out?.summary.avg).toBeCloseTo(73.3, 1);
  });
});
