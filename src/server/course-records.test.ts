import { describe, expect, it } from "vitest";
import { courseRecordId } from "./course-records";

describe("courseRecordId", () => {
  it("uses one session key for bare and Vancouver-suffixed aliases", () => {
    expect(courseRecordId("CPSC 110", "2025W")).toBe("CPSC_110__2025W");
    expect(courseRecordId(" cpsc_v   110 ", "2025W")).toBe("CPSC_110__2025W");
  });

  it("sanitizes characters outside the search primary-key alphabet", () => {
    expect(courseRecordId("CPSC/110", "2025W")).toBe("CPSC_110__2025W");
  });
});
