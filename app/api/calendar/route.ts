import type { KeyDateDoc } from "@/src/server/modules/calendar";
import type { EventDoc } from "@/src/server/modules/events";
import { getSearch } from "@/src/server/search";
import { addMonths, parseISODate, toISODate } from "@/src/shared/calendar/date-math";
import type { CalendarEvent, CalendarEventKind } from "@/src/shared/calendar/event";
import { json, serverError } from "../http";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Days a multi-day campus event occupies in the grid; longer runs
 * (exhibitions lasting months) are truncated at this many entries. */
const MAX_EVENT_DAYS = 14;

/** Campus events are served for the visible month plus this many months after
 * it: a full year holds more rows than Meilisearch's hit ceiling. */
const EVENT_WINDOW_MONTHS = 2;

const byDate = (a: CalendarEvent, b: CalendarEvent) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/** Infer sub-kind tags from a key-date name. Tags are kept small to limit
 * the popover's tag chip surface; add new categories only when the calendar
 * pane's filtered view teaches a behaviour off them. */
function inferTags(name: string): string[] {
  const tags: string[] = [];
  // Reading-week must precede exam-week checks where applicable — "Reading
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
 * dropped; an end before the start counts as a single day. */
export function projectCampusEvents(docs: EventDoc[], from?: string | null, to?: string | null): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  for (const doc of docs) {
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

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if ((from && !ISO_DATE.test(from)) || (to && !ISO_DATE.test(to))) {
      return json({ error: "from/to must be YYYY-MM-DD" }, 400);
    }
    const kindsRaw = url.searchParams.get("kinds") ?? "";
    const kinds = kindsRaw
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    const wantEvents = kinds.includes("event");
    const keyKinds = kinds.filter((k) => k !== "event");
    const search = getSearch();
    const events: CalendarEvent[] = [];
    if (keyKinds.length > 0 || !wantEvents) {
      const filter =
        keyKinds.length > 0 ? `${keyKinds.map((k, i) => `${i === 0 ? "" : " OR "}kind = "${k}"`).join("")}` : undefined;
      const res = await search.index("key_dates").search("", {
        filter,
        sort: ["start:asc"],
        limit: 200,
      });
      events.push(...projectCalendarEvents(res.hits as unknown as KeyDateDoc[], from, to));
    }
    if (wantEvents) {
      const eventFrom = from ?? toISODate(new Date());
      const windowEnd = toISODate(addMonths(parseISODate(eventFrom), EVENT_WINDOW_MONTHS + 1));
      const eventTo = to && to < windowEnd ? to : windowEnd;
      // Filters on start_date only: an event that began before the window and
      // runs into it is not shown.
      const res = await search.index("events").search("", {
        filter: `start_date >= '${eventFrom}' AND start_date < '${eventTo}'`,
        sort: ["start_date:asc"],
        limit: 1000,
      });
      events.push(...projectCampusEvents(res.hits as unknown as EventDoc[], eventFrom, eventTo));
      events.sort(byDate);
    }
    return new Response(JSON.stringify(events), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
    });
  } catch (e) {
    return serverError(e);
  }
}
