import type { KeyDateDoc } from "@/src/server/modules/calendar";
import type { EventDoc } from "@/src/server/modules/events";
import { parseISODate, toISODate } from "@/src/shared/calendar/date-math";
import type { CalendarEvent, CalendarEventKind } from "@/src/shared/calendar/event";

/** Days a multi-day campus event occupies in the grid; longer runs
 * (exhibitions lasting months) are truncated at this many entries. */
const MAX_EVENT_DAYS = 14;

const byDate = (a: CalendarEvent, b: CalendarEvent) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

// Keep inferred key-date tags short for compact calendar popover chips.
function inferTags(name: string): string[] {
  const tags: string[] = [];
  // Reading-week must precede exam-week checks where applicable: "Reading
  // week ends; exam period begins" carries both tags intentionally.
  if (/reading[\s-]?week/i.test(name)) tags.push("reading-week");
  if (/exam/i.test(name)) tags.push("exam");
  if (/term/i.test(name)) tags.push("term");
  if (/(?:withdraw(?:al)?|drop[\s/-]deadline|deadline to)/i.test(name)) tags.push("deadline");
  return tags;
}

/** Project KeyDateDoc rows into CalendarEvent for the calendar pane's month
 * grid and upcoming-events list. Rows without a usable `start` are dropped. */
export function projectCalendarEvents(docs: KeyDateDoc[], from?: string | null, to?: string | null): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const doc of docs) {
    const date = doc.start ?? null;
    if (!date) continue;
    if (typeof from === "string" && date < from) continue;
    if (typeof to === "string" && date > to) continue;
    events.push({
      kind: doc.kind as CalendarEventKind,
      date,
      label: doc.name,
      source_url: doc.source_url,
      tags: doc.kind === "academic" ? inferTags(doc.name) : [],
    });
  }
  events.sort(byDate);
  return events;
}

/** Project campus EventDoc rows into one `kind: "event"` entry per day the
 * event runs (Vancouver-local "yyyy-MM-dd HH:mm:ss" start/end), clipped to
 * [from, to] and capped at MAX_EVENT_DAYS. Rows without a start_date are
 * dropped; an end before the start counts as a single day. Duplicate source
 * rows with the same title, timing, location, and categories are emitted once. */
export function projectCampusEvents(docs: EventDoc[], from?: string | null, to?: string | null): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const seen = new Set<string>();
  for (const doc of docs) {
    const identity = JSON.stringify([
      doc.title,
      doc.start_date,
      doc.end_date,
      doc.all_day,
      doc.venue,
      doc.venue_address,
      [...doc.categories].sort(),
    ]);
    if (seen.has(identity)) continue;
    seen.add(identity);

    const start = doc.start_date?.slice(0, 10);
    if (!start) continue;
    const endRaw = doc.end_date?.slice(0, 10);
    const end = endRaw && endRaw > start ? endRaw : start;
    const day = parseISODate(start);
    for (let i = 0; i < MAX_EVENT_DAYS; i++) {
      const date = toISODate(day);
      if (date > end) break;
      if ((!from || date >= from) && (!to || date <= to)) {
        events.push({ kind: "event", date, label: doc.title, source_url: doc.url, tags: doc.categories });
      }
      day.setUTCDate(day.getUTCDate() + 1);
    }
  }
  events.sort(byDate);
  return events;
}
