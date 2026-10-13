import type { SearchClient } from "@/src/server/core/types";
import { canonicalSourceUrl } from "@/src/shared/citations/url";
import { describe, expect, it, vi } from "vitest";
import { deduplicatePages, pages, transformPage, type PageResult } from "./pages";

const article = {
  original_id: "prose:academic-calendar:7",
  category: "documents",
  subcategory: "academic-calendar",
  source_id: "calendar",
  title: "Example policy",
  source_url: "https://vancouver.calendar.ubc.ca/policy",
  source_modified_at: "2026-08-01T12:00:00Z",
  retrieved_at: "2026-09-01T12:00:00Z",
  content_sha256: "a".repeat(64),
  source_records: [{ path: "academic-calendar/vancouver/pages.json", id: "7" }],
  warnings: ["Preserve the source's conditions"],
  links: [{ text: "Full article navigation", url: "https://example.ubc.ca/deep-link" }],
  content_markdown: "Full body must not leave search",
  _formatted: { search_sections: { part_0: "…The <mark>policy</mark> applies to the stated period…" } },
};
const legacy = {
  title: "Legacy policy",
  url: "https://you.ubc.ca/legacy-policy",
  source: "admissions",
  date: null,
  text: "Full legacy body must not leave search",
  _formatted: { text: "…Read the <mark>policy</mark> before applying…" },
};

function fixture(hits: unknown[] = [article, legacy]) {
  const multiSearch = vi.fn().mockResolvedValue({ hits });
  const index = vi.fn();
  return { multiSearch, index, client: { multiSearch, index } as unknown as SearchClient };
}

type Result = {
  pages: PageResult[];
  corpus: { index: string; filter: string | null }[];
  pagination: { offset: number; limit: number; raw_count: number; next_offset: number | null };
  coverage: string;
  next_step: string;
  query: string;
  match_type: string;
  search_note?: string;
};
const tool = pages.tools[0];

