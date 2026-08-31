import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { createPlannerYear } from "@/src/components/degree-planner/planner-store";
import { describe, expect, it } from "vitest";
import { buildAutofillPlan } from "./planner-autofill";
import type { ParsedProgramYears, YearRequirement } from "./program-years";

function course(code: string, prerequisite: string | null = null): CourseIndexEntry {
  return { code, title: code, credits: 3, prerequisite, corequisite: null };
}

function parsed(item: YearRequirement, yearLabel = "First Year"): ParsedProgramYears {
  return { years: [{ label: yearLabel, items: [item], totalCredits: null }], degreeTotalCredits: 120 };
}

function requirement(overrides: Partial<YearRequirement>): YearRequirement {
  return { label: "Requirement", kind: "course", mode: "all", codes: [], groups: [], credits: 3, ...overrides };
}

describe("buildAutofillPlan", () => {
  it("chooses one course from a one-of requirement", () => {
    const years = Array.from({ length: 4 }, (_, index) => createPlannerYear(index));
    const index = new Map([
      ["CPSC 103", course("CPSC 103")],
      ["CPSC 107", course("CPSC 107")],
    ]);
    const result = buildAutofillPlan({
      years,
      courseIndex: index,
      parsed: parsed(requirement({ mode: "oneof", codes: ["CPSC 103", "CPSC 107"] })),
      programUrl: "/program",
      checkedRequirements: [],
    });

    expect(result.placedCodes).toEqual(["CPSC 103"]);
    expect(result.choices).toEqual([{ requirement: "Requirement", code: "CPSC 103" }]);
  });

  it("places prerequisite closure before the official requirement year", () => {
    const years = Array.from({ length: 4 }, (_, index) => createPlannerYear(index));
    const index = new Map([
      ["CPSC 110", course("CPSC 110")],
      ["CPSC 210", course("CPSC 210", "CPSC 110")],
    ]);
    const result = buildAutofillPlan({
      years,
      courseIndex: index,
      parsed: parsed(requirement({ codes: ["CPSC 210"] }), "Second Year"),
      programUrl: "/program",
      checkedRequirements: [],
    });

    expect(result.placedCodes).toEqual(["CPSC 110", "CPSC 210"]);
    expect(result.placements[0]).toMatchObject({ yearId: years[0].id, code: "CPSC 110" });
    expect(result.placements[1]).toMatchObject({ yearId: years[1].id, code: "CPSC 210" });
  });

  it("fills about fifteen credits per winter term", () => {
    const years = [createPlannerYear(0)];
    const codes = Array.from({ length: 6 }, (_, index) => `TEST ${100 + index}`);
    const index = new Map(codes.map((code) => [code, course(code)]));
    const result = buildAutofillPlan({
      years,
      courseIndex: index,
      parsed: parsed(requirement({ codes })),
      programUrl: "/program",
      checkedRequirements: [],
    });

    expect(result.placements.filter((placement) => placement.termIdx === 0)).toHaveLength(5);
    expect(result.placements.filter((placement) => placement.termIdx === 1)).toHaveLength(1);
  });

  it("skips work terms and reports text requirements", () => {
    const years = Array.from({ length: 2 }, (_, index) => createPlannerYear(index));
    years[1].terms[0].kind = "coop";
    const index = new Map([["CPSC 210", course("CPSC 210")]]);
    const requirements: ParsedProgramYears = {
      years: [
        {
          label: "Second Year",
          totalCredits: null,
          items: [
            requirement({ codes: ["CPSC 210"] }),
            requirement({ label: "Science electives", kind: "text", codes: [], credits: 6 }),
          ],
        },
      ],
      degreeTotalCredits: 120,
    };
    const result = buildAutofillPlan({
      years,
      courseIndex: index,
      parsed: requirements,
      programUrl: "/program",
      checkedRequirements: [],
    });

    expect(result.placements[0]).toMatchObject({ yearId: years[1].id, termIdx: 1 });
    expect(result.remaining).toEqual(["Science electives"]);
  });
});
