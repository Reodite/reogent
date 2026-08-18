import type { KeyDateDoc } from "@/src/server/modules/calendar";
import { getSearch } from "@/src/server/search";
import type { CalendarEvent, CalendarEventKind } from "@/src/shared/calendar/event";
import { serverError } from "../http";

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
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return events;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const kindsRaw = url.searchParams.get("kinds") ?? "";
    const kinds = kindsRaw
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    const search = getSearch();
    const filter =
      kinds.length > 0 ? `${kinds.map((k, i) => `${i === 0 ? "" : " OR "}kind = "${k}"`).join("")}` : undefined;
    const res = await search.index("key_dates").search("", {
      filter,
      sort: ["start:asc"],
      limit: 200,
    });
    const docs = res.hits as unknown as KeyDateDoc[];
    const events = projectCalendarEvents(docs, from, to);
    return new Response(JSON.stringify(events), {
      status: 200,
      headers: { "content-type": "application/json", "cache-control": "public, max-age=300" },
    });
  } catch (e) {
    return serverError(e);
  }
}
