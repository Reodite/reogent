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

  it("requires every code of an all-of row and any code of a one-of row", () => {
    const [cpsc, mathChoice] = parsed.years[0].items;
    expect(isRequirementMet(cpsc, new Set(["CPSC 103"]))).toBe(true);
    expect(isRequirementMet(mathChoice, new Set(["MATH 180"]))).toBe(true);
    expect(isRequirementMet(mathChoice, new Set(["MATH 200"]))).toBe(false);
  });
});
