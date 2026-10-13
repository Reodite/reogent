import { describe, expect, it } from "vitest";
import { buildScheduleGrid, type ScheduleGridItem } from "./grid";

function item(overrides: Partial<ScheduleGridItem> = {}): ScheduleGridItem {
  return {
    id: "cpsc-110",
    courseKey: "CPSC 110",
    code: "CPSC 110",
    title: "Computation, Programs, and Programming",
    section: "101",
    days: ["Mon", "Wed", "Fri"],
    startMin: 9 * 60,
    endMin: 10 * 60,
    ...overrides,
  };
}

describe("buildScheduleGrid", () => {
  it("expands multi-day sections without dropping simultaneous courses", () => {
    const model = buildScheduleGrid([
      item(),
      item({ id: "math-100", courseKey: "MATH 100", code: "MATH 100", startMin: 9 * 60 + 30 }),
    ]);

    expect(model.occurrencesByDay.get("Mon")?.map(({ code }) => code)).toEqual(["CPSC 110", "MATH 100"]);
    expect(model.occurrencesByDay.get("Wed")).toHaveLength(2);
  });

  it("includes weekend days and counts unscheduled sections", () => {
    const model = buildScheduleGrid([item({ days: ["Sat"] }), item({ id: "tba", days: [], startMin: -1, endMin: -1 })]);

    expect(model.days).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(model.unscheduledCount).toBe(1);
  });

  it("returns no occurrences for an empty schedule", () => {
    const model = buildScheduleGrid([]);
    expect(model.occurrencesByDay.get("Mon")).toEqual([]);
  });
});
