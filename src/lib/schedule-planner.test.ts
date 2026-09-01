import { describe, expect, it } from "vitest";
import type { CourseDoc, CourseSection } from "./api-types";
import type { ScheduledSection } from "./schedule";
import { selectAutomaticSections } from "./schedule-planner";

const term = "2026-27 Winter Term 1";

function section(section: string, days: string[], start: string, status = "Open"): CourseSection {
  return { section, term, days, start_time: start, end_time: `${Number(start.slice(0, 2)) + 1}:00`, status };
}

function course(sections: CourseSection[]): CourseDoc {
  return {
    code: "CPSC 110",
    subject: "CPSC",
    number: "110",
    title: "Computation, Programs, and Programming",
    description: "",
    credits: 4,
    prerequisite: null,
    corequisite: null,
    terms: [term],
    sections,
  };
}

function occupied(days: string[], startMinutes: number): ScheduledSection {
  return {
    code: "MATH 100",
    title: "Differential Calculus",
    section: "101",
    term,
    days,
    startMinutes,
    endMinutes: startMinutes + 60,
  };
}

describe("selectAutomaticSections", () => {
  it("searches complete combinations instead of accepting a greedy conflict", () => {
    const doc = course([
      section("101", ["Mon"], "09:00"),
      section("102", ["Tue"], "09:00"),
      section("L1A", ["Mon"], "09:00"),
    ]);

    expect(selectAutomaticSections(doc, term, []).sections.map((candidate) => candidate.section)).toEqual([
      "102",
      "L1A",
    ]);
  });

  it("does not select optional unknown section groups when known components exist", () => {
    const doc = course([
      section("101", ["Mon"], "09:00"),
      section("L1A", ["Tue"], "09:00"),
      section("CH1", ["Wed"], "09:00"),
      section("W-L", ["Thu"], "09:00"),
    ]);

    expect(selectAutomaticSections(doc, term, []).sections.map((candidate) => candidate.section)).toEqual([
      "101",
      "L1A",
    ]);
  });

  it("prefers scheduled sections over open TBA placeholders", () => {
    const scheduled = section("102", ["Tue"], "09:00", "Closed");
    const tba = { ...section("101", [], "09:00"), start_time: null, end_time: null, status: "Open" };

    expect(selectAutomaticSections(course([tba, scheduled]), term, []).sections[0].section).toBe("102");
  });

  it("prefers available sections within a conflict-free combination", () => {
    const doc = course([section("101", ["Mon"], "09:00", "Closed"), section("102", ["Tue"], "09:00", "Open")]);

    expect(selectAutomaticSections(doc, term, []).sections[0].section).toBe("102");
  });

  it("returns the deterministic first combination when every option conflicts", () => {
    const doc = course([
      section("101", ["Mon"], "09:00"),
      section("102", ["Tue"], "09:00"),
      section("L1A", ["Wed"], "09:00"),
    ]);
    const existing = [occupied(["Mon"], 540), occupied(["Tue"], 540), occupied(["Wed"], 540)];
    const result = selectAutomaticSections(doc, term, existing);

    expect(result.conflictFree).toBe(false);
    expect(result.sections.map((candidate) => candidate.section)).toEqual(["101", "L1A"]);
  });
});
