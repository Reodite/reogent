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
  it("expands multi-day sections and assigns overlap lanes", () => {
    const model = buildScheduleGrid([
      item(),
      item({ id: "math-100", courseKey: "MATH 100", code: "MATH 100", startMin: 9 * 60 + 30 }),
    ]);

    expect(model.days).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    expect(model.occurrencesByDay.get("Mon")?.map(({ code, col, cols }) => ({ code, col, cols }))).toEqual([
      { code: "CPSC 110", col: 0, cols: 2 },
      { code: "MATH 100", col: 1, cols: 2 },
    ]);
    expect(model.occurrencesByDay.get("Wed")).toHaveLength(2);
  });

  it("adds weekend columns and counts unscheduled sections", () => {
    const model = buildScheduleGrid([item({ days: ["Sat"] }), item({ id: "tba", days: [], startMin: -1, endMin: -1 })]);

    expect(model.days).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(model.unscheduledCount).toBe(1);
  });

  it("keeps a stable empty-day range", () => {
    const model = buildScheduleGrid([]);
    expect(model.dayStartMin).toBe(8 * 60);
    expect(model.dayEndMin).toBe(22 * 60);
    expect(model.occurrencesByDay.get("Mon")).toEqual([]);
  });
});
