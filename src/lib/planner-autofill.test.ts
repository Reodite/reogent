import { readFileSync } from "node:fs";
import type { CourseIndexEntry } from "@/src/shared/course-index";
import { describe, expect, it } from "vitest";
import { buildAutofillPlan } from "./planner-autofill";
import { createPlannerYear } from "./planner-model";
import type { RequirementCategory, StructuredRequirements } from "./program-requirements";
import { parseProgramYears, type ParsedProgramYears, type YearRequirement } from "./program-years";

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

  it("uses one complete path through nested alternatives", () => {
    const years = Array.from({ length: 4 }, (_, index) => createPlannerYear(index));
    const index = new Map([
      ["CPSC 110", course("CPSC 110")],
      ["CPSC 103", course("CPSC 103")],
      ["CPSC 107", course("CPSC 107")],
    ]);
    const requirements = parseProgramYears(
      ["First Year", "CPSC_V 110 (or 103 and 107)", "4", "Total Credits", "30"].join("\n"),
    );
    const result = buildAutofillPlan({
      years,
      courseIndex: index,
      parsed: requirements,
      programUrl: "/program",
      checkedRequirements: [],
    });

    expect(result.placedCodes).toEqual(["CPSC 110"]);
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

  it("keeps required prerequisites in their official year", () => {
    const years = Array.from({ length: 4 }, (_, index) => createPlannerYear(index));
    const index = new Map([
      ["CPSC 210", course("CPSC 210")],
      ["CPSC 213", course("CPSC 213", "CPSC 210")],
    ]);
    const result = buildAutofillPlan({
      years,
      courseIndex: index,
      parsed: {
        years: [
          {
            label: "Second Year",
            totalCredits: 6,
            items: [requirement({ codes: ["CPSC 210"] }), requirement({ codes: ["CPSC 213"] })],
          },
        ],
        degreeTotalCredits: 120,
      },
      programUrl: "/program",
      checkedRequirements: [],
    });

    expect(result.placements).toEqual([
      { yearId: years[1].id, termIdx: 0, code: "CPSC 210" },
      { yearId: years[1].id, termIdx: 1, code: "CPSC 213" },
    ]);
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

function structured(categories: RequirementCategory[]): StructuredRequirements {
  return { kind: "structured", program_url: "/program", categories };
}

describe("curated program autofill", () => {
  it("fills only the missing category credits and reports choices", () => {
    const year = createPlannerYear(0);
    year.terms[0].blocks.push({ id: "existing-stat", code: "STAT 200" });
    const index = new Map(["STAT 200", "STAT 251", "STAT 302"].map((code) => [code, course(code)]));
    const result = buildAutofillPlan({
      years: [year],
      courseIndex: index,
      parsed: structured([
        {
          name: "Statistics",
          credits_required: 6,
          options: [{ code: "STAT 200" }, { code: "STAT 251" }, { code: "STAT 302" }],
        },
      ]),
      programUrl: "/program",
      checkedRequirements: [],
    });

    expect(result.placedCodes).toEqual(["STAT 251"]);
    expect(result.choices).toEqual([{ requirement: "Statistics", code: "STAT 251" }]);
    expect(result.remaining).toEqual([]);
    expect(year.terms[0].blocks).toEqual([{ id: "existing-stat", code: "STAT 200" }]);
  });

  it("uses curated credit values and skips zero-credit options", () => {
    const codes = ["CPSC 103", "CPSC 110", "CPSC 107"];
    const result = buildAutofillPlan({
      years: [createPlannerYear(0)],
      courseIndex: new Map(codes.map((code) => [code, course(code)])),
      parsed: structured([
        {
          name: "Computation",
          credits_required: 6,
          options: [
            { code: "CPSC 103", credit_value: 0 },
            { code: "CPSC 110", credit_value: 4 },
            { code: "CPSC 107", credit_value: 2 },
          ],
        },
      ]),
      programUrl: "/program",
      checkedRequirements: [],
    });

    expect(result.placedCodes).toEqual(["CPSC 110", "CPSC 107"]);
    expect(result.remaining).toEqual([]);
  });

  it("selects from finite course-list rules and respects credit caps", () => {
    const codes = ["ENGL 100", "ENGL 110", "MUSC 100", "MUSC 101"];
    const result = buildAutofillPlan({
      years: [createPlannerYear(0)],
      courseIndex: new Map(codes.map((code) => [code, course(code)])),
      parsed: structured([
        {
          name: "Writing",
          credits_required: 3,
          options: [{ rule: { kind: "course_list", courses: ["ENGL 100", "ENGL 110"] } }],
        },
        {
          name: "Music electives",
          credits_required: 6,
          options: [
            {
              rule: {
                kind: "course_list",
                courses: ["MUSC 100", "MUSC 101"],
                caps: [{ credits: 3, subjects: ["MUSC"] }],
              },
            },
          ],
        },
      ]),
      programUrl: "/program",
      checkedRequirements: [],
    });

    expect(result.placedCodes).toEqual(["ENGL 100", "MUSC 100"]);
    expect(result.remaining).toEqual(["Music electives"]);
  });

  it("leaves open-ended and advisory categories for review", () => {
    const codes = ["ECED 405", "ECED 406", "CPSC 310"];
    const result = buildAutofillPlan({
      years: Array.from({ length: 4 }, (_, index) => createPlannerYear(index)),
      courseIndex: new Map(codes.map((code) => [code, course(code)])),
      parsed: structured([
        {
          name: "Required courses",
          credits_required: 15,
          options: [
            { code: "ECED 405", credit_value: 3 },
            { subject_pattern: "ECED 4", credit_value: 12 },
          ],
        },
        {
          name: "Upper-level electives",
          credits_required: 6,
          options: [{ rule: { kind: "level_credit", min_level: 300 } }],
        },
        { name: "Adviser approval", credits_required: 0, options: [] },
      ]),
      programUrl: "/program",
      checkedRequirements: [],
    });

    expect(result.placedCodes).toEqual(["ECED 405"]);
    expect(result.remaining).toEqual(["Required courses", "Upper-level electives", "Adviser approval"]);
  });

  it("keeps unavailable courses unresolved while placing known options", () => {
    const result = buildAutofillPlan({
      years: [createPlannerYear(0)],
      courseIndex: new Map([["CPSC 110", course("CPSC 110")]]),
      parsed: structured([
        { name: "Required courses", credits_required: 6, options: [{ code: "CPSC 110" }, { code: "CPSC 999" }] },
      ]),
      programUrl: "/program",
      checkedRequirements: [],
    });

    expect(result.placedCodes).toEqual(["CPSC 110"]);
    expect(result.remaining).toEqual(["Required courses"]);
  });

  it("uses category year labels and places prerequisites first without treating category order as years", () => {
    const years = Array.from({ length: 4 }, (_, index) => createPlannerYear(index));
    const result = buildAutofillPlan({
      years,
      courseIndex: new Map([
        ["MATH 100", course("MATH 100")],
        ["CPSC 110", course("CPSC 110")],
        ["CPSC 210", course("CPSC 210", "CPSC 110")],
      ]),
      parsed: structured([
        { name: "Calculus", credits_required: 3, options: [{ code: "MATH 100" }] },
        { name: "Second-year systems", credits_required: 3, options: [{ code: "CPSC 210" }] },
      ]),
      programUrl: "/program",
      checkedRequirements: [],
    });

    expect(result.placements).toEqual([
      { yearId: years[0].id, termIdx: 0, code: "MATH 100" },
      { yearId: years[0].id, termIdx: 0, code: "CPSC 110" },
      { yearId: years[1].id, termIdx: 0, code: "CPSC 210" },
    ]);
  });

  it("fills named courses from the shipped Computer Science requirements", () => {
    const data = JSON.parse(
      readFileSync(new URL("../../public/data/program_requirements.json", import.meta.url), "utf8"),
    );
    const requirements = { ...data["sci-computer-science-major"], kind: "structured" } as StructuredRequirements;
    const codes = ["CPSC 110", "CPSC 103", "CPSC 107", "CPSC 121", "MATH 100", "MATH 101", "CPSC 210"];
    const result = buildAutofillPlan({
      years: Array.from({ length: 4 }, (_, index) => createPlannerYear(index)),
      courseIndex: new Map(codes.map((code) => [code, { ...course(code), credits: code.startsWith("CPSC") ? 4 : 3 }])),
      parsed: requirements,
      programUrl: requirements.program_url,
      checkedRequirements: [],
    });

    expect(result.placedCodes).toEqual(["CPSC 110", "CPSC 121", "MATH 100", "MATH 101", "CPSC 210"]);
    expect(result.placedCodes).not.toContain("CPSC 103");
    expect(result.placedCodes).not.toContain("CPSC 107");
    expect(result.remaining).toContain("CPSC courses numbered 400 or higher");
  });
});
