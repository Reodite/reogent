import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DataReader, SearchClient } from "../core/types";
import { sanitizeMeiliId } from "../ingest";
import { documents, documentSearchSections, readDocuments, transformDocument } from "./documents";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const title = "Synthetic Workday guide";
const body = "## Registration\n\n1. Select a course.\n2. Review its prerequisites.\n\nConditions apply.\n";
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "prose:workday:133",
    category: "prose",
    subcategory: "workday",
    source_id: "workday",
    upstream_id: "133",
    title,
    content_markdown: body,
    content_sha256: hash(`${title}\n${body}`),
    source_url: "https://workday.students.ubc.ca/guide/?view=student",
    api_url: null,
    campus: null,
    audience: "undergraduate_and_shared",
    retrieved_at: "2026-09-11T05:07:27.466Z",
    source_modified_at: "2026-05-19T20:07+00:00",
    source_records: [{ path: "campus-services/student_services_pages.json", id: null }],
    links: [{ text: "Help", url: "https://example.ubc.ca/help" }],
    warnings: ["Images remain source links; no OCR."],
    ...overrides,
  };
}
function store(rows: unknown[] = [row()], overrides: Record<string, unknown> = {}): DataReader {
  const tables: Record<string, unknown> = {
    "prose/_catalog.json": {
      category: "prose",
      tables: [
        { subcategory: "workday", json: "prose/workday/articles.json", status: "complete", records: rows.length },
      ],
    },
    "prose/workday/articles.json": rows,
    "official-hosts.json": [],
    ...overrides,
  };
  return {
    getJson: vi.fn(async (key) => {
      if (!Object.hasOwn(tables, key)) throw new Error(`Missing dataset ${key}`);
      return tables[key];
    }),
    getText: vi.fn(),
    list: vi.fn(),
  };
}
async function collect(input: DataReader) {
  return Array.fromAsync(readDocuments(input));
}

afterEach(() => vi.unstubAllEnvs());

describe("catalog prose ingestion", () => {
  it("preserves complete Markdown, identities, timestamps and nullable provenance", () => {
    const transformed = transformDocument(row());
    expect(transformed.id).toBe("prose:workday:133");
    expect(transformed.doc).toMatchObject({
      original_id: transformed.id,
      category: "documents",
      content_markdown: body,
      content_sha256: hash(`${title}\n${body}`),
      source_url: "https://workday.students.ubc.ca/guide/?view=student",
      source_modified_at: "2026-05-19T20:07+00:00",
      upstream_id: "133",
      campus: null,
      api_url: null,
      source_records: [{ path: "campus-services/student_services_pages.json", id: null }],
      warnings: ["Images remain source links; no OCR."],
    });
  });

  it.each([null, "133", 133])("preserves source identity %j", (id) => {
    const transformed = transformDocument(row({ upstream_id: id, source_records: [{ path: "table.json", id }] }));
    expect(transformed.doc.upstream_id).toBe(id);
    expect(transformed.doc.source_records[0].id).toBe(id);
  });

  it.each([
    { category: "documents" },
    { id: "prose:another-topic:133" },
    { id: "prose:workday:" },
    { id: "prose:workday:with space" },
    { content_markdown: "Changed body" },
    { title: "Changed title" },
    { content_sha256: "0".repeat(64) },
    { source_url: "javascript:alert(1)" },
    { source_url: "https://user:password@example.ubc.ca/" },
    { retrieved_at: "2026-02-30T05:07Z" },
    { upstream_id: undefined },
    { source_records: [{ path: "../outside.json", id: 1 }] },
    { source_records: [{ path: "table.json" }] },
    { links: [{ text: "Unsafe", url: "javascript:alert(1)" }] },
    { warnings: [false] },
  ])("rejects invalid content or provenance: %j", (overrides) => {
    expect(() => transformDocument(row(overrides))).toThrow();
  });

  it("rejects blank content rather than silently shrinking a published snapshot", () => {
    expect(() => transformDocument(row({ content_markdown: "", content_sha256: hash(`${title}\n`) }))).toThrow();
  });

  it("uses declared tables and still reads the official-host registry", async () => {
    const input = store();
    expect(await collect(input)).toEqual([transformDocument(row())]);
    expect(input.getJson).toHaveBeenCalledWith("prose/_catalog.json");
    expect(input.getJson).toHaveBeenCalledWith("official-hosts.json");
  });

  it("supports an explicitly empty complete snapshot", async () => {
    expect(await collect(store([]))).toEqual([]);
    expect(documents.indices[0].replace).toBe(true);
  });

  it.each([
    null,
    { category: "documents", tables: [] },
    { category: "prose" },
    { category: "prose", tables: [{ subcategory: "../escape", json: "outside.json", status: "complete", records: 0 }] },
    {
      category: "prose",
      tables: [{ subcategory: "workday", json: "prose/workday/articles.json", status: "partial", records: 1 }],
    },
    {
      category: "prose",
      tables: [{ subcategory: "workday", json: "prose/workday/articles.json", status: "complete", records: 2 }],
    },
  ])("rejects an invalid or incomplete catalog: %j", async (catalog) => {
    await expect(collect(store([row()], { "prose/_catalog.json": catalog }))).rejects.toThrow();
  });

  it("rejects duplicate sanitized identities before publication", async () => {
    await expect(collect(store([row({ id: "prose:workday:a:b" }), row({ id: "prose:workday:a_b" })]))).rejects.toThrow(
      "Duplicate sanitized documents ID",
    );
  });

  it("rejects missing host registry rather than publishing only catalog prose", async () => {
    await expect(collect(store([row()], { "official-hosts.json": undefined }))).rejects.toThrow();
  });
});

