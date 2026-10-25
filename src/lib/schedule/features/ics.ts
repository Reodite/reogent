import type { DayCode, Schedule } from "../types";

const BYDAY: Record<DayCode, string> = { Mon: "MO", Tue: "TU", Wed: "WE", Thu: "TH", Fri: "FR", Sat: "SA", Sun: "SU" };
const JS_DAY: DayCode[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const VANCOUVER = [
  "BEGIN:VTIMEZONE",
  "TZID:America/Vancouver",
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0800",
  "TZOFFSETTO:-0700",
  "TZNAME:PDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0700",
  "TZOFFSETTO:-0800",
  "TZNAME:PST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

function escapeText(value: string): string {
  return value.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\r?\n/g, "\\n");
}

// RFC 5545 limits content lines to 75 octets; continuation lines start with a space.
function fold(line: string): string {
  const parts: string[] = [];
  for (let i = 0; i < line.length; i += 73) parts.push(line.slice(i, i + 73));
  return parts.join("\r\n ");
}

function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function compactDate(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function clock(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}${String(min % 60).padStart(2, "0")}00`;
}

/**
 * Serializes a Workday schedule as an iCalendar file with one weekly
 * recurring event per meeting pattern, in Vancouver time. Skips sections
 * without term dates and patterns without days. Reading breaks and holidays
 * still appear as class days because the schedule keeps only the outer term range.
 */
export function scheduleToIcs(schedule: Schedule, now = new Date()): string {
  const stamp = `${now.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Reodite//Schedule//EN",
    "CALSCALE:GREGORIAN",
    ...VANCOUVER,
  ];
  for (const section of schedule.sections) {
    if (!section.termStart || !section.termEnd) continue;
    section.meetings.forEach((pattern, index) => {
      const days = pattern.days.filter((day) => day in BYDAY);
      if (days.length === 0) return;
      const first = utcDate(section.termStart as string);
      while (!days.includes(JS_DAY[first.getUTCDay()])) first.setUTCDate(first.getUTCDate() + 1);
      const until = utcDate(section.termEnd as string);
      until.setUTCDate(until.getUTCDate() + 1);
      const where = [pattern.buildingName ?? pattern.buildingCode, pattern.room].filter(Boolean).join(" ");
      lines.push(
        "BEGIN:VEVENT",
        `UID:${section.id}-${index}@reodite`,
        `DTSTAMP:${stamp}`,
        `DTSTART;TZID=America/Vancouver:${compactDate(first)}T${clock(pattern.startMin)}`,
        `DTEND;TZID=America/Vancouver:${compactDate(first)}T${clock(pattern.endMin)}`,
        // UNTIL must be UTC; 06:59Z the next day is 22:59 PST or 23:59 PDT on the last local day.
        `RRULE:FREQ=WEEKLY;BYDAY=${days.map((day) => BYDAY[day]).join(",")};UNTIL=${compactDate(until)}T065959Z`,
        `SUMMARY:${escapeText(`${section.courseCode.replace(/_V(?=\s)/, "")} ${section.component}`)}`,
        `DESCRIPTION:${escapeText([section.title, ...section.instructors].join("\n"))}`,
        ...(where ? [`LOCATION:${escapeText(where)}`] : []),
        "END:VEVENT",
      );
    });
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
