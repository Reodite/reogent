import { createHash } from "node:crypto";
import { canonicalSourceUrl } from "@/src/shared/citations/url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DataWriter, SearchClient } from "../core/types";
import { recordIndexFreshness } from "../freshness";
import { runIngest, sanitizeMeiliId } from "../ingest";
import { documents, readDocuments, searchDocuments, transformDocument } from "./documents";

vi.mock("../freshness", () => ({ recordIndexFreshness: vi.fn() }));

const MARKDOWN =
  "## Registration steps\n\n1. Review the requirements.\n2. Submit the request.\n\n> Approval is required before the deadline.\n\n| Item | Condition |\n| --- | --- |\n| Example | Required |";
function article(patch: Record<string, unknown> = {}) {
  const row = {
    id: "documents:workday:1",
    category: "documents",
    subcategory: "workday",
    source_id: "workday",
    upstream_id: 1,
    title: "Example guide",
    content_markdown: MARKDOWN,
    source_url: "https://example.test/guide/",
    api_url: "https://example.test/api/1",
    campus: null,
    audience: "undergraduate_and_shared",
    source_modified_at: "2026-08-01T12:00:00Z",
    retrieved_at: "2026-09-01T12:00:00Z",
    source_records: [{ path: "campus-services/student_services_pages.json", id: 14 }],
    links: [{ text: "Requirements", url: "https://example.test/requirements" }],
    warnings: ["Example table note"],
    ...patch,
  };
  return {
    ...row,
    content_sha256:
      patch.content_sha256 ?? createHash("sha256").update(`${row.title}\n${row.content_markdown}`).digest("hex"),
  };
}
function catalog(rows: unknown[] = [article()], patch: Record<string, unknown> = {}) {
  return {
    category: "documents",
    tables: [
      {
        subcategory: "workday",
        json: "documents/workday/articles.json",
        records: rows.length,
        status: "complete",
        ...patch,
      },
    ],
  };
}
function store(rows: unknown[] = [article()], descriptor: unknown = catalog(rows)): DataWriter {
  return {
    getJson: vi.fn(async (key) => (key === "documents/_catalog.json" ? descriptor : rows)),
    putJson: vi.fn(),
  };
}
async function collect(source: DataWriter) {
  const values = [];
  for await (const value of readDocuments(source)) values.push(value);
  return values;
}
const search = vi.fn();
const getDocument = vi.fn();
const index = vi.fn(() => ({ search, getDocument }));
const client = { index } as unknown as SearchClient;
beforeEach(() => {
  vi.clearAllMocks();
  search.mockReset().mockResolvedValue({ hits: [] });
  getDocument.mockReset();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DATA_PATH", "/unavailable-source-fixture");
});
afterEach(() => vi.unstubAllEnvs());

