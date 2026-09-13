import { projectCalendarEvents, projectCampusEvents } from "@/src/server/calendar-events";
import type { KeyDateDoc } from "@/src/server/modules/calendar";
import type { EventDoc } from "@/src/server/modules/events";
import { getSearch } from "@/src/server/search";
import { addMonths, parseISODate, toISODate } from "@/src/shared/calendar/date-math";
import type { CalendarEvent } from "@/src/shared/calendar/event";
import { json, serverError } from "../http";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Campus events are served for the visible month plus this many months after
 * it: a full year holds more rows than Meilisearch's hit ceiling. */
const EVENT_WINDOW_MONTHS = 2;

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
      events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    }
    return new Response(JSON.stringify(events), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
    });
  } catch (e) {
    return serverError(e);
  }
}
