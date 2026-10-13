import { canonicalSourceUrl } from "@/src/shared/citations/url";
import type { FederatedMultiSearchParams, Hit } from "meilisearch";
import type { DatasetModule } from "../core/types";
import type { DocumentDoc, DocumentSummary } from "./documents";
import { stripHtml } from "./html";

export interface PageDoc {
  source: string;
  title: string;
  url: string;
  text: string;
  date: string | null;
  source_record?: { path: string; id: string };
}

/** Source metadata and query-centered excerpts from either search index. */
export type PageResult = Omit<PageDoc, "text"> & Partial<DocumentSummary> & { snippets: string[] };

const SOURCE_TOPICS = new Map([
  ["calendar", "academic-calendar"],
  ["facilities", "campus-facilities"],
]);
const SUMMARY_FIELDS = [
  "original_id",
  "category",
  "subcategory",
  "format",
  "source_id",
  "upstream_id",
  "title",
  "content_sha256",
  "source_url",
  "api_url",
  "campus",
  "audience",
  "source_modified_at",
  "retrieved_at",
  "source_records",
  "warnings",
  "hostname",
  "document_category",
  "alternate_urls",
] satisfies (keyof DocumentSummary)[];

function snippets(formatted: string | Record<string, string> | undefined): string[] {
  if (!formatted) return [];
  const sections = typeof formatted === "string" ? [formatted] : Object.values(formatted);
  const excerpt = sections.find((section) => section.includes("<mark>")) ?? sections[0];
  if (!excerpt) return [];
  const start = excerpt.length > 750 ? Math.max(0, excerpt.indexOf("<mark>") - 250) : 0;
  return [excerpt.slice(start, start + 750)];
}

