import type { DatasetModule } from "../core/types";
import { liveJson } from "../live";
import { stripHtml } from "./html";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
  const id = row.id ?? row.global_id;
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

const BASE = "https://events.ubc.ca/wp-json/tribe/events/v1";
const EVENTS_TTL_MS = 5 * 60_000;
const CATEGORIES_TTL_MS = 24 * 60 * 60_000;
/** The Events Calendar REST API caps `per_page` at 50. */
const PAGE_SIZE = 50;
/** Upper bound on pages fetched for one date range. */
const MAX_PAGES = 20;

interface EventPage {
  events: EventDoc[];
  totalPages: number;
}

function docs(rows: unknown): EventDoc[] {
  return (Array.isArray(rows) ? (rows as Row[]) : []).flatMap((row) => transformEvent(row)?.doc ?? []);
}

async function eventPage(params: Record<string, string>): Promise<EventPage> {
  const body = (await liveJson(`${BASE}/events?${new URLSearchParams(params)}`, EVENTS_TTL_MS)) as Row;
  return { events: docs(body.events), totalPages: Number(body.total_pages) || 1 };
}

// Category names mix hyphens and en dashes ("Type – Lecture"); compare them dash- and case-insensitively.
const normalizeCategory = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s*[-–—]\s*/g, " - ");

/**
 * Maps a category to its slug. Accepts the slug, the full name, or the last
 * segment of the name ("Lecture" for "Type – Lecture") when only one category
 * ends with it. Throws listing the known names when none match.
 */
export async function categorySlug(category: string): Promise<string> {
  const body = (await liveJson(`${BASE}/categories?per_page=100`, CATEGORIES_TTL_MS)) as Row;
  const categories = (Array.isArray(body.categories) ? body.categories : []) as { name: string; slug: string }[];
  const wanted = normalizeCategory(category);
  const suffixed = categories.filter((c) => normalizeCategory(c.name).endsWith(` - ${wanted}`));
  const match =
    categories.find((c) => c.slug === category.trim().toLowerCase() || normalizeCategory(c.name) === wanted) ??
    (suffixed.length === 1 ? suffixed[0] : undefined);
  if (!match)
    throw new Error(`Unknown event category "${category}". Known: ${categories.map((c) => c.name).join("; ")}`);
  return match.slug;
}

/**
 * Lists events from events.ubc.ca that start in [from, to) (ISO dates), read
 * live and cached for a few minutes. Stops after a fixed page budget, so very
 * long ranges come back truncated.
 */
export async function eventsBetween(from: string, to: string): Promise<EventDoc[]> {
  const params = { start_date: from, end_date: `${to} 00:00:00`, per_page: String(PAGE_SIZE) };
  const first = await eventPage({ ...params, page: "1" });
  const rest = await Promise.all(
    Array.from({ length: Math.min(first.totalPages, MAX_PAGES) - 1 }, (_, i) =>
      eventPage({ ...params, page: String(i + 2) }),
    ),
  );
  return [first, ...rest].flatMap((page) => page.events);
}

/** Fetches one event by its numeric id, or the id with any prefix such as "events.ubc.ca?id=". Null when it does not resolve. */
export async function getEvent(id: string): Promise<EventDoc | null> {
  const numeric = id.match(/(\d+)$/)?.[1];
  if (!numeric) return null;
  try {
    return transformEvent((await liveJson(`${BASE}/events/${numeric}`, EVENTS_TTL_MS)) as Row)?.doc ?? null;
  } catch {
    return null;
  }
}

export const events: DatasetModule = {
  name: "events",
  indices: [],
  tools: [
    {
      spec: {
        name: "find_events",
        description:
          "Search UBC events (events.ubc.ca, read live) by keyword, date range, and category. Without from_date, results start from now. Pass from_date for past events.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              query: { type: "string", description: "Optional keywords for title and description" },
              from_date: { type: "string", description: "Optional earliest start date, ISO e.g. 2026-08-01" },
              to_date: { type: "string", description: "Optional latest start date, inclusive, ISO e.g. 2026-09-01" },
              category: {
                type: "string",
                description: 'Optional category name, slug, or last name segment, e.g. "Type – Lecture" or "Lecture"',
              },
              limit: { type: "number", description: "Max results (default 10, max 30)" },
            },
            required: [],
          },
        },
      },
      async execute(input) {
        const params: Record<string, string> = {
          per_page: String(Math.min(Math.max(Number(input.limit) || 10, 1), 30)),
        };
        for (const [key, name] of [
          ["from_date", "start_date"],
          ["to_date", "end_date"],
        ] as const) {
          if (input[key] === undefined) continue;
          const date = String(input[key]);
          if (!ISO_DATE.test(date)) throw new Error(`${key} must be YYYY-MM-DD`);
          params[name] = key === "to_date" ? `${date} 23:59:59` : date;
        }
        if (input.query) params.search = String(input.query);
        if (input.category) params.categories = await categorySlug(String(input.category));
        const { events: hits } = await eventPage(params);
        if (hits.length === 0) throw new Error(`No events matched "${input.query ?? ""}"`);
        return { events: hits.map((e) => ({ ...e, text: e.text.slice(0, 400) })) };
      },
    },
  ],
};