describe("common documents adapter", () => {
  it("preserves complete Markdown, source identities and original timestamps in one category", () => {
    const content = `${MARKDOWN}\n\n${"Additional condition. ".repeat(2000)}`;
    const input = article({
      content_markdown: content,
      upstream_id: "0001",
      publication: "unused-marker",
      markdown_path: "unused.md",
    });
    const result = transformDocument(input)!;
    expect(result.id).toBe("documents:workday:1");
    expect(sanitizeMeiliId(result.id)).toBe("documents_workday_1");
    expect(result.doc).toMatchObject({
      original_id: input.id,
      category: "documents",
      subcategory: "workday",
      format: "markdown",
      upstream_id: "0001",
      title: input.title,
      content_markdown: content,
      content_sha256: input.content_sha256,
      source_url: input.source_url,
      source_modified_at: input.source_modified_at,
      retrieved_at: input.retrieved_at,
      source_records: input.source_records,
      links: input.links,
      warnings: input.warnings,
    });
    expect(result.doc).not.toHaveProperty("publication");
    expect(result.doc).not.toHaveProperty("markdown_path");
  });

  it.each(["workday", "student-housing", "arts-advising", "science-advising"])(
    "maps %s without introducing another category",
    (subcategory) => {
      expect(transformDocument(article({ id: `documents:${subcategory}:one`, subcategory }))?.doc).toMatchObject({
        category: "documents",
        subcategory,
      });
    },
  );

  it.each([{ title: " " }, { content_markdown: "\n " }])("skips empty content: %j", (patch) => {
    expect(transformDocument(article(patch))).toBeNull();
  });

  it.each([{ title: " " }, { content_markdown: "\n " }])(
    "checks integrity before skipping empty content: %j",
    (patch) => {
      expect(() => transformDocument({ ...article(), ...patch })).toThrow(/hash mismatch/);
    },
  );

  it.each([
    { category: "pages" },
    { category: "prose" },
    { id: "prose:workday:1" },
    { subcategory: "../secret" },
    { id: "other:workday:1" },
    { format: "html" },
    { title: { rendered: "Title" } },
    { content_markdown: null },
    { content_sha256: "0".repeat(64) },
    { source_url: "javascript:alert(1)" },
    { source_url: "javascript:alert(1)", content_markdown: " " },
    { api_url: "file:///tmp/data" },
    { upstream_id: {} },
    { source_records: [{ path: "../secret.json", id: 1 }] },
    { source_records: [{ path: "pages.json", id: {} }] },
    { links: [{ text: "Unsafe", url: "data:text/html,example" }] },
    { warnings: [null] },
    { retrieved_at: "2026-02-30T12:00:00Z" },
    { source_modified_at: "2026-09-01T12:00:00" },
  ])("rejects malformed article fields: %j", (patch) => {
    expect(() => transformDocument(article(patch))).toThrow();
  });

  it("preserves publisher minute precision without inventing seconds", () => {
    const source_modified_at = "2026-05-21T21:39Z";
    expect(transformDocument(article({ source_modified_at }))?.doc.source_modified_at).toBe(source_modified_at);
  });

  it("preserves null modification dates, mixed publisher IDs and contact links", () => {
    const input = article({
      upstream_id: null,
      source_modified_at: null,
      source_records: [{ path: "pages.json", id: "0001" }],
      links: [
        { text: "Contact", url: "mailto:example@example.test" },
        { text: "Call", url: "tel:+16045550100" },
      ],
    });
    expect(transformDocument(input)?.doc).toMatchObject({
      upstream_id: null,
      source_modified_at: null,
      source_records: input.source_records,
      links: input.links,
    });
  });

  it("reads catalog-declared arrays and skips empty articles without writing data", async () => {
    const rows = [article(), article({ id: "documents:workday:2", content_markdown: " " })];
    const source = store(rows);
    expect(await collect(source)).toHaveLength(1);
    expect(source.getJson).toHaveBeenCalledWith("documents/workday/articles.json");
    expect(source.putJson).not.toHaveBeenCalled();
  });

  it("ingests catalog-declared co-op and advising sources with distinct original identities", async () => {
    const topics = [
      "science-coop",
      "coop-programs",
      "arts-coop",
      "engineering-coop",
      "forestry-coop",
      "sauder-undergraduate",
      "lfs-advising",
      "kinesiology-advising",
    ];
    const tables = topics.map((subcategory) => ({
      subcategory,
      json: `documents/${subcategory}/articles.json`,
      records: 1,
      status: "complete",
    }));
    const inputs = new Map(
      tables.map((table) => [
        table.json,
        [
          article({
            id: `documents:${table.subcategory}:1`,
            subcategory: table.subcategory,
            source_id: table.subcategory,
            source_url: `https://example.test/${table.subcategory}/requirements`,
          }),
        ],
      ]),
    );
    const source: DataWriter = {
      getJson: vi.fn(async (key) =>
        key === "documents/_catalog.json" ? { category: "documents", tables } : inputs.get(key),
      ),
      putJson: vi.fn(),
    };
    const results = await collect(source);
    expect(results.map((result) => result.doc.subcategory)).toEqual(topics);
    expect(new Set(results.map((result) => sanitizeMeiliId(result.id))).size).toBe(topics.length);
    for (const result of results) {
      expect(result.doc.content_markdown).toBe(MARKDOWN);
      expect(result.doc.original_id).toBe(result.id);
      expect(result.doc.source_id).toBe(result.doc.subcategory);
    }
    expect(source.putJson).not.toHaveBeenCalled();
  });

  it.each([{ title: " " }, { content_markdown: "\n " }])(
    "rejects nonempty tables whose articles are all skipped: %j",
    async (patch) => {
      await expect(collect(store([article(patch)]))).rejects.toThrow(/no nonempty articles/);
    },
  );

  it("rejects an all-skipped table even when another subcategory has valid articles", async () => {
    const descriptor = catalog();
    descriptor.tables.push({
      subcategory: "student-finances",
      json: "documents/student-finances/articles.json",
      records: 1,
      status: "complete",
    });
    const source = store();
    vi.mocked(source.getJson).mockImplementation(async (key) =>
      key === "documents/_catalog.json"
        ? descriptor
        : key.includes("student-finances")
          ? [article({ id: "documents:student-finances:2", subcategory: "student-finances", content_markdown: " " })]
          : [article()],
    );
    await expect(collect(source)).rejects.toThrow(/no nonempty articles.*student-finances/);
  });

  it("accepts a declared empty subcategory beside populated tables", async () => {
    const descriptor = catalog();
    descriptor.tables.push({
      subcategory: "student-finances",
      json: "documents/student-finances/articles.json",
      records: 0,
      status: "complete",
    });
    const source = store();
    vi.mocked(source.getJson).mockImplementation(async (key) =>
      key === "documents/_catalog.json" ? descriptor : key.includes("student-finances") ? [] : [article()],
    );
    expect(await collect(source)).toHaveLength(1);
  });

  it.each([null, undefined])("rejects missing corpus catalogs: %j", async (missing) => {
    const source = { getJson: vi.fn().mockResolvedValue(missing), putJson: vi.fn() };
    await expect(collect(source)).rejects.toThrow(/Document catalog/);
  });

  it.each([
    { status: "partial" },
    { status: "not_collected" },
    { json: "documents/../../secret.json" },
    { json: "prose/workday/articles.json" },
    { records: 2 },
    { records: -1 },
    { subcategory: "../secret" },
  ])("rejects incomplete catalogs or count mismatches: %j", async (patch) => {
    const rows = [article()];
    await expect(collect(store(rows, catalog(rows, patch)))).rejects.toThrow();
  });

  it("rejects duplicate sanitized IDs and mismatched subcategories", async () => {
    await expect(
      collect(store([article({ id: "documents:workday:one:two" }), article({ id: "documents:workday:one_two" })])),
    ).rejects.toThrow(/Duplicate sanitized/);
    await expect(
      collect(store([article({ id: "documents:arts-advising:1", subcategory: "arts-advising" })])),
    ).rejects.toThrow(/subcategory mismatch/);
  });

  it("replaces complete snapshots, including a declared empty corpus", async () => {
    expect(documents.indices[0]).toMatchObject({ index: "documents", replace: true });
    expect(await collect(store([]))).toEqual([]);
  });
});

