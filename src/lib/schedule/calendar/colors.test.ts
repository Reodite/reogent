import { describe, expect, it } from "vitest";
import { courseColor, normalizeCourseColorKey } from "./colors";

describe("course colors", () => {
  it("uses one identity across catalog and Workday course codes", () => {
    expect(normalizeCourseColorKey(" cpsc_v   221 ")).toBe("CPSC 221");
    expect(courseColor("CPSC 221")).toBe(courseColor({ courseCode: "CPSC_V 221", title: "Algorithms" }));
  });
});
