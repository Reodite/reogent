import { describe, expect, it } from "vitest";
import { createPlannerYear } from "./planner-store";
import { describeIssue, findDuplicateCourseCodes } from "./validation";

describe("findDuplicateCourseCodes", () => {
  it("finds duplicates across years and terms", () => {
    const years = [createPlannerYear(0), createPlannerYear(1)];
    years[0].terms[0].blocks.push({ id: "one", code: "CPSC 110" });
    years[1].terms[1].blocks.push({ id: "two", code: "CPSC 110" });
    years[1].terms[1].blocks.push({ id: "three", code: "CPSC 210" });

    expect([...findDuplicateCourseCodes(years)]).toEqual(["CPSC 110"]);
  });
});

describe("describeIssue", () => {
  it("renders internal tokens as sentences", () => {
    expect(describeIssue("duplicate course in plan")).toContain("Duplicate");
    expect(describeIssue("prereq CPSC 210")).toContain("prerequisite");
    expect(describeIssue("prereq CPSC 210")).toContain("CPSC 210");
    expect(describeIssue("coreq MATH 221")).toContain("corequisite");
    expect(describeIssue("custom token")).toBe("custom token");
  });
});
