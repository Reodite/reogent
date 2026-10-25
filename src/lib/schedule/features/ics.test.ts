import { describe, expect, it } from "vitest";
import { scheduleToIcs } from "./ics";

describe("scheduleToIcs", () => {
  it("emits a weekly event starting on the first meeting day of the term", () => {
    const ics = scheduleToIcs(
      {
        importedAt: "2026-08-01T00:00:00Z",
        sections: [
          {
            id: "abc",
            courseCode: "CPSC_V 221",
            title: "Basic Algorithms, and Data Structures",
            component: "Lecture",
            instructors: ["Ada Lovelace"],
            termStart: "2026-09-08",
            termEnd: "2026-12-04",
            meetings: [
              { days: ["Mon", "Wed"], startMin: 570, endMin: 630, buildingCode: "DMP", room: "110", raw: "" },
              { days: [], startMin: 0, endMin: 0, raw: "" },
            ],
          },
          { id: "tba", courseCode: "X", title: "X", component: "Lecture", instructors: [], meetings: [] },
        ],
      },
      new Date("2026-08-01T12:00:00Z"),
    );
    const lines = ics.split("\r\n");
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
    // 2026-09-08 is a Tuesday, so the first Mon/Wed meeting is 2026-09-09.
    expect(lines).toContain("DTSTART;TZID=America/Vancouver:20260909T093000");
    expect(lines).toContain("DTEND;TZID=America/Vancouver:20260909T103000");
    expect(lines).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261205T065959Z");
    expect(lines).toContain("SUMMARY:CPSC 221 Lecture");
    expect(lines).toContain("DESCRIPTION:Basic Algorithms\\, and Data Structures\\nAda Lovelace");
    expect(lines).toContain("LOCATION:DMP 110");
    expect(lines.every((l) => l.length <= 75)).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
