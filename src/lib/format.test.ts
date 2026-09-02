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
  it("never renders a dangling tail when a param is missing", () => {
    // Every tool called with empty input must produce a complete sentence.
    const tools = [
      "walking_distance",
      "find_building",
      "find_courses",
      "get_course",
      "get_costs",
      "find_places",
      "get_key_dates",
      "find_events",
      "find_programs",
      "find_study_spaces",
      "get_admission_requirements",
      "search_ubc_pages",
      "get_prereq_tree",
    ];
    for (const name of tools) {
      const label = describeToolCall(name, {});
      expect(label.trim(), `${name} with empty input`).toBe(label);
      expect(label.endsWith("for "), `${name} ends with dangling 'for'`).toBe(false);
      expect(label.endsWith("to "), `${name} ends with dangling 'to'`).toBe(false);
    }
  });

  it("describes walking_distance with from/to", () => {
    expect(describeToolCall("walking_distance", { from_building: "CHBE", to_building: "UBC Bus Exchange" })).toBe(
      "Searched for walking route from CHBE to UBC Bus Exchange",
    );
    expect(describeToolCall("walking_distance", {})).toBe("Searched for walking route");
  });

  it("describes find_building", () => {
    expect(describeToolCall("find_building", { query: "Walter Gage" })).toBe("Searched for Walter Gage");
    expect(describeToolCall("find_building", {})).toBe("Searched for a building");
  });

  it("describes find_courses from whichever filters are present", () => {
    expect(describeToolCall("find_courses", { query: "machine learning" })).toBe(
      'Searched courses matching "machine learning"',
    );
    expect(describeToolCall("find_courses", { subject: "COMM", has_no_prereqs: true })).toBe(
      "Searched COMM courses without prerequisites",
    );
    expect(describeToolCall("find_courses", { level: 300, subject: "CPSC" })).toBe("Searched CPSC courses");
    expect(describeToolCall("find_courses", { min_grade_avg: 80 })).toBe("Searched courses by average");
    expect(describeToolCall("find_courses", {})).toBe("Searched courses");
  });

  it("describes get_costs by kind", () => {
    expect(describeToolCall("get_costs", { kind: "tuition", program_slug: "bachelor-of-science" })).toBe(
      "Searched for bachelor-of-science tuition",
    );
    expect(describeToolCall("get_costs", { kind: "estimate", program: "Computer Science" })).toBe(
      "Searched for Computer Science cost estimate",
    );
    expect(describeToolCall("get_costs", { kind: "fees", query: "U-Pass" })).toBe("Searched for U-Pass costs");
    expect(describeToolCall("get_costs", { kind: "living" })).toBe("Searched for living costs");
    expect(describeToolCall("get_costs", { kind: "living", item: "housing" })).toBe("Searched for housing costs");
    expect(describeToolCall("get_costs", {})).toBe("Searched for costs");
  });

  it("describes get_course", () => {
    expect(describeToolCall("get_course", { course_code: "CPSC 110" })).toBe("Searched for CPSC 110");
    expect(describeToolCall("get_course", {})).toBe("Searched for a course");
  });

  it("describes find_places with category and optional near_building", () => {
    expect(describeToolCall("find_places", { query: "coffee", near_building: "IKB" })).toBe(
      "Searched for coffee near IKB",
    );
    expect(describeToolCall("find_places", { category: "cafe", near_building: "IKB" })).toBe(
      "Searched for cafe near IKB",
    );
    expect(describeToolCall("find_places", { category: "parking", near_building: "Nest" })).toBe(
      "Searched for parking near Nest",
    );
    expect(describeToolCall("find_places", { category: "parking" })).toBe("Searched for parking");
    expect(describeToolCall("find_places", {})).toBe("Searched for places");
  });

  it("describes get_key_dates with and without query", () => {
    expect(describeToolCall("get_key_dates", { query: "withdrawal" })).toBe("Searched for withdrawal dates");
    expect(describeToolCall("get_key_dates", {})).toBe("Searched for key dates");
  });

  it("describes find_events with keyword and date range", () => {
    expect(describeToolCall("find_events", { query: "career fair" })).toBe(
      'Searched for events matching "career fair"',
    );
    expect(describeToolCall("find_events", { from_date: "2026-08-20" })).toBe("Searched for events since 2026-08-20");
    expect(describeToolCall("find_events", {})).toBe("Searched for events");
  });

  it("describes find_programs by query or degree", () => {
    expect(describeToolCall("find_programs", { query: "engineering" })).toBe(
      'Searched for programs matching "engineering"',
    );
    expect(describeToolCall("find_programs", { degree: "Bachelor of Science" })).toBe(
      "Searched for Bachelor of Science programs",
    );
    expect(describeToolCall("find_programs", {})).toBe("Searched for UBC programs");
  });

  it("describes find_study_spaces by kind, building, and capacity", () => {
    expect(describeToolCall("find_study_spaces", { kind: "bookable", building: "IKB" })).toBe(
      "Searched for free rooms in IKB",
    );
    expect(describeToolCall("find_study_spaces", { kind: "bookable" })).toBe("Searched for free rooms");
    expect(describeToolCall("find_study_spaces", { min_capacity: 6 })).toBe("Searched for study spaces seating 6+");
    expect(describeToolCall("find_study_spaces", { building: "BUCH" })).toBe("Searched for study spaces near BUCH");
    expect(describeToolCall("find_study_spaces", {})).toBe("Searched for study spaces");
  });

  it("describes admission requirements and pages", () => {
    expect(describeToolCall("get_admission_requirements", { program: "Computer Science" })).toBe(
      "Searched admission requirements for Computer Science",
    );
    expect(describeToolCall("get_admission_requirements", {})).toBe("Searched admission requirements");
    expect(describeToolCall("search_ubc_pages", { query: "academic concession" })).toBe(
      "Searched UBC pages for academic concession",
    );
    expect(describeToolCall("search_ubc_pages", {})).toBe("Searched UBC pages");
  });

  it("describes get_prereq_tree", () => {
    expect(describeToolCall("get_prereq_tree", { course_code: "CPSC 320" })).toBe(
      "Searched prerequisite tree for CPSC 320",
    );
    expect(describeToolCall("get_prereq_tree", {})).toBe("Searched prerequisite tree");
  });

  it("describes show_widget single-entity labels with guards", () => {
    expect(describeToolCall("show_widget", { type: "course" })).toBe("Showing course");
    expect(describeToolCall("show_widget", { type: "route" })).toBe("Showing route");
    expect(describeToolCall("show_widget", { type: "tuition" })).toBe("Showing tuition");
    expect(describeToolCall("show_widget", { type: "grades" })).toBe("Showing grades");
    expect(describeToolCall("show_widget", { type: "building_detail", building_code: "IBLC" })).toBe(
      "Showing details for IBLC",
    );
    expect(describeToolCall("show_widget", { type: "building_entrances", building_code: "IBLC" })).toBe(
      "Showing entrances for IBLC",
    );
    expect(describeToolCall("show_widget", { type: "building_spaces", building_code: "IBLC" })).toBe(
      "Showing rooms in IBLC",
    );
  });

  it("falls back for unknown tools by converting the name", () => {
    expect(describeToolCall("unknown_tool", { x: 1 })).toBe("Searched: Unknown Tool");
  });
});
