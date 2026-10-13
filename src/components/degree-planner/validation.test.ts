import { createPlannerYear, SEASON_ORDER, type Year } from "@/src/lib/planner-model";
import type { CourseIndexEntry } from "@/src/shared/course-index";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { describeIssue, findDuplicateCourseCodes, validatePlan } from "./validation";

function course(code: string, prerequisite: string | null = null, corequisite: string | null = null): CourseIndexEntry {
  return { code, title: code, credits: 3, prerequisite, corequisite };
}

describe("validatePlan", () => {
  it("returns no evaluations until the course index is available", () => {
    expect(validatePlan([createPlannerYear(0)], null, new Set())).toEqual(new Map());
  });

  it("checks prerequisites in earlier terms and corequisites in the same or earlier terms", () => {
    const year = createPlannerYear(0);
    year.terms[0].blocks = [
      { id: "intro", code: "CPSC 110" },
      { id: "same-term", code: "CPSC 210" },
      { id: "missing-coreq", code: "CPSC 250" },
    ];
    year.terms[1].blocks = [
      { id: "later", code: "CPSC 221" },
      { id: "math", code: "MATH 200" },
    ];
    const courses = [
      course("CPSC 110"),
      course("CPSC 210", "CPSC 110", "CPSC 110"),
      course("CPSC 250", null, "MATH 200"),
      course("CPSC 221", "CPSC 110", "MATH 200"),
    ];
    const result = validatePlan([year], new Map(courses.map((entry) => [entry.code, entry])), new Set());
    expect([...result.keys()]).toEqual(["intro", "same-term", "missing-coreq", "later", "math"]);
    expect(result.get("intro")).toMatchObject({ ok: true, missing: [] });
    expect(result.get("same-term")).toMatchObject({ ok: false, missing: ["prereq CPSC 110"] });
    expect(result.get("missing-coreq")).toMatchObject({ ok: false, missing: ["coreq MATH 200"] });
    expect(result.get("later")).toMatchObject({ ok: true, missing: [] });
    expect(result.get("math")).toMatchObject({ ok: true, missing: [] });
    expect(result.get("intro")?.completedBefore).toBe(result.get("same-term")?.completedBefore);
    expect(result.get("intro")?.completedSameOrBefore).toBe(result.get("same-term")?.completedSameOrBefore);
    expect(result.get("intro")?.completedBefore).not.toBe(result.get("later")?.completedBefore);
  });

  it("preserves duplicate and unknown-course behavior, retaining ignored issue details", () => {
    const year = createPlannerYear(0);
    year.terms[0].blocks = [
      { id: "first", code: "HIST 999" },
      { id: "unknown", code: "CPSC 999" },
    ];
    year.terms[1].blocks = [{ id: "duplicate", code: "HIST 999" }];
    const result = validatePlan([year], new Map(), new Set(["first"]));
    expect(result.get("first")).toMatchObject({ ok: true, missing: ["duplicate course in plan"] });
    expect(result.get("duplicate")).toMatchObject({ ok: false, missing: ["duplicate course in plan"] });
    expect(result.get("unknown")).toMatchObject({ ok: true, missing: [] });
  });

  it("preserves completion snapshots and inputs across generated plans", () => {
    // Feature: codebase-restructuring, Property 1: Stable completion snapshots.
    const codes = fc.array(fc.constantFrom("CPSC 110", "CPSC 210", "MATH 100"), { maxLength: 4 });
    fc.assert(
      fc.property(fc.array(fc.array(codes, { minLength: 2, maxLength: 4 }), { maxLength: 4 }), (plan) => {
        const years: Year[] = plan.map((terms, y) => ({
          id: `y${y}`,
          label: `Year ${y + 1}`,
          terms: terms.map((codes, t) => ({
            season: SEASON_ORDER[t],
            kind: "study",
            blocks: codes.map((code, b) => ({ id: `${y}:${t}:${b}`, code })),
          })),
        }));
        const original = structuredClone(years);
        const index = new Map(["CPSC 110", "CPSC 210", "MATH 100"].map((code) => [code, course(code)]));
        const originalIndex = structuredClone(index);
        const ignored = new Set<string>();
        const result = validatePlan(years, index, ignored);
        const earlier: string[] = [];
        for (const year of years) {
          for (const term of year.terms) {
            const current = term.blocks.map((block) => block.code);
            for (const block of term.blocks) {
              expect(result.get(block.id)?.completedBefore).toEqual(new Set(earlier));
              expect(result.get(block.id)?.completedSameOrBefore).toEqual(new Set([...earlier, ...current]));
            }
            earlier.push(...current);
          }
        }
        expect(years).toEqual(original);
        expect(index).toEqual(originalIndex);
        expect(ignored.size).toBe(0);
      }),
      { numRuns: 100, seed: 24000 },
    );
  });
});

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
