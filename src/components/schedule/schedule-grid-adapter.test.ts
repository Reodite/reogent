import type { MergedBlock } from "@/src/lib/schedule/calendar/buildCalendar";
import type { Person, Section } from "@/src/lib/schedule/types";
import { describe, expect, it } from "vitest";
import { buildSharerBands, buildSharerGrid } from "./schedule-grid-adapter";

const section: Section = {
  id: "cpsc-110",
  courseCode: "CPSC_V 110",
  title: "Computation, Programs, and Programming",
  component: "Lecture",
  instructors: ["Ada Lovelace"],
  meetings: [],
};

const person: Person = {
  id: "u1",
  handle: "ada",
  avatar: { kind: "initials", initials: "AL", color: "#6ea8fe" },
  schedule: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
  enabled: true,
};

const block: MergedBlock = {
  key: "Mon|cpsc-110|570|650",
  day: "Mon",
  startMin: 570,
  endMin: 650,
  section,
  people: [person],
  pattern: {
    days: ["Mon"],
    startMin: 570,
    endMin: 650,
    buildingCode: "ICCS",
    room: "X150",
    raw: "",
  },
  rooms: ["X150"],
  col: 0,
  cols: 1,
};

describe("buildSharerGrid", () => {
  it("adapts merged sharer blocks without carrying people into the renderer", () => {
    const adapter = buildSharerGrid([block]);
    const occurrence = adapter.model.occurrencesByDay.get("Mon")?.[0];

    expect(occurrence).toMatchObject({
      id: block.key,
      courseKey: "CPSC 110",
      code: "CPSC 110",
      title: section.title,
      section: "lec",
      meta: "ICCS X150",
    });
    expect(occurrence).not.toHaveProperty("people");
    expect(adapter.blocksById.get(block.key)).toBe(block);
  });

  it("adapts common-free intervals to labeled shared bands", () => {
    expect(buildSharerBands([{ day: "Tue", startMin: 780, endMin: 840 }])).toEqual([
      {
        id: "Tue-780-840",
        day: "Tue",
        startMin: 780,
        endMin: 840,
        label: "Everyone is free from 1 PM to 2 PM",
      },
    ]);
  });
});
