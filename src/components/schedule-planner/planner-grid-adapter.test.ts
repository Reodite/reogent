import type { CourseDoc } from "@/src/lib/api-types";
import { describe, expect, it } from "vitest";
import { plannerConflictLabels, plannerDragOptions, plannerGridItems } from "./planner-grid-adapter";
import type { ScheduleEntry } from "./schedule-store";

const term = "2026-27 Winter Term 1";

function entry(code: string, section: string, days: string[], start: string, end: string): ScheduleEntry {
  return {
    code,
    section,
    term,
    snapshot: { title: code, instructor: null, days, start_time: start, end_time: end, status: "Open" },
  };
}

const entries = [
  entry("CPSC 110", "101", ["m", "w", "f"], "09:00", "10:00"),
  entry("MATH 100", "201", ["Mon", "Wed", "Fri"], "09:30", "10:30"),
];

const doc: CourseDoc = {
  code: "CPSC 110",
  subject: "CPSC",
  number: "110",
  title: "Computation, Programs, and Programming",
  description: "",
  credits: 4,
  prerequisite: null,
  corequisite: null,
  terms: [term],
  sections: [
    { section: "101", term, days: ["m", "w", "f"], start_time: "09:00", end_time: "10:00" },
    { section: "102", term, days: ["t", "th"], start_time: "11:00", end_time: "12:00" },
  ],
};

describe("planner grid adapter", () => {
  it("normalizes occurrences, labels component type, and marks conflicts", () => {
    const items = plannerGridItems(entries);
    expect(items[0]).toMatchObject({
      id: `CPSC 110::101::${term}`,
      days: ["Mon", "Wed", "Fri"],
      component: "Lecture",
      conflict: true,
    });
    expect(items[1].conflict).toBe(true);
  });

  it("names both sides of each conflict", () => {
    expect(plannerConflictLabels(entries)).toEqual(
      new Map([
        [`CPSC 110::101::${term}`, ["MATH 100 201"]],
        [`MATH 100::201::${term}`, ["CPSC 110 101"]],
      ]),
    );
  });

  it("builds alternate slots for exactly one section group", () => {
    const options = plannerDragOptions(entries, new Map([["CPSC 110", doc]]), `CPSC 110::101::${term}`);
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({
      id: `CPSC 110::102::${term}`,
      item: { section: "102", component: "Lecture", days: ["Tue", "Thu"] },
    });
  });
});