describe("federated page search", () => {
  it("searches all topics, hosts and legacy sources in one globally ranked request", async () => {
    const host = {
      ...article,
      original_id: `documents:official-web:${"b".repeat(24)}`,
      subcategory: "news",
      source_id: "news.ubc.ca",
      hostname: "news.ubc.ca",
      document_category: "news",
      audience: "faculty",
      source_url: "https://news.ubc.ca/2018/policy",
      source_modified_at: "2018-01-01",
      alternate_urls: ["https://news.ubc.ca/?p=12"],
    };
    const f = fixture([legacy, host, article]);
    const result = (await tool.execute({ query: " policy " }, f.client)) as Result;
    expect(f.index).not.toHaveBeenCalled();
    expect(f.multiSearch).toHaveBeenCalledTimes(1);
    const request = f.multiSearch.mock.calls[0][0];
    expect(request.federation).toEqual({ limit: 5, offset: 0 });
    expect(request.queries.map((query: { indexUid: string }) => query.indexUid)).toEqual(["documents", "pages"]);
    for (const query of request.queries) {
      expect(query.q).toBe("policy");
      expect(query).not.toHaveProperty("filter");
      expect(query).not.toHaveProperty("limit");
      expect(query).not.toHaveProperty("offset");
      expect(query).not.toHaveProperty("federationOptions");
    }
    expect(result.pages.map((page) => page.url)).toEqual([legacy.url, host.source_url, article.source_url]);
    expect(result.pages[1]).toMatchObject({
      hostname: "news.ubc.ca",
      audience: "faculty",
      source_modified_at: "2018-01-01",
      alternate_urls: host.alternate_urls,
    });
    expect(result.corpus).toEqual([
      { index: "documents", filter: null },
      { index: "pages", filter: null },
    ]);
  });

  it("requests explicit metadata and server-cropped matches without transferring bodies", async () => {
    const f = fixture();
    const result = (await tool.execute({ query: "policy" }, f.client)) as Result;
    const [documentQuery, pageQuery] = f.multiSearch.mock.calls[0][0].queries;
    expect(documentQuery.attributesToRetrieve).toEqual(
      expect.arrayContaining([
        "original_id",
        "source_url",
        "source_modified_at",
        "retrieved_at",
        "source_records",
        "warnings",
        "content_sha256",
        "hostname",
      ]),
    );
    expect(documentQuery.attributesToRetrieve).not.toContain("content_markdown");
    expect(documentQuery.attributesToRetrieve).not.toContain("links");
    expect(result.pages[0]).not.toHaveProperty("links");
    expect(documentQuery.attributesToRetrieve).not.toContain("*");
    expect(pageQuery.attributesToRetrieve).not.toContain("text");
    expect(documentQuery).toMatchObject({
      attributesToCrop: ["search_sections"],
      attributesToHighlight: ["search_sections"],
      cropLength: 50,
    });
    expect(pageQuery).toMatchObject({ attributesToCrop: ["text"], cropLength: 50 });
    expect(result.pages[0]).toMatchObject({
      original_id: article.original_id,
      content_sha256: article.content_sha256,
      snippets: [article._formatted.search_sections.part_0],
      source_records: article.source_records,
      warnings: article.warnings,
    });
    expect(JSON.stringify(result)).not.toContain("Full body");
    expect(JSON.stringify(result)).not.toContain("Full legacy body");
    expect(JSON.stringify(result)).not.toContain("_formatted");
    expect(result.next_step).toContain("call get_document(article_id: original_id) before answering");
    expect(result.next_step).toContain("use fewer topic keywords or the user's explicit hostname");
  });

  it("keeps matching text inside the bound even when a cropped excerpt starts with a long token", async () => {
    const f = fixture([
      {
        ...article,
        _formatted: { search_sections: { part_0: `${"x".repeat(1000)} <mark>policy</mark> ${"y".repeat(1000)}` } },
      },
    ]);
    const result = (await tool.execute({ query: "policy" }, f.client)) as Result;
    expect(result.pages[0].snippets[0]).toHaveLength(750);
    expect(result.pages[0].snippets[0]).toContain("<mark>policy</mark>");
  });

  it("returns a match beyond the first searchable section", async () => {
    const f = fixture([
      {
        ...article,
        _formatted: {
          search_sections: {
            part_0: "The start of a long article does not contain the answer.",
            part_18: "…The <mark>policy</mark> near the end applies…",
          },
        },
      },
    ]);
    const result = (await tool.execute({ query: "policy" }, f.client)) as Result;
    expect(result.pages[0].snippets).toEqual(["…The <mark>policy</mark> near the end applies…"]);
  });

  it.each([
    ["calendar", "academic-calendar"],
    ["facilities", "campus-facilities"],
    ["student-services", "student-services"],
    ["__proto__", "__proto__"],
    ["constructor", "constructor"],
  ])("preserves source alias %s across both indices", async (source, topic) => {
    const f = fixture();
    await tool.execute({ query: "policy", source }, f.client);
    expect(f.multiSearch.mock.calls[0][0].queries.map((query: { filter: string }) => query.filter)).toEqual([
      `subcategory = ${JSON.stringify(topic)}`,
      `source = ${JSON.stringify(source)}`,
    ]);
  });

  it("maps a legacy-compatible topic back to its source", async () => {
    const f = fixture();
    await tool.execute({ query: "policy", subcategory: "academic-calendar" }, f.client);
    expect(f.multiSearch.mock.calls[0][0].queries[1].filter).toBe('source = "calendar"');
  });

  it.each(["source", "subcategory", "hostname"])("escapes the optional %s filter", async (key) => {
    const f = fixture();
    const value = 'a\\b" OR hostname = "news.ubc.ca';
    await tool.execute({ query: "policy", [key]: value }, f.client);
    const queries = f.multiSearch.mock.calls[0][0].queries;
    expect(queries[0].filter).toBe(`${key === "hostname" ? "hostname" : "subcategory"} = ${JSON.stringify(value)}`);
    if (key === "source") expect(queries[1].filter).toBe(`source = ${JSON.stringify(value)}`);
    else expect(queries).toHaveLength(1);
  });

  it("paginates using raw federation count rather than the deduplicated count", async () => {
    const f = fixture([article, { ...legacy, url: article.source_url }]);
    const first = (await tool.execute({ query: "policy", limit: 2 }, f.client)) as Result;
    expect(first.pages).toHaveLength(1);
    expect(first.pagination).toEqual({ offset: 0, limit: 2, raw_count: 2, next_offset: 2 });
    f.multiSearch.mockResolvedValueOnce({ hits: [legacy] });
    const second = (await tool.execute(
      { query: "policy", limit: 2, offset: first.pagination.next_offset },
      f.client,
    )) as Result;
    expect(f.multiSearch.mock.calls[1][0].federation).toEqual({ limit: 2, offset: 2 });
    expect(second.pages[0].url).toBe(legacy.url);
    expect(second.pagination).toEqual({ offset: 2, limit: 2, raw_count: 1, next_offset: null });
    expect(second.coverage).toContain("does not prove a topic is absent");
  });

  it("caps the global limit at twenty", async () => {
    const f = fixture();
    await tool.execute({ query: "policy", limit: 50 }, f.client);
    expect(f.multiSearch.mock.calls[0][0].federation.limit).toBe(20);
  });

  it.each([
    {},
    { query: "" },
    { query: "  " },
    { query: 1 },
    { query: "policy", source: [] },
    { query: "policy", source: "" },
    { query: "policy", subcategory: null },
    { query: "policy", hostname: 5 },
    { query: "policy", source: "calendar", subcategory: "academic-calendar" },
    { query: "policy", hostname: "it.ubc.ca", source: "calendar" },
    { query: "policy", hostname: "it.ubc.ca", subcategory: "support" },
    ...[0, -1, 1.5, "5", null, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1].map((limit) => ({ query: "policy", limit })),
    ...[-1, 1.5, "0", null, Infinity, NaN, Number.MAX_SAFE_INTEGER].map((offset) => ({ query: "policy", offset })),
  ])("rejects invalid input before searching: %j", async (input) => {
    const f = fixture();
    await expect(tool.execute(input, f.client)).rejects.toThrow();
    expect(f.multiSearch).not.toHaveBeenCalled();
    expect(f.index).not.toHaveBeenCalled();
  });

  it("returns search scope and pagination on an empty result without asserting absence", async () => {
    const f = fixture([]);
    const result = (await tool.execute({ query: "policy", hostname: "it.ubc.ca" }, f.client)) as Result;
    expect(result.pages).toEqual([]);
    expect(result.corpus).toEqual([{ index: "documents", filter: 'hostname = "it.ubc.ca"' }]);
    expect(result.pagination.next_offset).toBeNull();
    expect(result.coverage).toContain("Relax filters or rephrase");
  });

  it("distinguishes a hostname keyword miss from an unindexed source", async () => {
    const f = fixture();
    f.multiSearch
      .mockResolvedValueOnce({ hits: [] })
      .mockResolvedValueOnce({ hits: [{ ...article, hostname: "example.ubc.ca" }] });
    const result = (await tool.execute({ query: "missing procedure", hostname: "example.ubc.ca" }, f.client)) as Result;
    expect(f.multiSearch).toHaveBeenCalledTimes(2);
    expect(f.multiSearch.mock.calls[0][0].queries[0].q).toBe("missing procedure");
    expect(f.multiSearch.mock.calls[1][0].queries).toEqual([
      expect.objectContaining({ q: "", filter: 'hostname = "example.ubc.ca"', indexUid: "documents" }),
    ]);
    expect(result.pages[0].original_id).toBe(article.original_id);
    expect(result.query).toBe("");
    expect(result.match_type).toBe("hostname_inventory");
    expect(result.search_note).toContain("not keyword matches");
  });

  it("paginates an explicitly requested host inventory without broadening its scope", async () => {
    const f = fixture([article]);
    const result = (await tool.execute({ query: "", hostname: "example.ubc.ca", offset: 5 }, f.client)) as Result;
    expect(f.multiSearch).toHaveBeenCalledTimes(1);
    expect(f.multiSearch.mock.calls[0][0]).toMatchObject({
      federation: { offset: 5 },
      queries: [expect.objectContaining({ q: "", filter: 'hostname = "example.ubc.ca"' })],
    });
    expect(result.match_type).toBe("hostname_inventory");
  });

  it("does not substitute a host inventory at the end of keyword pagination", async () => {
    const f = fixture([]);
    await tool.execute({ query: "policy", hostname: "example.ubc.ca", offset: 20 }, f.client);
    expect(f.multiSearch).toHaveBeenCalledTimes(1);
  });

  it("propagates a missing documents index instead of falling back to legacy results", async () => {
    const f = fixture();
    f.multiSearch.mockRejectedValue(new Error("Index documents not found"));
    await expect(tool.execute({ query: "policy" }, f.client)).rejects.toThrow("Index documents not found");
    expect(f.index).not.toHaveBeenCalled();
    expect(f.multiSearch).toHaveBeenCalledTimes(1);
  });
});

