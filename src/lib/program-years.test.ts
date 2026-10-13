import { describe, expect, it } from "vitest";
import { autofillCodesForRequirement, hasYearRequirements, isRequirementMet, parseProgramYears } from "./program-years";

// Flattened shape the scraper emits for the calendar's requirement tables —
// the same fixture family the Degree Planner parses at runtime.
const SAMPLE = [
  "First Year",
  "CPSC_V 103",
  "3",
  "MATH_V 100 (or 180 or 120 or 110) 1",
  "3",
  "Electives 1",
  "12",
  "Total Credits",
  "30",
  "Second Year",
  "DSCI_V 200, 220, 221",
  "11",
  "MATH_V 221 (or 223), 215",
  "6",
  "Total Credits",
  "30",
  "Total Credits for Degree",
  "120",
].join("\n");

describe("parseProgramYears", () => {
  const parsed = parseProgramYears(SAMPLE);

  it("groups rows by year with credits, year totals, and the degree total", () => {
    expect(parsed.years.map((y) => y.label)).toEqual(["First Year", "Second Year"]);
    expect(parsed.years[0].totalCredits).toBe(30);
    expect(parsed.degreeTotalCredits).toBe(120);
    expect(hasYearRequirements(parsed)).toBe(true);
  });

  it("classifies course vs text rows and one-of vs all-of modes", () => {
    const [cpsc, mathChoice, electives] = parsed.years[0].items;
    expect(cpsc).toMatchObject({ kind: "course", mode: "all", codes: ["CPSC 103"] });
    expect(mathChoice.mode).toBe("oneof");
    expect(mathChoice.codes).toEqual(["MATH 100", "MATH 180", "MATH 120", "MATH 110"]);
    expect(electives).toMatchObject({ kind: "text", label: "Electives", credits: 12 });
  });

  it("splits mixed rows into conjunctive groups of alternatives", () => {
    const mixed = parsed.years[1].items[1];
    expect(mixed.groups).toEqual([["MATH 221", "MATH 223"], ["MATH 215"]]);
    expect(isRequirementMet(mixed, new Set(["MATH 223", "MATH 215"]))).toBe(true);
    expect(isRequirementMet(mixed, new Set(["MATH 223"]))).toBe(false);
    expect(autofillCodesForRequirement(mixed)).toEqual(["MATH 221", "MATH 215"]);
  });

  it("treats a single course and a two-course sequence as alternative paths", () => {
    const nested = parseProgramYears(
      ["First Year", "CPSC_V 110 (or 103 and 107)", "4", "Total Credits", "30"].join("\n"),
    ).years[0].items[0];

    expect(nested.paths).toEqual([["CPSC 110"], ["CPSC 103", "CPSC 107"]]);
    expect(isRequirementMet(nested, new Set(["CPSC 110"]))).toBe(true);
    expect(isRequirementMet(nested, new Set(["CPSC 103"]))).toBe(false);
    expect(isRequirementMet(nested, new Set(["CPSC 103", "CPSC 107"]))).toBe(true);
    expect(autofillCodesForRequirement(nested)).toEqual(["CPSC 110"]);
  });

  it("keeps course-level ranges as manual requirements", () => {
    const range = parseProgramYears(
      ["Third and Fourth Years", "CPSC courses numbered 300 or higher", "9", "Total Credits", "60"].join("\n"),
    ).years[0].items[0];

    expect(range).toMatchObject({ kind: "text", codes: [], credits: 9 });
  });

  it("requires every code of an all-of row and any code of a one-of row", () => {
    const [cpsc, mathChoice] = parsed.years[0].items;
    expect(isRequirementMet(cpsc, new Set(["CPSC 103"]))).toBe(true);
    expect(isRequirementMet(mathChoice, new Set(["MATH 180"]))).toBe(true);
    expect(isRequirementMet(mathChoice, new Set(["MATH 200"]))).toBe(false);
  });
});