/** Removes canonical duplicates and legacy provenance mirrors without reordering independent hits. */
export function deduplicatePages(hits: PageResult[]): PageResult[] {
  const documents = hits.filter((hit) => hit.original_id);
  const documentUrls = new Set(documents.map((doc) => canonicalSourceUrl(doc.source_url)).filter(Boolean));
  const seen = new Set<string>();
  return hits.filter((hit) => {
    const url = canonicalSourceUrl(hit.url);
    if (!hit.original_id) {
      if (url && documentUrls.has(url)) return false;
      if (
        hit.source_record &&
        documents.some((doc) => {
          if (doc.hostname) return false;
          const documentUrl = canonicalSourceUrl(doc.source_url);
          // A shared record may expose multiple query-selected views.
          if (url && documentUrl && new URL(url).search !== new URL(documentUrl).search) return false;
          return doc.source_records?.some(
            (ref) => ref.path === hit.source_record?.path && ref.id !== null && String(ref.id) === hit.source_record.id,
          );
        })
      )
        return false;
    }
    const identity = hit.hostname ? hit.source_url : url;
    if (identity && seen.has(identity)) return false;
    if (identity) seen.add(identity);
    return true;
  });
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
          "Search all indexed document topics, official UBC hosts and legacy pages together, ranked by relevance. No audience, date, category or host restriction applies by default. Returns metadata and short matching excerpts, not full documents. After finding a relevant document, call get_document with its complete original_id before answering. Snippets select documents; they do not replace reading their conditions. Use hostname when the user explicitly names a website; otherwise start without filters. Use next_offset for more results and relax filters or rephrase before reporting missing evidence. Use dedicated structured tools such as get_costs for facts they provide. Cite returned source URLs.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description:
                  "Two to five distinctive topic keywords, such as co-op employers or unofficial transcript. This is indexed keyword search, not a web search engine. Omit generic question wording, UBC, central, URLs and hostnames. Do not use site: operators; use hostname for an explicitly named site. Shorten an irrelevant query before declaring missing evidence. With hostname, query may be empty to browse that site's indexed documents.",
              },
              source: {
                type: "string",
                description:
                  'Optional source filter: "calendar", "admissions", "student-services", "facilities", "recreation", "food", "news", or "reports"',
              },
              subcategory: {
                type: "string",
                description:
                  "Optional document topic or host document category, preferably copied from a result. Examples: workday, academic-calendar, support, academics. Use only one of source, subcategory or hostname.",
              },
              hostname: {
                type: "string",
                description:
                  "Exact official hostname explicitly supplied by the user or copied from a result. Put a named website here, not in query. Searches that host's documents only. Omit when no specific website is requested.",
              },
              limit: { type: "integer", minimum: 1, description: "Max results (default 5, capped at 20)" },
              offset: {
                type: "integer",
                minimum: 0,
                description: "Global result offset (default 0); use next_offset from the previous response",
              },
            },
            required: ["query"],
          },
        },
      },
      async execute(input, search) {
        if (typeof input.query !== "string" || (!input.query.trim() && typeof input.hostname !== "string"))
          throw new Error("Page search requires keywords, or an empty query with hostname to browse a source");
        for (const key of ["source", "subcategory", "hostname"] as const) {
          if (input[key] !== undefined && (typeof input[key] !== "string" || !input[key].trim()))
            throw new Error(`${key} must be a nonempty string`);
        }
        if ([input.source, input.subcategory, input.hostname].filter((value) => value !== undefined).length > 1)
          throw new Error("Choose only one of source, subcategory or hostname");
        const requested = input.limit === undefined ? 5 : input.limit;
        if (typeof requested !== "number" || !Number.isSafeInteger(requested) || requested < 1)
          throw new Error("limit must be a positive safe integer");
        const limit = Math.min(requested, 20);
        const offset = input.offset === undefined ? 0 : input.offset;
        if (
          typeof offset !== "number" ||
          !Number.isSafeInteger(offset) ||
          offset < 0 ||
          !Number.isSafeInteger(offset + limit)
        )
          throw new Error("offset and offset + limit must be nonnegative safe integers");
        const query = input.query.trim();
        const source = (input.source as string | undefined)?.trim();
        const subcategory = (input.subcategory as string | undefined)?.trim();
        const hostname = (input.hostname as string | undefined)?.trim();
        const topic = subcategory ?? (source ? (SOURCE_TOPICS.get(source) ?? source) : undefined);
        const legacySource = subcategory
          ? ["calendar", ...WP_SOURCES.map(([name]) => name), "reports"].find(
              (name) => (SOURCE_TOPICS.get(name) ?? name) === subcategory,
            )
          : source;
        const documentFilter = hostname
          ? `hostname = ${JSON.stringify(hostname)}`
          : topic
            ? `subcategory = ${JSON.stringify(topic)}`
            : undefined;
        const request: FederatedMultiSearchParams = {
          federation: { limit, offset },
          queries: [
            {
              indexUid: "documents",
              q: query,
              ...(documentFilter ? { filter: documentFilter } : {}),
              attributesToRetrieve: SUMMARY_FIELDS,
              attributesToCrop: ["search_sections"],
              attributesToHighlight: ["search_sections"],
              cropLength: 50,
              highlightPreTag: "<mark>",
              highlightPostTag: "</mark>",
            },
          ],
        };
        if (!hostname && (!subcategory || legacySource))
          request.queries.push({
            indexUid: "pages",
            q: query,
            ...(legacySource ? { filter: `source = ${JSON.stringify(legacySource)}` } : {}),
            attributesToRetrieve: ["source", "title", "url", "date", "source_record"],
            attributesToCrop: ["text"],
            attributesToHighlight: ["text"],
            cropLength: 50,
            highlightPreTag: "<mark>",
            highlightPostTag: "</mark>",
          });
        let result = await search.multiSearch<FederatedMultiSearchParams, DocumentDoc | PageDoc>(request);
        let effectiveQuery = query;
        if (hostname && query && offset === 0 && result.hits.length === 0) {
          effectiveQuery = "";
          result = await search.multiSearch<FederatedMultiSearchParams, DocumentDoc | PageDoc>({
            ...request,
            queries: [{ ...request.queries[0], q: "" }],
          });
        }
        const hits = result.hits.map((hit): PageResult => {
          if ("original_id" in hit) {
            const doc = hit as Hit<DocumentDoc & { search_sections: Record<string, string> }>;
            const metadata: Partial<DocumentSummary> = Object.fromEntries(
              SUMMARY_FIELDS.map((field) => [field, doc[field]]),
            );
            return {
              ...metadata,
              title: doc.title,
              source: doc.source_id,
              url: doc.source_url,
              date: doc.source_modified_at,
              snippets: snippets(doc._formatted?.search_sections),
            };
          }
          const doc = hit as Hit<PageDoc>;
          return {
            source: doc.source,
            title: doc.title,
            url: doc.url,
            date: doc.date,
            ...(doc.source_record ? { source_record: doc.source_record } : {}),
            snippets: snippets(doc._formatted?.text),
          };
        });
        return {
          pages: deduplicatePages(hits),
          query: effectiveQuery,
          match_type: effectiveQuery ? "keyword" : "hostname_inventory",
          search_note:
            effectiveQuery !== query
              ? result.hits.length
                ? "No keyword matches. These are indexed documents from the requested hostname, not keyword matches. Read relevant articles before claiming the source lacks information. Continue browsing with query set to the returned empty string and next_offset."
                : "No indexed documents found for this exact hostname. This does not establish whether its live website has the information."
              : undefined,
          next_step:
            "For a relevant hit with original_id, call get_document(article_id: original_id) before answering from that document. These excerpts can omit conditions. If hits are irrelevant, use fewer topic keywords or the user's explicit hostname; do not infer that its documents are absent.",
          corpus: request.queries.map(({ indexUid, filter }) => ({ index: indexUid, filter: filter ?? null })),
          pagination: {
            offset,
            limit,
            raw_count: result.hits.length,
            next_offset: result.hits.length === limit ? offset + result.hits.length : null,
          },
          coverage:
            "Search covers the indexed corpus and filters above, not all UBC knowledge. Results are a relevance-ranked page. next_offset advances past raw hits before deduplication; a null offset does not prove a topic is absent. Relax filters or rephrase to check missing evidence.",
        };
      },
    },
  ],
};