describe("complete searchable text", () => {
  it("indexes the tail of long documents and overlaps boundary phrases", () => {
    const content = `${"first ".repeat(1998)}boundaryneedle ${"middle ".repeat(70000)}tailneedle`;
    const sections = Object.values(documentSearchSections(content));
    expect(sections.length).toBeGreaterThan(2);
    expect(sections.every((section) => section.length <= 12_000)).toBe(true);
    expect(sections.some((section) => section.includes("boundaryneedle"))).toBe(true);
    expect(sections.at(-1)).toContain("tailneedle");
    expect(sections.map((section, index) => (index === 0 ? section : section.slice(500))).join("")).toBe(content);
  });

  it("keeps searchable fields valid UTF-8 without changing the source Markdown", () => {
    const content = `${"x".repeat(11999)}🦉${"y".repeat(1000)}`;
    expect(Object.values(documentSearchSections(content)).every((section) => section.isWellFormed())).toBe(true);
    const article = transformDocument(row({ content_markdown: content, content_sha256: hash(`${title}\n${content}`) }));
    const indexed = documents.indices[0].transform(article);
    expect(indexed?.doc).toMatchObject({ content_markdown: content, content_sha256: article.doc.content_sha256 });
  });
});

describe("indexed full document retrieval", () => {
  const tool = documents.tools[0];
  function client(value = transformDocument(row()).doc) {
    const getDocument = vi
      .fn()
      .mockResolvedValue({
        ...value,
        id: sanitizeMeiliId(value.original_id),
        search_sections: documentSearchSections(value.content_markdown),
      });
    const index = vi.fn(() => ({ getDocument }));
    return { getDocument, index, search: { index } as unknown as SearchClient };
  }

  it.each(["development", "production"])("retrieves full content without filesystem access in %s", async (mode) => {
    vi.stubEnv("NODE_ENV", mode);
    vi.stubEnv("DATA_PATH", "/nonexistent-corpus");
    const f = client();
    expect(await tool.execute({ article_id: "prose:workday:133" }, f.search)).toEqual(transformDocument(row()).doc);
    expect(f.index).toHaveBeenCalledExactlyOnceWith("documents");
    expect(f.getDocument).toHaveBeenCalledExactlyOnceWith("prose_workday_133");
  });

  it("supports host document identities and retains extraction provenance", async () => {
    const doc = {
      ...transformDocument(row()).doc,
      original_id: "documents:official-web:1234567890abcdef12345678",
      hostname: "example.ubc.ca",
      document_category: "academics",
      alternate_urls: ["https://example.ubc.ca/alias"],
      body_sha256: hash(body),
    };
    const f = client(doc);
    expect(await tool.execute({ article_id: doc.original_id }, f.search)).toEqual(doc);
  });

  it.each([
    undefined,
    "133",
    "student-support:service:133",
    "prose:workday:",
    "documents:official-web:bad",
    "prose:workday:a\u0000",
  ])("rejects incomplete or invalid identifiers %j before searching", async (article_id) => {
    const f = client();
    await expect(tool.execute({ article_id }, f.search)).rejects.toThrow();
    expect(f.index).not.toHaveBeenCalled();
  });

  it("rejects sanitized-ID collisions and corrupt indexed bodies", async () => {
    const f = client();
    await expect(tool.execute({ article_id: "prose:workday:another" }, f.search)).rejects.toThrow("identity mismatch");
    f.getDocument.mockResolvedValue({ ...transformDocument(row()).doc, content_markdown: "Corrupt" });
    await expect(tool.execute({ article_id: "prose:workday:133" }, f.search)).rejects.toThrow("content hash mismatch");
  });

  it("propagates missing indexed documents", async () => {
    const f = client();
    f.getDocument.mockRejectedValue(new Error("document_not_found"));
    await expect(tool.execute({ article_id: "prose:workday:133" }, f.search)).rejects.toThrow("document_not_found");
  });
});
