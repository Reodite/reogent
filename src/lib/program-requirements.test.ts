import { describe, expect, it } from "vitest";
import { evaluateCategory, optionMatches, type RequirementCategory, ruleMatches } from "./program-requirements";

const SUBJ = {
  ENGL: "Faculty of Arts",
  PHIL: "Faculty of Arts",
  GEOS: "Faculty of Arts",
  MUSC: "Faculty of Arts",
  CPSC: "Faculty of Science",
  ASIC: "Faculty of Science",
};

describe("ruleMatches", () => {
  it("faculty_credit matches by subject faculty with excludes and includes", () => {
    const rule = {
      kind: "faculty_credit" as const,
      faculty: "Faculty of Arts",
      exclude_subjects: ["GEOS"],
      include_courses: ["ASIC 200"],
    };
    expect(ruleMatches(rule, "ENGL 110", SUBJ)).toBe(true);
    expect(ruleMatches(rule, "GEOS 102", SUBJ)).toBe(false); // excluded subject
    expect(ruleMatches(rule, "CPSC 110", SUBJ)).toBe(false); // wrong faculty
    expect(ruleMatches(rule, "ASIC 200", SUBJ)).toBe(true); // explicit include wins
  });

  it("faculty_credit tolerates a leading 'The' on either side", () => {
    const rule = { kind: "faculty_credit" as const, faculty: "The Faculty of Arts" };
    expect(ruleMatches(rule, "ENGL 110", SUBJ)).toBe(true);
  });

  it("level_credit matches by course number", () => {
    const rule = { kind: "level_credit" as const, min_level: 300 };
    expect(ruleMatches(rule, "PHIL 375", SUBJ)).toBe(true);
    expect(ruleMatches(rule, "PHIL 100", SUBJ)).toBe(false);
  });

  it("course_list matches exact codes only", () => {
    const rule = { kind: "course_list" as const, courses: ["ENGL 100"] };
    expect(ruleMatches(rule, "ENGL 100", SUBJ)).toBe(true);
    expect(ruleMatches(rule, "ENGL 110", SUBJ)).toBe(false);
  });
});

describe("evaluateCategory", () => {
  it("sums credits across code, pattern, and rule options", () => {
    const cat: RequirementCategory = {
      name: "Arts credits",
      credits_required: 12,
      options: [{ code: "CPSC 110" }, { rule: { kind: "faculty_credit", faculty: "Faculty of Arts" } }],
    };
    const { earned, matched } = evaluateCategory(
      cat,
      [
        { code: "ENGL 110", credits: 3 },
        { code: "PHIL 375", credits: 3 },
        { code: "CPSC 110", credits: 4 },
        { code: "MATH 100", credits: 3 }, // unknown subject: no match
      ],
      SUBJ,
    );
    expect(earned).toBe(10);
    expect(matched).toEqual(["ENGL 110", "PHIL 375", "CPSC 110"]);
  });

  it("applies per-subject caps from rule options", () => {
    const cat: RequirementCategory = {
      name: "Arts credits",
      credits_required: 12,
      options: [
        {
          rule: {
            kind: "faculty_credit",
            faculty: "Faculty of Arts",
            caps: [{ credits: 8, subjects: ["MUSC"] }],
          },
        },
      ],
    };
    const { earned } = evaluateCategory(
      cat,
      [
        { code: "MUSC 100", credits: 6 },
        { code: "MUSC 200", credits: 6 },
        { code: "ENGL 110", credits: 3 },
      ],
      SUBJ,
    );
    expect(earned).toBe(11); // 12 MUSC capped to 8, plus 3 ENGL
  });

  it("category with no options earns nothing (advisory)", () => {
    const cat: RequirementCategory = { name: "Outside requirement", credits_required: 30, options: [] };
    expect(evaluateCategory(cat, [{ code: "ENGL 110", credits: 3 }], SUBJ).earned).toBe(0);
  });
});

describe("optionMatches", () => {
  it("matches exact code and subject prefix", () => {
    expect(optionMatches({ code: "ENGL 100" }, "ENGL 100")).toBe(true);
    expect(optionMatches({ subject_pattern: "ENGL 3" }, "ENGL 375")).toBe(true);
    expect(optionMatches({ subject_pattern: "ENGL 3" }, "ENGL 275")).toBe(false);
  });
});
