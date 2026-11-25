import { normalizeCourseCode } from "@/src/shared/course-code";
import { describe, expect, it } from "vitest";
import { courseColor } from "./colors";

describe("course colors", () => {
  it("uses one identity across catalog and Workday course codes", () => {
    expect(normalizeCourseCode(" cpsc_v   221 ")).toBe("CPSC 221");
    expect(courseColor("CPSC 221")).toBe(courseColor({ courseCode: "CPSC_V 221", title: "Algorithms" }));
  });
});