describe("indexed documents retrieval", () => {
  it("uses the injected search client in production without local source files", async () => {
    expect(await searchDocuments("example", undefined, 5, client)).toEqual([]);
    expect(index).toHaveBeenCalledWith("documents");
    expect(search).toHaveBeenCalledWith("example", expect.objectContaining({ filter: undefined, limit: 5 }));
  });

  it("reports search and document retrieval failures", async () => {
    search.mockRejectedValue(new Error("Search unavailable"));
    getDocument.mockRejectedValue(new Error("Article not found"));
    await expect(searchDocuments("example", undefined, 5, client)).rejects.toThrow("Search unavailable");
    await expect(documents.tools[0].execute({ article_id: "documents:workday:1" }, client)).rejects.toThrow(
      "Article not found",
    );
  });

  it("returns metadata only, retaining subcategories and source joins", async () => {
    const document = transformDocument(article())!.doc;
    search.mockResolvedValue({ hits: [{ ...document, injected: "discard" }] });
    const [summary] = await searchDocuments("registration", "workday", 3, client);
    expect(summary).toMatchObject({
      original_id: document.original_id,
      category: "documents",
      subcategory: "workday",
      source_records: document.source_records,
    });
    expect(summary).not.toHaveProperty("content_markdown");
    expect(summary).not.toHaveProperty("injected");
    expect(search.mock.calls[0][1]).toMatchObject({ filter: 'subcategory = "workday"', limit: 3 });
    expect(search.mock.calls[0][1].attributesToRetrieve).not.toContain("content_markdown");
  });

  it("retrieves the complete raw article and verifies its identity and hash", async () => {
    const document = transformDocument(article())!.doc;
    getDocument.mockResolvedValue({ ...document, _formatted: { content_markdown: "must not use" } });
    expect(await documents.tools[0].execute({ article_id: document.original_id }, client)).toEqual(document);
    expect(index).toHaveBeenCalledWith("documents");
    expect(getDocument).toHaveBeenCalledWith("documents_workday_1");
    getDocument.mockResolvedValue({ ...document, original_id: "documents:workday:other" });
    await expect(documents.tools[0].execute({ article_id: document.original_id }, client)).rejects.toThrow(
      /identity mismatch/,
    );
    getDocument.mockResolvedValue({ ...document, content_markdown: "Changed body" });
    await expect(documents.tools[0].execute({ article_id: document.original_id }, client)).rejects.toThrow(
      /hash mismatch/,
    );
  });

  it("directs upstream-only IDs to the article search without querying the index", async () => {
    await expect(documents.tools[0].execute({ article_id: "service-record-id" }, client)).rejects.toThrow(
      "Use the complete original_id returned by search_ubc_pages, including its documents: prefix.",
    );
    expect(getDocument).not.toHaveBeenCalled();
  });

  it.each([undefined, "other:workday:1", "documents:../secret:1", "prose:workday:1"])(
    "rejects invalid article IDs before lookup: %s",
    async (article_id) => {
      await expect(documents.tools[0].execute({ article_id }, client)).rejects.toThrow();
      expect(getDocument).not.toHaveBeenCalled();
    },
  );
});

