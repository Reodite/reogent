import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { DataReader } from "../core/types";
import { readHostDocuments, type HostDocument } from "./host-documents";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const filename = (document: HostDocument) => `${sha256(document.id)}.md`;
const directory = (document: HostDocument) => `documents/${document.category}/${document.hostname}`;
const key = (document: HostDocument) => `${directory(document)}/${filename(document)}`;

function document(overrides: Partial<HostDocument> = {}): HostDocument {
  const title = overrides.title ?? "Graduate student guidance";
  const content_markdown =
    overrides.content_markdown ?? "  # Guidance\r\n\nCafé, staff and alumni.\n\n---\n\tKeep this spacing.  ";
  const hostname = overrides.hostname ?? "support.ubc.ca";
  const source_url = overrides.source_url ?? `https://${hostname}/guidance/`;
  return {
    format_version: 3,
    id: `documents:official-web:${sha256(source_url).slice(0, 24)}`,
    hostname,
    title,
    source_url,
    retrieved_at: "2026-09-20T14:42:18.576Z",
    source_modified_at: null,
    snapshot_sha256: sha256("snapshot"),
    input_sha256: sha256("input"),
    body_sha256: sha256(content_markdown),
    content_sha256: sha256(`${title}\n${content_markdown}`),
    content_markdown,
    warnings: ["Source modification date unavailable."],
    alternate_urls: [`https://${hostname}/old-guidance/`],
    producer: {
      inputs_sha256: sha256("producer"),
      runtime: { node: "26.8.1", icu: "78.3", unicode: "17.0", platform: "linux", arch: "x64" },
    },
    category: "support",
    routing: { rule_id: "host-purpose", policy_sha256: sha256("routing") },
    ...overrides,
  };
}

function serialize(document: HostDocument): string {
  const { content_markdown, ...metadata } = document;
  return `---\n${JSON.stringify(metadata, null, 2)}\n---\n${content_markdown}`;
}

function corpus(documents: HostDocument[] = [document()]) {
  const registry: {
    hostname: string;
    document_count: number;
    document_roots: { category: string; path: string; document_count: number }[];
  }[] = [];
  const files = new Map<string, string>();
  const listings = new Map<string, string[]>();
  for (const document of documents) {
    let host = registry.find((entry) => entry.hostname === document.hostname);
    if (!host) {
      host = { hostname: document.hostname, document_count: 0, document_roots: [] };
      registry.push(host);
    }
    host.document_count++;
    let root = host.document_roots.find((entry) => entry.category === document.category);
    if (!root) {
      root = { category: document.category, path: `data/${directory(document)}`, document_count: 0 };
      host.document_roots.push(root);
      listings.set(directory(document), []);
    }
    root.document_count++;
    listings.get(directory(document))!.push(filename(document));
    files.set(key(document), serialize(document));
  }
  const store = {
    getJson: vi.fn(async (key: string): Promise<unknown> => {
      if (key !== "official-hosts.json") throw new Error(`Unexpected JSON key: ${key}`);
      return registry;
    }),
    getText: vi.fn(async (key: string) => {
      const text = files.get(key);
      if (text === undefined) throw new Error(`Missing text: ${key}`);
      return text;
    }),
    list: vi.fn(async (key: string) => {
      const entries = listings.get(key);
      if (entries === undefined) throw new Error(`Missing directory: ${key}`);
      return entries;
    }),
  } satisfies DataReader;
  return { registry, files, listings, store };
}

async function collect(store: DataReader): Promise<HostDocument[]> {
  const documents: HostDocument[] = [];
  for await (const document of readHostDocuments(store)) documents.push(document);
  return documents;
}

function changeMetadata(serialized: string, change: (metadata: Record<string, unknown>) => void): string {
  const end = serialized.indexOf("\n---\n", 4);
  const metadata = JSON.parse(serialized.slice(4, end));
  change(metadata);
  return `---\n${JSON.stringify(metadata, null, 2)}${serialized.slice(end)}`;
}

