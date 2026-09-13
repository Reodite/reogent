import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchClient } from "../core/types";
import { searchDocuments, type DocumentSummary } from "./documents";
import { mergePageResults, pages, transformPage, type PageResult } from "./pages";

vi.mock("./documents", () => ({ searchDocuments: vi.fn() }));
const legacy = (patch: Partial<PageResult> = {}): PageResult => ({
  source: "student-services",
  title: "Example guide",
  url: "https://example.test/guide/",
  date: null,
  snippets: ["Legacy excerpt"],
  ...patch,
});
const normalized = (patch: Partial<PageResult> = {}): PageResult =>
  legacy({
    category: "documents",
    subcategory: "student-services",
    original_id: "documents:student-services:1",
    format: "markdown",
    snippets: [],
    ...patch,
  });
beforeEach(() => {
  vi.mocked(searchDocuments).mockReset().mockResolvedValue([]);
});

describe("canonical page result merging", () => {
  it("prefers normalized Markdown for the same canonical page", () => {
    const replacement = normalized({ url: "https://EXAMPLE.test/guide#steps" });
    expect(
      mergePageResults([legacy(), legacy({ url: "https://example.test/other", title: "Other" })], [replacement], 5),
    ).toEqual([replacement, legacy({ url: "https://example.test/other", title: "Other" })]);
  });

  it("uses source-record joins for changed legacy URLs and preserves unrelated facts", () => {
    const old = legacy({
      url: "https://old.example.test/old",
      source_record: { path: "campus-services/student_services_pages.json", id: "14" },
    });
    const first = normalized({ source_records: [{ path: "campus-services/student_services_pages.json", id: 14 }] });
    const second = normalized({
      original_id: "documents:student-services:2",
      url: "https://example.test/second",
      source_records: first.source_records,
    });
    expect(mergePageResults([old], [first, second], 5)).toEqual([first, second]);
  });

  it("does not match by title or discard meaningful query parameters", () => {
    const first = normalized({ url: "https://example.test/page?topic=one" });
    const second = legacy({ url: "https://example.test/page?topic=two" });
    expect(mergePageResults([second], [first], 5)).toEqual([first, second]);
    expect(mergePageResults([second], [], 5)).toEqual([second]);
    expect(mergePageResults([second], [first], 1)).toEqual([first]);
  });

  it("preserves the source table identity while adapting legacy WordPress pages", () => {
    const result = transformPage({
      source: "student-services",
      shape: "wordpress",
      row: {
        id: 14,
        title: { rendered: "Example" },
        content: { rendered: "<p>Excerpt</p>" },
        link: "https://example.test/old",
      },
    });
    expect(result?.doc.source_record).toEqual({ path: "campus-services/student_services_pages.json", id: "14" });
  });
});

describe("page search compatibility", () => {
  const tool = pages.tools[0];
  it("retains source aliases and uses the same client for documents search", async () => {
    const search = vi.fn().mockResolvedValue({
      hits: [
        {
          source: "calendar",
          title: "Rules",
          url: "https://example.test/rules",
          date: null,
          _formatted: { text: "Excerpt" },
        },
      ],
    });
    const client = { index: () => ({ search }) } as unknown as SearchClient;
    const result = await tool.execute({ query: "rules", source: "calendar" }, client);
    expect(search).toHaveBeenCalledWith("rules", expect.objectContaining({ filter: 'source = "calendar"', limit: 5 }));
    expect(searchDocuments).toHaveBeenCalledWith("rules", "academic-calendar", 5, client);
    expect(result).toMatchObject({ pages: [{ title: "Rules", snippets: ["Excerpt"] }] });
  });

  it("returns one Documents category with topic and freshness metadata", async () => {
    const summary = {
      original_id: "documents:workday:1",
      category: "documents",
      subcategory: "workday",
      format: "markdown",
      title: "Example guide",
      source_url: "https://example.test/workday",
      source_modified_at: null,
      retrieved_at: "2026-09-01T12:00:00Z",
      source_records: [],
      warnings: [],
      links: [],
    } as unknown as DocumentSummary;
    vi.mocked(searchDocuments).mockResolvedValue([summary]);
    const search = vi.fn().mockResolvedValue({ hits: [] });
    const client = { index: () => ({ search }) } as unknown as SearchClient;
    expect(await tool.execute({ query: "registration", subcategory: "workday" }, client)).toMatchObject({
      pages: [{ ...summary, source: "workday", url: summary.source_url, snippets: [] }],
    });
    expect(search).not.toHaveBeenCalled();
    expect(searchDocuments).toHaveBeenCalledWith("registration", "workday", 5, client);
  });

  it("routes Science Co-op discovery through its indexed article topic", async () => {
    const summary = {
      original_id: "documents:science-coop:example-program",
      category: "documents",
      subcategory: "science-coop",
      title: "Example discipline co-op requirements",
      source_url: "https://example.test/coop/requirements",
      retrieved_at: "2026-09-01T12:00:00Z",
      source_records: [],
      warnings: [],
    } as unknown as DocumentSummary;
    vi.mocked(searchDocuments).mockResolvedValue([summary]);
    const index = vi.fn();
    const client = { index } as unknown as SearchClient;
    expect(
      await tool.execute({ query: "Example discipline requirements", subcategory: "science-coop" }, client),
    ).toMatchObject({ pages: [{ ...summary, source: "science-coop", snippets: [] }] });
    expect(searchDocuments).toHaveBeenCalledWith("Example discipline requirements", "science-coop", 5, client);
    expect(index).not.toHaveBeenCalled();
    expect(tool.spec.description).toContain("co-op");
    expect(JSON.stringify(tool.spec.inputSchema)).toContain("science-coop");
    expect(JSON.stringify(tool.spec.inputSchema)).toContain(
      "Start with the specific discipline, service or program name",
    );
    expect(JSON.stringify(tool.spec.inputSchema)).toContain("Computer Science");
    expect(JSON.stringify(tool.spec.inputSchema)).toContain("Search a provided page title first");
    for (const topic of ["coop-programs", "arts-coop", "engineering-coop", "forestry-coop", "sauder-undergraduate"]) {
      expect(JSON.stringify(tool.spec.inputSchema)).toContain(topic);
    }
  });

  it.each(["lfs-advising", "kinesiology-advising"])(
    "discovers %s documents through the declared topic",
    async (subcategory) => {
      const summary = {
        original_id: `documents:${subcategory}:1`,
        category: "documents",
        subcategory,
        title: "Academic support and requests",
        source_url: `https://example.test/${subcategory}/requests`,
      } as DocumentSummary;
      vi.mocked(searchDocuments).mockResolvedValue([summary]);
      const index = vi.fn();
      const client = { index } as unknown as SearchClient;
      expect(await tool.execute({ query: "requests", subcategory }, client)).toMatchObject({
        pages: [{ ...summary, snippets: [] }],
      });
      expect(searchDocuments).toHaveBeenCalledWith("requests", subcategory, 5, client);
      expect(index).not.toHaveBeenCalled();
      expect(JSON.stringify(tool.spec.inputSchema)).toContain(subcategory);
    },
  );

  it("reports index failures rather than hiding missing source results", async () => {
    vi.mocked(searchDocuments).mockRejectedValue(new Error("Search unavailable"));
    const client = { index: () => ({ search: async () => ({ hits: [legacy()] }) }) } as unknown as SearchClient;
    await expect(tool.execute({ query: "guide" }, client)).rejects.toThrow("Search unavailable");
  });
});
