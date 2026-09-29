import { describe, expect, it } from "vitest";
import type { BlockInstance } from "../calendar/buildCalendar";
import type { DayCode } from "../types";
import { commonFreeIntervals } from "./freeTime";

function block(startMin: number, endMin: number, day: DayCode = "Mon"): BlockInstance {
  return {
    day,
    startMin,
    endMin,
    section: {
      id: "cpsc-110",
      courseCode: "CPSC 110",
      title: "Computation, Programs, and Programming",
      component: "Lecture",
      instructors: [],
      meetings: [],
    },
    person: {
      id: "student",
      handle: "student",
      avatar: { kind: "initials", initials: "ST", color: "#4a4e7a" },
      schedule: null,
      updatedAt: "2026-01-01T00:00:00Z",
      enabled: true,
    },
    pattern: { days: [day], startMin, endMin, raw: "" },
  };
}

describe("commonFreeIntervals", () => {
  it("handles unsorted, overlapping, nested, duplicate, and adjacent meetings without mutating input", () => {
    const blocks = [block(660, 720), block(540, 630), block(570, 600), block(600, 660), block(540, 630)];
    const original = structuredClone(blocks);
    for (const entry of blocks) Object.freeze(entry);
    Object.freeze(blocks);

    expect(commonFreeIntervals(blocks, ["Mon"], 480, 780)).toEqual([
      { day: "Mon", startMin: 480, endMin: 540 },
      { day: "Mon", startMin: 720, endMin: 780 },
    ]);
    expect(blocks).toEqual(original);
  });

  it("clips meetings to the requested window and ignores meetings outside it", () => {
    const blocks = [block(60, 120), block(420, 510), block(720, 810), block(900, 960)];
    expect(commonFreeIntervals(blocks, ["Mon"], 480, 780)).toEqual([{ day: "Mon", startMin: 510, endMin: 720 }]);
    expect(commonFreeIntervals([block(60, 120), block(900, 960)], ["Mon"], 480, 780)).toEqual([
      { day: "Mon", startMin: 480, endMin: 780 },
    ]);
  });

  it("retains gaps exactly at the minimum and drops shorter gaps", () => {
    expect(commonFreeIntervals([block(509, 540), block(570, 600)], ["Mon"], 480, 630)).toEqual([
      { day: "Mon", startMin: 540, endMin: 570 },
      { day: "Mon", startMin: 600, endMin: 630 },
    ]);
    expect(commonFreeIntervals([block(500, 560)], ["Mon"], 480, 600, 40)).toEqual([
      { day: "Mon", startMin: 560, endMin: 600 },
    ]);
  });

  it("preserves requested day order and includes days without meetings", () => {
    expect(commonFreeIntervals([block(480, 600), block(480, 780, "Tue")], ["Wed", "Mon"], 480, 780)).toEqual([
      { day: "Wed", startMin: 480, endMin: 780 },
      { day: "Mon", startMin: 600, endMin: 780 },
    ]);
    expect(commonFreeIntervals([], [])).toEqual([]);
  });

  it("returns no gaps for a covered or empty window", () => {
    expect(commonFreeIntervals([block(400, 900)], ["Mon"], 480, 780)).toEqual([]);
    expect(commonFreeIntervals([], ["Mon"], 480, 480, 0)).toEqual([]);
    expect(commonFreeIntervals([], ["Mon"], 780, 480, 0)).toEqual([]);
  });
});
