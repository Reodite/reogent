import { normalizeCourseCode } from "@/src/shared/course-code";
import { describe, expect, it } from "vitest";
import { buildRecordsFromDistributions, courseRecordId } from "./course-records";

describe("courseRecordId", () => {
  it("matches the key used by ingestion for normalized course codes", () => {
    const [ingestedRecord] = buildRecordsFromDistributions({
      distRows: [
        {
          subject: "CPSC",
          course: "110",
          year: 2025,
          session: "W",
          title: "Introduction to Computer Science",
          enrolled: 30,
          avg: 80,
          median: 80,
          percentile_25: null,
          percentile_75: null,
          high: null,
          low: null,
          std_dev: null,
          distribution: { "80-84": 30 },
        },
      ],
    });
    const requestedCode = normalizeCourseCode("CPSC_V 110");

    expect(ingestedRecord.id).toBe("CPSC_110__2025W");
    expect(courseRecordId(requestedCode, "2025W")).toBe("CPSC_110__2025W");
  });

  it("sanitizes characters outside the search primary-key alphabet", () => {
    expect(courseRecordId("CPSC/110", "2025W")).toBe("CPSC_110__2025W");
  });
});
