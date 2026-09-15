import { canonicalSourceUrl } from "@/src/shared/citations/url";
import type { DatasetModule } from "../core/types";
import { searchDocuments, type DocumentSummary } from "./documents";
import { stripHtml } from "./html";

export interface PageDoc {
  source: string;
  title: string;
  url: string;
  text: string;
  date: string | null;
  source_record?: { path: string; id: string };
}

/** Searchable source metadata and bounded legacy excerpts. */
export type PageResult = Pick<PageDoc, "source" | "title" | "url" | "date" | "source_record"> &
  Partial<DocumentSummary> & { snippets: string[] };

const SOURCE_TOPICS: Record<string, string> = { calendar: "academic-calendar", facilities: "campus-facilities" };

/** Prefers normalized articles over matching legacy pages, retaining independent source articles. */
export function mergePageResults(legacy: PageResult[], normalized: PageResult[], limit: number): PageResult[] {
  const result: PageResult[] = [];
  const urls = new Set<string>();
  const references = new Set<string>();
  const referenceKey = (ref: { path: string; id: string | number }) => `${ref.path}\u0000${ref.id}`;
  for (const page of normalized) {
    const url = canonicalSourceUrl(page.url);
    for (const ref of page.source_records ?? []) {
      if (ref.id !== null) references.add(referenceKey({ path: ref.path, id: ref.id }));
    }
    if (url && urls.has(url)) continue;
    if (url) urls.add(url);
    result.push(page);
  }
  for (const page of legacy) {
    const url = canonicalSourceUrl(page.url);
    if ((url && urls.has(url)) || (page.source_record && references.has(referenceKey(page.source_record)))) continue;
    if (url) urls.add(url);
    result.push(page);
  }
  return result.slice(0, limit);
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
        source_record: { path: "academic-calendar/vancouver/pages.json", id: String(row.id) },
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
    const sourcePath = WP_SOURCES.find(([name]) => name === source)?.[1];
    return {
      id: `${source}#${row.id}`,
      doc: {
        source,
        title,
        url: String(row.link ?? ""),
        text,
        date: row.modified_gmt ?? row.date_gmt ?? null,
        source_record: sourcePath ? { path: sourcePath, id: String(row.id) } : undefined,
      },
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
          "Search official UBC Vancouver pages and Markdown documents, including IT service login/access instructions, Workday procedures, calendar policies, admissions, housing, faculty advising and undergraduate co-op. Use subcategory it-services for IT instructions and science-coop for Science Co-op program guidance. Document results include original_id, category and subcategory; use get_document to read complete steps and discipline-specific conditions. Legacy pages return bounded excerpts. Use get_costs for structured money questions and cite source URLs.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description:
                  'Short keywords for page titles and text. Search a provided page title first. Start with the specific discipline, service or program name otherwise, e.g. "Computer Science" for its co-op requirements. With subcategory set, omit generic UBC/Science Co-op prefixes.',
              },
              source: {
                type: "string",
                description:
                  'Optional source filter: "calendar", "admissions", "student-services", "facilities", "recreation", "food", "news", or "reports"',
              },
              subcategory: {
                type: "string",
                description:
                  "Optional document topic: it-services for Canvas/CWL/IT instructions, workday for Workday procedures, academic-calendar for calendar policies. Co-op topics: coop-programs (official directory/shared guidance), science-coop, arts-coop, engineering-coop, forestry-coop, sauder-undergraduate. Use the administering program's topic, not the faculty name alone. Advising topics include arts-advising, science-advising, lfs-advising (Land and Food Systems) and kinesiology-advising. Housing guidance uses student-housing. Use this or source.",
              },
              limit: { type: "number", description: "Max results (default 5, maximum 20)" },
            },
            required: ["query"],
          },
        },
      },
      async execute(input, search) {
        if (typeof input.query !== "string" || !input.query.trim()) throw new Error("Page search requires query");
        for (const key of ["source", "subcategory"] as const) {
          if (input[key] !== undefined && typeof input[key] !== "string") throw new Error(`${key} must be a string`);
        }
        const source = input.source as string | undefined;
        const subcategory = input.subcategory as string | undefined;
        if (source && subcategory) throw new Error("Choose source or subcategory, not both");
        const requested = input.limit ?? 5;
        if (typeof requested !== "number" || !Number.isSafeInteger(requested) || requested < 1)
          throw new Error("limit must be a positive integer");
        const limit = Math.min(requested, 20);
        const query = input.query.trim();
        const topic = subcategory || (source ? (SOURCE_TOPICS[source] ?? source) : undefined);
        const legacySource = subcategory
          ? ["calendar", ...WP_SOURCES.map(([name]) => name), "reports"].find(
              (name) => (SOURCE_TOPICS[name] ?? name) === subcategory,
            )
          : source;
        const [res, articles] = await Promise.all([
          subcategory && !legacySource
            ? Promise.resolve({ hits: [] })
            : search.index("pages").search(query, {
                filter: legacySource ? `source = ${JSON.stringify(legacySource)}` : undefined,
                limit,
                attributesToHighlight: ["text"],
              }),
          searchDocuments(query, topic, limit, search),
        ]);
        const legacy = res.hits.map((hit) => {
          const doc = hit as unknown as PageDoc & { _formatted?: { text?: string } };
          return {
            source: doc.source,
            title: doc.title,
            url: doc.url,
            date: doc.date,
            ...(doc.source_record ? { source_record: doc.source_record } : {}),
            snippets: doc._formatted?.text ? [doc._formatted.text.slice(0, 750)] : [],
          };
        });
        const normalized: PageResult[] = articles.map((article) => ({
          ...article,
          source: article.subcategory,
          url: article.source_url,
          date: article.source_modified_at,
          snippets: [],
        }));
        const results = mergePageResults(legacy, normalized, limit);
        if (results.length === 0) throw new Error(`No UBC pages matched "${query}"`);
        return { pages: results };
      },
    },
  ],
};
