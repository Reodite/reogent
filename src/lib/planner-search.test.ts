import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { describe, expect, it } from "vitest";
import { searchCourses } from "./planner-search";

function course(code: string): CourseIndexEntry {
  return {
    code,
    title: `${code} title`,
    credits: 3,
    prerequisite: null,
    corequisite: null,
  };
}

describe("searchCourses exclusions", () => {
  const index = new Map(["CPSC 110", "CPSC 121", "CPSC 210", "CPSC 221"].map((code) => [code, course(code)]));

  it("omits courses that are already planned", () => {
    const results = searchCourses(index, "CPSC", 20, new Set(["CPSC 121", "CPSC 221"]));

    expect(results.map((entry) => entry.code)).toEqual(["CPSC 110", "CPSC 210"]);
  });

  it("continues searching until it fills the result limit", () => {
    const results = searchCourses(index, "CPSC", 2, new Set(["CPSC 110"]));

    expect(results.map((entry) => entry.code)).toEqual(["CPSC 121", "CPSC 210"]);
  });
});
