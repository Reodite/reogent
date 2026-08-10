import type { DatasetModule } from "../core/types";
import { stripHtml } from "./html";

export interface PageDoc {
  source: string;
  title: string;
  url: string;
  text: string;
  date: string | null;
}

// biome-ignore lint/suspicious/noExplicitAny: raw dataset rows
type Row = Record<string, any>;

export type TaggedPage = { source: string; shape: "drupal" | "wordpress" | "report"; row: Row };

const CAL_BASE = "https://vancouver.calendar.ubc.ca";
const MAX_TEXT = 20_000; // Elementor blobs get huge; the tool returns snippets, not bodies

/** WordPress-shaped collections: title/content nest under `.rendered`. */
const WP_SOURCES: [source: string, key: string][] = [
  ["admissions", "admissions/pages.json"],
  ["student-services", "campus-services/student_services_pages.json"],
  ["facilities", "campus-services/facilities_resources.json"],
  ["recreation", "campus-services/recreation_pages.json"],
  ["food", "campus-services/food_outlets.json"],
  ["news", "campus-services/news.json"],
];

export function transformPage(tagged: TaggedPage): { id: string; doc: PageDoc } | null {
  const { source, shape, row } = tagged;
  if (shape === "drupal") {
    if (!row.title || !row.id) return null;
    return {
      id: `${source}#${row.id}`,
      doc: {
        source,
        title: String(row.title),
        url: row.alias ? CAL_BASE + row.alias : CAL_BASE,
        text: stripHtml(row.body?.processed).slice(0, MAX_TEXT),
        date: row.changed != null ? String(row.changed) : null,
      },
    };
  }
  if (shape === "wordpress") {
    const title = stripHtml(row.title?.rendered);
    if (!title || !row.id) return null;
    const text = [stripHtml(row.excerpt?.rendered), stripHtml(row.content?.rendered)]
      .filter(Boolean)
      .join(" ")
      .slice(0, MAX_TEXT);
    return {
      id: `${source}#${row.id}`,
      doc: { source, title, url: String(row.link ?? ""), text, date: row.modified_gmt ?? row.date_gmt ?? null },
    };
  }
  // report: an index entry for a published PDF — searchable title, direct download URL
  if (!row.url) return null;
  return {
    id: `${source}#${row.url}`,
    doc: {
      source,
      title: String(row.page_title || row.filename),
      url: String(row.url),
      text: [row.filename, row.page_title, row.site].filter(Boolean).join(" "),
      date: row.page_modified ?? null,
    },
  };
}

export const pages: DatasetModule = {
  name: "pages",
  indices: [
    {
      index: "pages",
      settings: {
        searchableAttributes: ["title", "text"],
        filterableAttributes: ["source"],
      },
      async *read(store) {
        for (const row of (await store.getJson("academic-calendar/vancouver/pages.json")) as Row[]) {
          yield { source: "calendar", shape: "drupal", row } satisfies TaggedPage;
        }
        for (const [source, key] of WP_SOURCES) {
          for (const row of (await store.getJson(key)) as Row[]) {
            yield { source, shape: "wordpress", row } satisfies TaggedPage;
          }
        }
        for (const row of (await store.getJson("reports/documents.json")) as Row[]) {
          yield { source: "reports", shape: "report", row } satisfies TaggedPage;
        }
      },
      transform: transformPage,
    },
  ],
  tools: [
    {
      spec: {
        name: "search_ubc_pages",
        description:
          "Full-text search across official UBC Vancouver web pages: academic calendar (policies, regulations, degree requirements), admissions/you.ubc.ca (costs, financial assistance, how to apply), student services, campus facilities, recreation, food outlets, news, and published reports. Returns page titles, URLs, and matching text snippets — cite the URL in answers.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              query: { type: "string", description: "Keywords to search page titles and text for" },
              source: {
                type: "string",
                description:
                  'Optional source filter: "calendar", "admissions", "student-services", "facilities", "recreation", "food", "news", or "reports"',
              },
              limit: { type: "number", description: "Max results (default 5)" },
            },
            required: ["query"],
          },
        },
      },
      async execute(input, search) {
        const filter = input.source ? `source = '${String(input.source)}'` : undefined;
        const res = await search.index("pages").search(String(input.query), {
          filter,
          limit: Math.min(Number(input.limit) || 5, 20),
          attributesToHighlight: ["text"],
        });
        const hits = res.hits;
        if (hits.length === 0) throw new Error(`No UBC pages matched "${input.query}"`);
        return {
          pages: hits.map((h) => {
            const doc = h as unknown as PageDoc & { _formatted?: { text?: string } };
            const snippets = doc._formatted?.text ? [doc._formatted.text.slice(0, 750)] : [];
            return { source: doc.source, title: doc.title, url: doc.url, date: doc.date, snippets };
          }),
        };
      },
    },
  ],
};