describe("page identity and provenance", () => {
  const normalized: PageResult = {
    ...article,
    category: "documents",
    url: article.source_url,
    source: "calendar",
    date: null,
    snippets: [],
  };
  const old: PageResult = { ...legacy, snippets: [] };

  it("removes legacy canonical and source-record mirrors while retaining relevance order", () => {
    const mirror = {
      ...old,
      source_record: { path: "academic-calendar/vancouver/pages.json", id: "7" },
      url: "https://vancouver.calendar.ubc.ca/node/7",
    };
    const duplicate = { ...old, url: `${article.source_url}/#requirements` };
    expect(deduplicatePages([old, mirror, normalized, duplicate])).toEqual([old, normalized]);
    expect(deduplicatePages([mirror, old, normalized])).toEqual([old, normalized]);
  });

  it("preserves distinct physical official-host URLs, dates and query-selected views", () => {
    const host = {
      ...normalized,
      hostname: "news.ubc.ca",
      url: "https://news.ubc.ca/2024/policy",
      source_url: "https://news.ubc.ca/2024/policy",
    };
    const later = {
      ...host,
      original_id: "documents:official-web:later",
      url: "https://news.ubc.ca/2025/policy",
      source_url: "https://news.ubc.ca/2025/policy",
      date: "2025-01-01",
    };
    const queryA = {
      ...host,
      url: "https://news.ubc.ca/policy?view=undergraduate",
      source_url: "https://news.ubc.ca/policy?view=undergraduate",
    };
    const queryB = {
      ...queryA,
      url: "https://news.ubc.ca/policy?view=graduate",
      source_url: "https://news.ubc.ca/policy?view=graduate",
    };
    const legacyView = {
      ...old,
      source_record: { path: "academic-calendar/vancouver/pages.json", id: "7" },
      url: `${article.source_url}?view=graduate`,
    };
    const slashVariant = { ...host, url: `${host.url}/`, source_url: `${host.source_url}/` };
    const hits = [host, later, queryA, queryB, legacyView, slashVariant];
    expect(deduplicatePages(hits)).toEqual(hits);
    expect(canonicalSourceUrl(queryA.url)).not.toBe(canonicalSourceUrl(queryB.url));
  });

  it("normalizes equivalent query ordering without discarding query values", () => {
    expect(canonicalSourceUrl("https://EXAMPLE.test/policy/?b=2&a=1#steps")).toBe(
      "https://example.test/policy?a=1&b=2",
    );
    expect(canonicalSourceUrl("javascript:alert(1)")).toBeUndefined();
  });

  it("keeps Drupal and WordPress source-record paths for mirror detection", () => {
    expect(
      transformPage({ source: "calendar", shape: "drupal", row: { id: 7, title: "Policy" } })?.doc.source_record,
    ).toEqual({ path: "academic-calendar/vancouver/pages.json", id: "7" });
    expect(
      transformPage({ source: "student-services", shape: "wordpress", row: { id: 8, title: { rendered: "Policy" } } })
        ?.doc.source_record,
    ).toEqual({ path: "campus-services/student_services_pages.json", id: "8" });
  });
});
