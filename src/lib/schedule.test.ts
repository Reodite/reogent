import { describe, expect, it } from "vitest";
import {
  conflictedIndices,
  conflicts,
  formatTime,
  hourRange,
  laneLayout,
  normalizeDays,
  parseTime,
  sectionComponent,
  visibleDays,
  type ScheduledSection,
} from "./schedule";

function sec(p: Partial<ScheduledSection> & Pick<ScheduledSection, "code" | "section">): ScheduledSection {
  return {
    title: "Course",
    term: "2026-27 Winter Term 1",
    days: ["Mon", "Wed", "Fri"],
    startMinutes: 9 * 60,
    endMinutes: 10 * 60,
    ...p,
  };
}

describe("sectionComponent", () => {
  it("classifies digit-led codes as lectures", () => {
    expect(sectionComponent("101")).toBe("lecture");
    expect(sectionComponent("1W1")).toBe("lecture");
  });
  it("maps letter prefixes and dataset-prefixed codes to component families", () => {
    expect(sectionComponent("L1A")).toBe("laboratory");
    expect(sectionComponent("T1B")).toBe("tutorial");
    expect(sectionComponent("D2")).toBe("discussion");
    expect(sectionComponent("A_301")).toBe("lecture");
    expect(sectionComponent("A_L05")).toBe("laboratory");
  });
  it("falls back to other for unknown letters and blanks", () => {
    expect(sectionComponent("R01")).toBe("other");
    expect(sectionComponent("")).toBe("other");
  });
});

describe("normalizeDays", () => {
  it("expands the compact day codes supplied by the sections dataset", () => {
    expect(normalizeDays(["m", "t", "w", "th", "f"])).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    expect(normalizeDays(["Sat", "custom"])).toEqual(["Sat", "custom"]);
  });
});

describe("parseTime / formatTime", () => {
  it("parses valid HH:MM", () => {
    expect(parseTime("09:30")).toBe(570);
    expect(parseTime("0:05")).toBe(5);
  });
  it("rejects null, malformed, and out-of-range values", () => {
    expect(parseTime(null)).toBe(-1);
    expect(parseTime("9:60")).toBe(-1);
    expect(parseTime("24:00")).toBe(-1);
    expect(parseTime("25:00")).toBe(-1);
    expect(parseTime("noon")).toBe(-1);
  });
  it("round-trips through formatTime", () => {
    expect(formatTime(parseTime("14:15"))).toBe("14:15");
  });
});

describe("conflicts", () => {
  it("flags same-term overlapping sections sharing a day", () => {
    const a = sec({ code: "CPSC 110", section: "101" });
    const b = sec({ code: "CPSC 121", section: "201", startMinutes: 9.5 * 60, endMinutes: 10.5 * 60 });
    expect(conflicts(a, b)).toBe(true);
  });
  it("ignores touching edges and different days/terms", () => {
    const a = sec({ code: "CPSC 110", section: "101" });
    expect(conflicts(a, sec({ code: "X 1", section: "1", startMinutes: 10 * 60, endMinutes: 11 * 60 }))).toBe(false);
    expect(conflicts(a, sec({ code: "X 1", section: "1", days: ["Tue"] }))).toBe(false);
    expect(conflicts(a, sec({ code: "X 1", section: "1", term: "2026-27 Winter Term 2" }))).toBe(false);
  });
  it("ignores sections without times", () => {
    const a = sec({ code: "A 1", section: "1", startMinutes: -1, endMinutes: -1 });
    expect(conflicts(a, sec({ code: "B 1", section: "1" }))).toBe(false);
  });
});

describe("conflictedIndices", () => {
  it("returns exactly the indices involved in a conflict", () => {
    const good = sec({ code: "A 1", section: "1", startMinutes: 12 * 60, endMinutes: 13 * 60 });
    const keeper = sec({ code: "A 1", section: "1", days: ["Tue"] }); // distinct course, marked A to pass
    const clash = sec({ code: "B 1", section: "2", startMinutes: 9.5 * 60, endMinutes: 10.5 * 60 });
    const entries = [sec({ code: "A 1", section: "1" }), keeper, clash, good];
    // entries[0] and entries[2] overlap; entries[1] is Tue-only, entries[3] is noon.
    expect([...conflictedIndices(entries)].sort()).toEqual([0, 2]);
  });
});

describe("laneLayout", () => {
  it("puts disjoint sections in one lane", () => {
    const m = laneLayout([
      { index: 0, startMinutes: 9 * 60, endMinutes: 10 * 60 },
      { index: 1, startMinutes: 10 * 60, endMinutes: 11 * 60 },
    ]);
    expect(m.get(0)).toEqual({ lane: 0, lanes: 1 });
    expect(m.get(1)).toEqual({ lane: 0, lanes: 1 });
  });
  it("assigns lanes to overlapping and transitively-overlapping runs", () => {
    const m = laneLayout([
      { index: 0, startMinutes: 9 * 60, endMinutes: 11 * 60 },
      { index: 1, startMinutes: 10 * 60, endMinutes: 12 * 60 },
      { index: 2, startMinutes: 11.5 * 60, endMinutes: 13 * 60 },
    ]);
    expect(m.get(0)?.lanes).toBe(2);
    expect(m.get(1)?.lanes).toBe(2);
    expect(m.get(0)?.lane).toBe(0);
    expect(m.get(1)?.lane).toBe(1);
    expect(m.get(2)?.lane).toBe(0);
  });
});

describe("visibleDays", () => {
  it("is Mon–Fri unless a weekend day is used", () => {
    expect(visibleDays([sec({ code: "A 1", section: "1" })])).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"]);
    expect(visibleDays([sec({ code: "A 1", section: "1", days: ["Sat"] })])).toEqual([
      "Mon",
      "Tue",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
    ]);
  });
});

describe("hourRange", () => {
  it("defaults to 08:00–22:00 with no entries", () => {
    expect(hourRange([])).toEqual({ startHour: 8, endHour: 22 });
  });
  it("keeps the default window when entries fit inside it", () => {
    expect(hourRange([sec({ code: "A 1", section: "1" })])).toEqual({ startHour: 8, endHour: 22 });
  });
  it("expands around early or late sections", () => {
    const early = sec({ code: "A 1", section: "1", startMinutes: 7 * 60, endMinutes: 8 * 60 });
    const late = sec({ code: "B 2", section: "2", startMinutes: 20 * 60, endMinutes: 23.5 * 60 });
    expect(hourRange([early])).toEqual({ startHour: 7, endHour: 22 });
    expect(hourRange([late])).toEqual({ startHour: 8, endHour: 24 });
  });
});