describe("document ingestion and retrieval", () => {
  it("replaces stale IDs, retires the old index and retrieves the published Markdown", async () => {
    const input = article({
      id: "documents:lfs-advising:570",
      subcategory: "lfs-advising",
      source_records: [{ path: "support/pages.json", id: "prose:upstream-id" }],
    });
    const source = store(
      [input],
      catalog([input], {
        subcategory: "lfs-advising",
        json: "documents/lfs-advising/articles.json",
      }),
    );
    const snapshots = new Map<string, Record<string, unknown>[]>([
      ["prose", [{ id: "prose_lfs_advising_570", original_id: "prose:lfs-advising:570" }]],
      ["documents", [{ id: "documents_stale_1", original_id: "documents:stale:1" }]],
    ]);
    const queued = { taskUid: 1 };
    const client = {
      createIndex: vi.fn(async (name: string) => {
        if (!snapshots.has(name)) snapshots.set(name, []);
        return queued;
      }),
      index: vi.fn((name: string) => ({
        updateSettings: vi.fn(async () => queued),
        addDocuments: vi.fn(async (batch: Record<string, unknown>[]) => {
          snapshots.get(name)!.push(...batch);
          return queued;
        }),
        search: vi.fn(async () => ({ hits: snapshots.get(name) ?? [] })),
        getDocument: vi.fn(async (id: string) => snapshots.get(name)?.find((doc) => doc.id === id)),
      })),
      swapIndexes: vi.fn(async ([swap]: { indexes: string[]; rename: boolean }[]) => {
        const [live, staging] = swap.indexes;
        const old = snapshots.get(live)!;
        snapshots.set(live, snapshots.get(staging)!);
        snapshots.set(staging, old);
        return queued;
      }),
      deleteIndex: vi.fn(async (name: string) => {
        snapshots.delete(name);
        return queued;
      }),
      tasks: { waitForTask: vi.fn(async () => ({ uid: 1, status: "succeeded", error: null })) },
    } as unknown as SearchClient;

    await runIngest([documents], client, source);

    expect([...snapshots.keys()]).toEqual(["documents"]);
    expect(snapshots.get("documents")?.map((doc) => doc.id)).toEqual(["documents_lfs-advising_570"]);
    expect(recordIndexFreshness).toHaveBeenCalledWith("documents");
    const [summary] = await searchDocuments("requests", "lfs-advising", 5, client);
    expect(summary).not.toHaveProperty("content_markdown");
    const full = await documents.tools[0].execute({ article_id: summary.original_id }, client);
    expect(full).toEqual(transformDocument(input)!.doc);
    expect(full).toMatchObject({ content_markdown: MARKDOWN, source_records: input.source_records });
    expect(source.putJson).not.toHaveBeenCalled();
  });

  it.each([
    { category: "prose" },
    { tables: [{ subcategory: "workday", json: "prose/workday/articles.json", records: 1, status: "complete" }] },
  ])("keeps the old index when the catalog uses the old namespace: %j", async (patch) => {
    const source = store([article()], { ...catalog(), ...patch });
    const client = {
      createIndex: vi.fn(async () => ({ taskUid: 1 })),
      index: vi.fn(() => ({ updateSettings: vi.fn(async () => ({ taskUid: 2 })) })),
      swapIndexes: vi.fn(),
      deleteIndex: vi.fn(async () => ({ taskUid: 3 })),
      tasks: { waitForTask: vi.fn(async () => ({ uid: 1, status: "succeeded", error: null })) },
    } as unknown as SearchClient;

    await expect(runIngest([documents], client, source)).rejects.toThrow("Ingest failed");
    expect(client.swapIndexes).not.toHaveBeenCalled();
    expect(client.deleteIndex).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/^documents__/));
    expect(client.deleteIndex).not.toHaveBeenCalledWith("prose");
    expect(recordIndexFreshness).not.toHaveBeenCalled();
  });
});

describe("canonical citation identities", () => {
  it("normalizes host, fragment, trailing slash and query order without losing parameters", () => {
    expect(canonicalSourceUrl("https://EXAMPLE.test/path/?b=2&a=1#steps")).toBe(
      canonicalSourceUrl("https://example.test/path?a=1&b=2"),
    );
    expect(canonicalSourceUrl("https://example.test/path?topic=one")).not.toBe(
      canonicalSourceUrl("https://example.test/path?topic=two"),
    );
    expect(canonicalSourceUrl("javascript:alert(1)")).toBeUndefined();
  });
});