describe("readHostDocuments", () => {
  it("reads all six categories across hosts through data-root-relative keys", async () => {
    const categories = ["support", "academics", "opportunities", "research", "news", "stories"] as const;
    const documents = categories.map((category, index) =>
      document({
        category,
        hostname: index < 4 ? "support.ubc.ca" : "news.ubc.ca",
        source_url: `https://${index < 4 ? "support.ubc.ca" : "news.ubc.ca"}/${category}/`,
      }),
    );
    const { store } = corpus(documents);
    expect(await collect(store)).toEqual(documents);
    expect(store.getJson).toHaveBeenCalledExactlyOnceWith("official-hosts.json");
    expect(store.list.mock.calls.map(([key]) => key)).toEqual(documents.map(directory));
    expect(store.getText.mock.calls.map(([path]) => path)).toEqual(documents.map(key));
  });

  it("preserves exact body bytes, provenance and supplied classification without audience inference", async () => {
    const original = document({ source_modified_at: "2023-06-06T17:57:19Z" });
    const [loaded] = await collect(corpus([original]).store);
    expect(loaded).toEqual(original);
  });

  it("accepts an explicitly empty registry without reading directories", async () => {
    const { store } = corpus([]);
    expect(await collect(store)).toEqual([]);
    expect(store.list).not.toHaveBeenCalled();
    expect(store.getText).not.toHaveBeenCalled();
  });

  it.each([null, {}, "[]", { hosts: [] }, [null], [[]], [{}]])("rejects malformed registry %j", async (value) => {
    const { store } = corpus();
    store.getJson.mockResolvedValue(value);
    await expect(collect(store)).rejects.toThrow();
    expect(store.list).not.toHaveBeenCalled();
  });

  it("propagates a missing registry", async () => {
    const { store } = corpus();
    store.getJson.mockRejectedValue(new Error("Missing official-hosts.json"));
    await expect(collect(store)).rejects.toThrow("Missing official-hosts.json");
  });

  it.each(["../support.ubc.ca", "support.ubc.ca/evil", "Support.ubc.ca", "support..ubc.ca", "-support.ubc.ca"])(
    "rejects invalid hostname %s before accessing its path",
    async (hostname) => {
      const { store, registry } = corpus();
      registry[0].hostname = hostname;
      await expect(collect(store)).rejects.toThrow(/hostname/);
      expect(store.list).not.toHaveBeenCalled();
    },
  );

  it.each([
    "documents/support/support.ubc.ca",
    "/data/documents/support/support.ubc.ca",
    "data/documents/support/support.ubc.ca/",
    "data/documents/support/../support.ubc.ca",
    "data/documents/support/%2e%2e",
    "data/documents/support/other.ubc.ca",
    "data/documents/news/support.ubc.ca",
    "data\\documents\\support\\support.ubc.ca",
  ])("rejects malformed root path %s", async (path) => {
    const { store, registry } = corpus();
    registry[0].document_roots[0].path = path;
    await expect(collect(store)).rejects.toThrow(/root path/);
    expect(store.list).not.toHaveBeenCalled();
  });

  it("rejects an unsupported category", async () => {
    const { store, registry } = corpus();
    registry[0].document_roots[0].category = "misc";
    await expect(collect(store)).rejects.toThrow(/category/);
  });

  it.each([null, {}, "documents/support/support.ubc.ca"])("rejects malformed roots %j", async (roots) => {
    const { store, registry } = corpus();
    store.getJson.mockResolvedValue([{ ...registry[0], document_roots: roots }]);
    await expect(collect(store)).rejects.toThrow(/document_roots/);
  });

  it("rejects duplicate hostnames before yielding any documents", async () => {
    const { store, registry } = corpus();
    registry.push(structuredClone(registry[0]));
    await expect(readHostDocuments(store).next()).rejects.toThrow(/Duplicate hostname/);
    expect(store.list).not.toHaveBeenCalled();
  });

  it("rejects duplicate roots", async () => {
    const { store, registry } = corpus();
    registry[0].document_roots.push({ ...registry[0].document_roots[0] });
    registry[0].document_count = 2;
    await expect(collect(store)).rejects.toThrow(/Duplicate document root/);
  });

  it.each([0, -1, 1.5, "1", null, Number.MAX_SAFE_INTEGER + 1])("rejects invalid count %j", async (value) => {
    for (const field of ["host", "root"]) {
      const { store, registry } = corpus();
      const target = field === "host" ? registry[0] : registry[0].document_roots[0];
      Object.assign(target, { document_count: value });
      await expect(collect(store)).rejects.toThrow(/positive safe integer/);
    }
  });

  it("rejects host totals that disagree with their roots", async () => {
    const { store, registry } = corpus();
    registry[0].document_count++;
    await expect(collect(store)).rejects.toThrow(/Host document count mismatch/);
  });

  it.each([0, 2])("rejects root listings with %i entries instead of the declared count", async (length) => {
    const { store } = corpus();
    store.list.mockResolvedValue(Array.from({ length }, () => filename(document())));
    await expect(collect(store)).rejects.toThrow(/Root document count mismatch/);
  });

  it("propagates a missing root directory", async () => {
    const { store, listings } = corpus();
    listings.clear();
    await expect(collect(store)).rejects.toThrow(/Missing directory/);
  });

  it("propagates a missing file with its dataset key", async () => {
    const { store, files } = corpus();
    files.clear();
    await expect(collect(store)).rejects.toThrow(`Missing text: ${key(document())}`);
  });

  it.each([
    ".DS_Store",
    "README.md",
    "nested",
    "../file.md",
    `dir/${filename(document())}`,
    filename(document()).toUpperCase(),
  ])("rejects unexpected directory entry %s instead of skipping it", async (entry) => {
    const { store } = corpus();
    store.list.mockResolvedValue([entry]);
    await expect(collect(store)).rejects.toThrow(/Unexpected document entry/);
  });

  it("rejects duplicate listed filenames", async () => {
    const original = document();
    const { store } = corpus([original, original]);
    await expect(collect(store)).rejects.toThrow(/Duplicate document filename/);
  });

  it("rejects duplicate IDs across categories", async () => {
    const original = document();
    const { store } = corpus([original, { ...original, category: "academics" }]);
    await expect(collect(store)).rejects.toThrow(/Duplicate document ID/);
  });

  it.each([
    ["missing delimiter", (value: string) => value.replace("---\n", "")],
    ["unterminated frontmatter", (value: string) => value.replace("\n---\n", "\n")],
    ["YAML frontmatter", () => "---\nid: not-json\n---\nbody"],
    ["array frontmatter", () => "---\n[]\n---\nbody"],
    ["CRLF frontmatter", (value: string) => value.replaceAll("\n", "\r\n")],
    ["compact JSON", (value: string) => value.replace("{\n  ", "{")],
    [
      "duplicate JSON keys",
      (value: string) => value.replace('"format_version": 3,', '"format_version": 3,\n  "format_version": 3,'),
    ],
    ["replacement character", (value: string) => value.replace("Café", "Caf\uFFFD")],
    ["unpaired surrogate", (value: string) => `${value}\uD800`],
    ["BOM", (value: string) => `\uFEFF${value}`],
    ["Git LFS pointer", () => "version https://git-lfs.github.com/spec/v1\noid sha256:abc"],
  ] as const)("rejects %s", async (_label, mutate) => {
    const original = document();
    const { store, files } = corpus([original]);
    files.set(key(original), mutate(files.get(key(original))!));
    await expect(collect(store)).rejects.toThrow();
  });

  it.each([
    ["ID", "id", "documents:official-web:000000000000000000000000"],
    ["hostname", "hostname", "other.ubc.ca"],
    ["category", "category", "academics"],
    ["title", "title", "Changed title"],
    ["empty title", "title", ""],
    ["body digest", "body_sha256", sha256("wrong")],
    ["content digest", "content_sha256", sha256("wrong")],
    ["snapshot digest", "snapshot_sha256", "invalid"],
    ["input digest", "input_sha256", "A".repeat(64)],
    ["retrieval timestamp", "retrieved_at", null],
    ["calendar timestamp", "retrieved_at", "2026-02-30T00:00:00Z"],
    ["modification timestamp", "source_modified_at", "yesterday"],
    ["timezone timestamp", "source_modified_at", "2026-09-20T00:00:00+00:00"],
    ["missing modification timestamp", "source_modified_at", undefined],
    ["legacy HTML version", "format_version", 1],
    ["legacy PDF version", "format_version", 2],
    ["Markdown without extraction", "format_version", 4],
    ["unknown version", "format_version", 99],
    ["warning array", "warnings", "warning"],
    ["warning item", "warnings", [42]],
    ["duplicate warning", "warnings", ["warning", "warning"]],
    ["alternate URL array", "alternate_urls", null],
    ["alternate URL item", "alternate_urls", [false]],
    ["off-host alternate", "alternate_urls", ["https://other.ubc.ca/"]],
    ["duplicate alternate", "alternate_urls", ["https://support.ubc.ca/old/", "https://support.ubc.ca/old/"]],
    ["source as alternate", "alternate_urls", ["https://support.ubc.ca/guidance/"]],
    ["producer", "producer", null],
    ["producer fields", "producer", {}],
    ["routing", "routing", []],
    ["routing fields", "routing", {}],
    ["extraction", "extraction", null],
    ["unknown extraction", "extraction", { format: "word" }],
    ["embedded body", "content_markdown", "replacement"],
  ])("rejects corrupt %s metadata", async (_label, field, value) => {
    const original = document();
    const { store, files } = corpus([original]);
    files.set(
      key(original),
      changeMetadata(files.get(key(original))!, (metadata) => {
        metadata[String(field)] = value;
      }),
    );
    await expect(collect(store)).rejects.toThrow();
  });

  it.each([
    "http://support.ubc.ca/guidance/",
    "https://other.ubc.ca/guidance/",
    "https://user:password@support.ubc.ca/guidance/",
    "https://support.ubc.ca:8443/guidance/",
    "https://support.ubc.ca/guidance/#fragment",
    "https://support.ubc.ca/guidance/%0a",
    "https://support.ubc.ca/\tguidance/",
    "javascript:alert(1)",
  ])("rejects unsafe source URL %s even with a matching ID", async (source_url) => {
    const original = document({ source_url });
    await expect(collect(corpus([original]).store)).rejects.toThrow();
  });

  it("rejects a filename that does not hash the ID", async () => {
    const original = document();
    const { store, files } = corpus([original]);
    const wrongFilename = `${"0".repeat(64)}.md`;
    store.list.mockResolvedValue([wrongFilename]);
    files.set(`${directory(original)}/${wrongFilename}`, serialize(original));
    await expect(collect(store)).rejects.toThrow(/filename mismatch/);
  });

  it("rejects corrupted body bytes", async () => {
    const original = document();
    const { store, files } = corpus([original]);
    files.set(key(original), `${serialize(original)}\n`);
    await expect(collect(store)).rejects.toThrow(/digest mismatch/);
  });

  it.each(["", "\n\t ", "bad\u0000body"])("rejects invalid body %j with matching digests", async (content_markdown) => {
    await expect(collect(corpus([document({ content_markdown })]).store)).rejects.toThrow(/Markdown body/);
  });

  it("enforces the whole-file byte limit rather than body character count", async () => {
    const original = document({ content_markdown: "é".repeat(512 * 1024) });
    await expect(collect(corpus([original]).store)).rejects.toThrow(/exceeds 1 MiB/);
  });

  it("accepts a whole file exactly at the byte limit", async () => {
    const overhead = Buffer.byteLength(serialize(document({ content_markdown: "x" }))) - 1;
    const original = document({ content_markdown: "x".repeat(1024 * 1024 - overhead) });
    expect(await collect(corpus([original]).store)).toEqual([original]);
  });

  it("preserves categorized PDF extraction evidence", async () => {
    const original = document({
      source_url: "https://support.ubc.ca/retained.pdf",
      extraction: {
        format: "pdf",
        source_bytes_sha256: sha256("PDF bytes"),
        source_bytes: 138985,
        pages: 3,
        profile_sha256: sha256("PDF profile"),
      },
    });
    expect(await collect(corpus([original]).store)).toEqual([original]);
  });

  it.each(["inputs_sha256", "runtime", "node", "policy_sha256", "rule_id", "pages", "source_bytes", "profile_sha256"])(
    "rejects missing provenance field %s",
    async (field) => {
      const original = document({
        extraction: {
          format: "pdf",
          source_bytes_sha256: sha256("PDF"),
          source_bytes: 20,
          pages: 1,
          profile_sha256: sha256("profile"),
        },
      });
      const { store, files } = corpus([original]);
      files.set(
        key(original),
        changeMetadata(serialize(original), (metadata) => {
          const producer = metadata.producer as Record<string, unknown>;
          const target =
            field === "node"
              ? producer.runtime
              : ["inputs_sha256", "runtime"].includes(field)
                ? producer
                : ["policy_sha256", "rule_id"].includes(field)
                  ? metadata.routing
                  : metadata.extraction;
          delete (target as Record<string, unknown>)[field];
        }),
      );
      await expect(collect(store)).rejects.toThrow();
    },
  );

  it("preserves version 4 Markdown source bytes and title witnesses", async () => {
    const body = "# Retained Markdown\n\n[Relative citation](./citation)\n";
    const source = "https://support.ubc.ca/retained.md";
    const original = document({
      format_version: 4,
      title: "Retained Markdown",
      source_url: source,
      alternate_urls: [],
      content_markdown: body,
      extraction: {
        format: "markdown",
        source_bytes_sha256: sha256(body),
        source_bytes: Buffer.byteLength(body),
        profile_sha256: sha256("Markdown profile"),
        termination: "observed-pid-absence",
        title_origin: { kind: "advertisement", witness_index: 0 },
        witnesses: [
          {
            source_url: "https://support.ubc.ca/article/",
            snapshot_sha256: sha256("article"),
            target_url: source,
            channel: "html-head",
            title: "Retained Markdown",
          },
        ],
      },
    });
    expect(await collect(corpus([original]).store)).toEqual([original]);
    const changed = structuredClone(original);
    changed.extraction!.source_bytes++;
    await expect(collect(corpus([changed]).store)).rejects.toThrow(/extraction bytes/);
  });
});
