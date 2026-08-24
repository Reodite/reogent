import type { DatasetModule } from "../core/types";
import { stripHtml } from "./html";

export interface EventDoc {
  id: string;
  title: string;
  text: string;
  url: string | null;
  start_date: string | null; // "yyyy-MM-dd HH:mm:ss"
  end_date: string | null;
  all_day: boolean;
  venue: string | null;
  venue_address: string | null;
  categories: string[];
}

// biome-ignore lint/suspicious/noExplicitAny: raw dataset rows
type Row = Record<string, any>;

export function transformEvent(row: Row): { id: string; doc: EventDoc } | null {
  const id = row.global_id ?? row.id;
  if (id == null || !row.title) return null;
  const venue = Array.isArray(row.venue) ? row.venue[0] : row.venue; // TEC API: object, array, or absent
  return {
    id: String(id),
    doc: {
      id: String(id),
      title: stripHtml(row.title),
      text: stripHtml(row.description).slice(0, 5000),
      url: row.url ?? null,
      start_date: row.start_date ?? null,
      end_date: row.end_date ?? null,
      all_day: Boolean(row.all_day),
      venue: venue?.venue ?? venue?.title ?? null,
      venue_address: venue?.address ?? null,
      categories: (Array.isArray(row.categories) ? row.categories : [])
        .map((c: Row) => c?.name ?? c?.slug)
        .filter(Boolean),
    },
  };
}

export const events: DatasetModule = {
  name: "events",
  indices: [
    {
      index: "events",
      settings: {
        searchableAttributes: ["title", "text", "venue"],
        filterableAttributes: ["categories", "start_date"],
        sortableAttributes: ["start_date"],
      },
      async *read(store) {
        yield* (await store.getJson("events/events.json")) as Row[];
      },
      transform: transformEvent,
    },
  ],
  tools: [
    {
      spec: {
        name: "find_events",
        description:
          "Search UBC Vancouver events (events.ubc.ca) by keyword and date range. The archive goes back years so you MUST filter by date for current events: use from_date and to_date (ISO format, e.g. 2026-08-01). Without a date range, the tool returns the most recent events (which may be years old). If you pass an empty query, the tool returns all events in the date range.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              query: { type: "string", description: "Optional keywords for title and description" },
              from_date: { type: "string", description: "Optional earliest start date, ISO e.g. 2026-08-01" },
              to_date: { type: "string", description: "Optional latest start date, ISO e.g. 2026-09-01" },
              category: { type: "string", description: 'Optional category filter, e.g. "Lectures & Talks"' },
              limit: { type: "number", description: "Max results (default 10)" },
            },
            required: [],
          },
        },
      },
      async execute(input, search) {
        const filters: string[] = [];
        if (input.from_date) filters.push(`start_date >= '${String(input.from_date)}'`);
        if (input.to_date) filters.push(`start_date <= '${String(input.to_date)}'`);
        if (input.category) filters.push(`categories = '${String(input.category)}'`);
        const res = await search.index("events").search(input.query ? String(input.query) : "", {
          filter: filters.length > 0 ? filters.join(" AND ") : undefined,
          limit: Math.min(Number(input.limit) || 10, 30),
          // upcoming-first when a window is given; otherwise newest-first (the archive is mostly past events)
          sort: [input.from_date ? "start_date:asc" : "start_date:desc"],
        });
        const hits = res.hits;
        if (hits.length === 0) throw new Error(`No events matched "${input.query ?? ""}"`);
        return {
          events: hits.map((h) => {
            const e = h as unknown as EventDoc;
            return { ...e, text: e.text.slice(0, 400) };
          }),
        };
      },
    },
  ],
};
