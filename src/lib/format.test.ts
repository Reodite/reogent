import {
  describeToolCall,
  formatCad,
  formatMeters,
  formatMinutes,
  SESSION_GROUP_ORDER,
  sessionGroup,
} from "@/src/lib/format";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

describe("sessionGroup", () => {
  const now = new Date("2026-08-06T12:00:00Z");

  it("buckets the boundary cases", () => {
    expect(sessionGroup("2026-08-06T09:00:00Z", now)).toBe("Today");
    expect(sessionGroup("2026-08-05T23:59:00Z", now)).toBe("Yesterday");
    expect(sessionGroup("2026-08-02T12:00:00Z", now)).toBe("This week");
    // Same calendar month but beyond the 7-day window:
    const lateMonth = new Date("2026-08-28T12:00:00Z");
    expect(sessionGroup("2026-08-05T12:00:00Z", lateMonth)).toBe("This month");
    // A previous calendar month is "Older", even when recent:
    expect(sessionGroup("2026-07-14T12:00:00Z", now)).toBe("Older");
    expect(sessionGroup("not-a-date", now)).toBe("Older");
  });

  it("buckets future dates as Today", () => {
    expect(sessionGroup("2030-01-01T00:00:00Z", now)).toBe("Today");
  });

  it("buckets dates far in the past as Older", () => {
    expect(sessionGroup("1990-01-01T00:00:00Z", now)).toBe("Older");
  });

  it("always returns a known group, and newer timestamps never land in older buckets (property)", () => {
    const iso = fc
      .date({ min: new Date("2020-01-01"), max: new Date("2026-08-06T11:59:59Z"), noInvalidDate: true })
      .map((d) => d.toISOString());
    fc.assert(
      fc.property(iso, iso, (a, b) => {
        const [newer, older] = Date.parse(a) >= Date.parse(b) ? [a, b] : [b, a];
        const groupNewer = sessionGroup(newer, now);
        const groupOlder = sessionGroup(older, now);
        return (
          SESSION_GROUP_ORDER.includes(groupNewer) &&
          SESSION_GROUP_ORDER.includes(groupOlder) &&
          SESSION_GROUP_ORDER.indexOf(groupNewer) <= SESSION_GROUP_ORDER.indexOf(groupOlder)
        );
      }),
    );
  });
});

describe("formatters", () => {
  it("formats CAD amounts", () => {
    expect(formatCad(202.13)).toBe("$202.13");
    expect(formatCad(1494.65)).toBe("$1,494.65");
  });

  it("returns placeholder for non-finite CAD values", () => {
    expect(formatCad(NaN)).toBe("—");
    expect(formatCad(Infinity)).toBe("—");
    expect(formatCad(-Infinity)).toBe("—");
  });

  it("formats meters, switching to km at 1000", () => {
    expect(formatMeters(460)).toBe("460 m");
    expect(formatMeters(1250)).toBe("1.3 km");
  });

  it("returns placeholder for non-finite meter values", () => {
    expect(formatMeters(NaN)).toBe("—");
    expect(formatMeters(Infinity)).toBe("—");
    expect(formatMeters(-Infinity)).toBe("—");
  });

  it("never reports less than one minute", () => {
    expect(formatMinutes(0.2)).toBe("1 min");
    expect(formatMinutes(6)).toBe("6 min");
  });

  it("returns placeholder for non-finite minute values", () => {
    expect(formatMinutes(NaN)).toBe("—");
    expect(formatMinutes(Infinity)).toBe("—");
    expect(formatMinutes(-Infinity)).toBe("—");
  });
});

describe("describeToolCall", () => {
  it("describes walking_distance with from/to", () => {
    expect(describeToolCall("walking_distance", { from_building: "CHBE", to_building: "UBC Bus Exchange" })).toBe(
      "Searched for walking distance from CHBE to UBC Bus Exchange",
    );
  });

  it("describes find_building", () => {
    expect(describeToolCall("find_building", { query: "Walter Gage" })).toBe("Searched for building: Walter Gage");
  });

  it("describes find_courses", () => {
    expect(describeToolCall("find_courses", { query: "machine learning" })).toBe(
      "Searched for courses: machine learning",
    );
  });

  it("describes get_costs by kind", () => {
    expect(describeToolCall("get_costs", { kind: "tuition", program_slug: "bachelor-of-science" })).toBe(
      "Searched for tuition: bachelor-of-science",
    );
    expect(describeToolCall("get_costs", { kind: "estimate", program: "Computer Science" })).toBe(
      "Searched for cost estimate: Computer Science",
    );
    expect(describeToolCall("get_costs", { kind: "fees", query: "U-Pass" })).toBe("Searched for student fees: U-Pass");
  });

  it("describes get_course", () => {
    expect(describeToolCall("get_course", { course_code: "CPSC 110" })).toBe("Searched for course: CPSC 110");
  });

  it("describes find_places with optional near_building", () => {
    expect(describeToolCall("find_places", { query: "coffee", near_building: "IKB" })).toBe(
      "Searched for places: coffee near IKB",
    );
    expect(describeToolCall("find_places", { query: "coffee" })).toBe("Searched for places: coffee");
  });

  it("describes get_key_dates with and without query", () => {
    expect(describeToolCall("get_key_dates", { query: "exam period" })).toBe("Searched for key dates: exam period");
    expect(describeToolCall("get_key_dates", {})).toBe("Searched for key dates");
  });

  it("falls back for unknown tools", () => {
    expect(describeToolCall("unknown_tool", { x: 1 })).toBe("Searched: unknown_tool");
  });
});
