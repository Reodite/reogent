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
  it("renders internal tokens as direct sentences", () => {
    expect(describeIssue("duplicate course in plan")).toBe(
      "Duplicate course: it already appears elsewhere in your plan.",
    );
    expect(describeIssue("prereq CPSC 210")).toBe("Prerequisite: complete CPSC 210 in an earlier term.");
    expect(describeIssue("coreq MATH 221")).toBe("Corequisite: take MATH 221 in this term or an earlier term.");
    expect(describeIssue("custom token")).toBe("custom token");
  });
});
