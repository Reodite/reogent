import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { createPlannerYear } from "@/src/components/degree-planner/planner-store";
import { describe, expect, it } from "vitest";
import { findCourseTarget } from "./planner-placement";

function course(code: string, prerequisite: string | null = null): CourseIndexEntry {
  return { code, title: code, credits: 3, prerequisite, corequisite: null };
}

describe("findCourseTarget", () => {
  it("places a course after its planned prerequisite", () => {
    const years = [createPlannerYear(0)];
    years[0].terms[0].blocks.push({ id: "one", code: "CPSC 110" });
    const index = new Map([
      ["CPSC 110", course("CPSC 110")],
      ["CPSC 121", course("CPSC 121", "CPSC 110")],
    ]);

    expect(findCourseTarget(years, index, "CPSC 121", 0)).toEqual({ yearId: years[0].id, termIdx: 1 });
  });

  it("skips co-op terms", () => {
    const years = [createPlannerYear(0), createPlannerYear(1)];
    years[1].terms[0].kind = "coop";
    const index = new Map([["CPSC 210", course("CPSC 210")]]);

    expect(findCourseTarget(years, index, "CPSC 210", 1)).toEqual({ yearId: years[1].id, termIdx: 1 });
  });

  it("uses the next term when the preferred term is full", () => {
    const years = [createPlannerYear(0)];
    for (let index = 0; index < 5; index++) {
      years[0].terms[0].blocks.push({ id: String(index), code: `TEST ${index}` });
    }
    const entries: [string, CourseIndexEntry][] = [["CPSC 110", course("CPSC 110")]];
    for (let index = 0; index < 5; index++) entries.push([`TEST ${index}`, course(`TEST ${index}`)]);

    expect(findCourseTarget(years, new Map(entries), "CPSC 110", 0)).toEqual({
      yearId: years[0].id,
      termIdx: 1,
    });
  });
});
