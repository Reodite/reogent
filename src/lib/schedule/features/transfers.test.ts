import { describe, expect, it } from "vitest";
import type { DayCode, Section } from "../types";
import { buildingTransfers } from "./transfers";

function section(
  id: string,
  startMin: number,
  endMin: number,
  buildingCode: string | undefined,
  days: DayCode[] = ["Mon"],
  term: [string, string] = ["2026-09-08", "2026-12-04"],
): Section {
  return {
    id,
    courseCode: id,
    title: id,
    component: "Lecture",
    instructors: [],
    termStart: term[0],
    termEnd: term[1],
    meetings: [{ days, startMin, endMin, buildingCode, raw: "" }],
  };
}

describe("buildingTransfers", () => {
  it("pairs consecutive meetings that change buildings within the gap limit", () => {
    const transfers = buildingTransfers([
      section("CPSC 110", 540, 590, "ICCS"),
      section("MATH 100", 600, 650, "LSK"),
      section("PHYS 117", 660, 710, "LSK"),
      section("ENGL 112", 780, 830, "BUCH"),
    ]);
    expect(transfers.map((t) => [t.from.section.id, t.to.section.id, t.gapMin])).toEqual([
      ["CPSC 110", "MATH 100", 10],
    ]);
  });

  it("ignores overlaps, missing buildings, and sections from different terms", () => {
    expect(
      buildingTransfers([
        section("A", 540, 600, "ICCS"),
        section("B", 580, 650, "LSK"),
        section("C", 660, 700, undefined),
        section("D", 710, 760, "BUCH", ["Mon"], ["2027-01-05", "2027-04-09"]),
      ]),
    ).toEqual([]);
  });

  it("skips an other-term meeting to find the real previous class", () => {
    const transfers = buildingTransfers([
      section("A", 540, 590, "ICCS"),
      section("B", 590, 595, "BUCH", ["Mon"], ["2027-01-05", "2027-04-09"]),
      section("C", 600, 650, "LSK"),
    ]);
    expect(transfers.map((t) => [t.from.section.id, t.to.section.id])).toEqual([["A", "C"]]);
  });
});
