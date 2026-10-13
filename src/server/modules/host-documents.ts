import { createHash } from "node:crypto";
import type { DataReader } from "../core/types";

const CATEGORIES = ["support", "academics", "opportunities", "research", "news", "stories"] as const;
const MAX_DOCUMENT_BYTES = 1024 * 1024;

type Row = Record<string, unknown>;

/** A categorized host document with its unchanged source, extraction and routing evidence. */
export interface HostDocument {
  format_version: 3 | 4;
  id: string;
  hostname: string;
  category: (typeof CATEGORIES)[number];
  title: string;
  source_url: string;
  retrieved_at: string;
  source_modified_at: string | null;
  snapshot_sha256: string;
  input_sha256: string;
  body_sha256: string;
  content_sha256: string;
  content_markdown: string;
  warnings: string[];
  alternate_urls: string[];
  producer: {
    inputs_sha256: string;
    runtime: { node: string; icu: string; unicode: string; platform: string; arch: string };
  };
  routing: { rule_id: string; policy_sha256: string };
  extraction?: {
    source_bytes_sha256: string;
    source_bytes: number;
    profile_sha256: string;
  } & (
    | { format: "pdf"; pages: number }
    | {
        format: "markdown";
        termination: "observed-pid-absence" | "identity-matched-unreaped-zombie";
        title_origin: { kind: "markdown-body" } | { kind: "advertisement"; witness_index: number };
        witnesses: {
          source_url: string;
          snapshot_sha256: string;
          target_url: string;
          channel: "html-head" | "http-link";
          title: string | null;
        }[];
      }
  );
}

function record(value: unknown, label: string): Row {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Row;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || !value.isWellFormed() || /[\p{Cc}\p{Cf}\uFFFD<>]/u.test(value)) {
    throw new Error(`Invalid ${label} text`);
  }
  return value;
}

function count(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function digest(value: unknown, label: string): void {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`Invalid ${label} SHA256`);
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function timestamp(value: unknown, label: string): void {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString() !== (value.includes(".") ? value : value.replace("Z", ".000Z"))
  ) {
    throw new Error(`Invalid ${label} timestamp`);
  }
}

function sourceUrl(value: unknown, hostname: string): string {
  const source = text(value, "source URL");
  const url = new URL(source);
  if (
    url.protocol !== "https:" ||
    url.host !== hostname ||
    url.username ||
    url.password ||
    url.hash ||
    url.href !== source ||
    /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(source)
  ) {
    throw new Error(`Invalid exact-host HTTPS source URL: ${source}`);
  }
  return source;
}

function category(value: unknown): HostDocument["category"] {
  if (typeof value !== "string" || !CATEGORIES.includes(value as HostDocument["category"])) {
    throw new Error(`Invalid document category: ${String(value)}`);
  }
  return value as HostDocument["category"];
}

function readRegistry(value: unknown) {
  const hosts = new Set<string>();
  const roots = new Set<string>();
  return array(value, "official-hosts.json").flatMap((entry) => {
    const host = record(entry, "host registry entry");
    const hostname = text(host.hostname, "hostname");
    if (
      hostname.length > 253 ||
      !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(hostname)
    ) {
      throw new Error(`Invalid hostname: ${hostname}`);
    }
    if (hosts.has(hostname)) throw new Error(`Duplicate hostname: ${hostname}`);
    hosts.add(hostname);
    const documentCount = count(host.document_count, `${hostname} document_count`);
    const directories = array(host.document_roots, `${hostname} document_roots`).map((entry) => {
      const root = record(entry, "document root");
      const rootCategory = category(root.category);
      const expectedPath = `data/documents/${rootCategory}/${hostname}`;
      if (root.path !== expectedPath) throw new Error(`Invalid document root path for ${hostname}`);
      if (roots.has(expectedPath)) throw new Error(`Duplicate document root: ${expectedPath}`);
      roots.add(expectedPath);
      return {
        hostname,
        category: rootCategory,
        path: expectedPath.slice("data/".length),
        count: count(root.document_count, `${expectedPath} document_count`),
      };
    });
    if (directories.reduce((sum, root) => sum + root.count, 0) !== documentCount) {
      throw new Error(`Host document count mismatch: ${hostname}`);
    }
    return directories;
  });
}

function validateExtraction(metadata: Row, body: string, hostname: string): void {
  if (!Object.hasOwn(metadata, "extraction")) {
    if (metadata.format_version !== 3) throw new Error("Unsupported document format version");
    return;
  }
  const extraction = record(metadata.extraction, "extraction");
  digest(extraction.source_bytes_sha256, "extraction source bytes");
  digest(extraction.profile_sha256, "extraction profile");
  count(extraction.source_bytes, "extraction source_bytes");
  if (extraction.format === "pdf") {
    if (metadata.format_version !== 3) throw new Error("Unsupported PDF document format version");
    count(extraction.pages, "extraction pages");
  } else if (extraction.format === "markdown") {
    if (metadata.format_version !== 4) throw new Error("Unsupported Markdown document format version");
    if (
      extraction.source_bytes !== Buffer.byteLength(body, "utf8") ||
      extraction.source_bytes_sha256 !== metadata.body_sha256
    ) {
      throw new Error("Markdown extraction bytes differ from the body");
    }
    if (
      extraction.termination !== "observed-pid-absence" &&
      extraction.termination !== "identity-matched-unreaped-zombie"
    ) {
      throw new Error("Invalid Markdown termination evidence");
    }
    const witnesses = array(extraction.witnesses, "extraction witnesses");
    if (!witnesses.length) throw new Error("Missing Markdown witnesses");
    for (const value of witnesses) {
      const witness = record(value, "Markdown witness");
      sourceUrl(witness.source_url, hostname);
      sourceUrl(witness.target_url, hostname);
      digest(witness.snapshot_sha256, "witness snapshot");
      if (witness.target_url !== metadata.source_url || witness.source_url === witness.target_url) {
        throw new Error("Markdown witness URL mismatch");
      }
      if (witness.channel !== "html-head" && witness.channel !== "http-link") {
        throw new Error("Invalid Markdown witness channel");
      }
      if (witness.title !== null && witness.title !== "") text(witness.title, "witness title");
    }
    const origin = record(extraction.title_origin, "Markdown title origin");
    if (origin.kind === "advertisement") {
      if (
        typeof origin.witness_index !== "number" ||
        !Number.isSafeInteger(origin.witness_index) ||
        origin.witness_index < 0 ||
        origin.witness_index >= witnesses.length ||
        record(witnesses[origin.witness_index], "title witness").title !== metadata.title
      ) {
        throw new Error("Invalid Markdown title witness");
      }
    } else if (origin.kind !== "markdown-body") {
      throw new Error("Invalid Markdown title origin");
    }
  } else {
    throw new Error("Unsupported document extraction format");
  }
}

function parseDocument(
  serialized: string,
  expected: { hostname: string; category: HostDocument["category"]; filename: string },
): HostDocument {
  if (typeof serialized !== "string" || !serialized.isWellFormed() || serialized.includes("\uFFFD")) {
    throw new Error("Invalid UTF-8 document");
  }
  if (Buffer.byteLength(serialized, "utf8") > MAX_DOCUMENT_BYTES) throw new Error("Document exceeds 1 MiB");
  if (!serialized.startsWith("---\n")) throw new Error("Missing document frontmatter");
  const end = serialized.indexOf("\n---\n", 4);
  if (end < 0) throw new Error("Missing document frontmatter delimiter");
  const frontmatter = serialized.slice(4, end);
  const metadata = record(JSON.parse(frontmatter), "document metadata");
  if (JSON.stringify(metadata, null, 2) !== frontmatter || Object.hasOwn(metadata, "content_markdown")) {
    throw new Error("Noncanonical document frontmatter");
  }
  if (metadata.hostname !== expected.hostname || category(metadata.category) !== expected.category) {
    throw new Error("Document hostname/category mismatch");
  }
  const title = text(metadata.title, "title");
  const source = sourceUrl(metadata.source_url, expected.hostname);
  if (metadata.id !== `documents:official-web:${sha256(source).slice(0, 24)}`) {
    throw new Error("Document ID does not match source URL");
  }
  if (expected.filename !== `${sha256(metadata.id)}.md`) throw new Error("Document filename mismatch");
  timestamp(metadata.retrieved_at, "retrieved_at");
  if (metadata.source_modified_at !== null) timestamp(metadata.source_modified_at, "source_modified_at");
  for (const field of ["snapshot_sha256", "input_sha256", "body_sha256", "content_sha256"]) {
    digest(metadata[field], field);
  }
  const body = serialized.slice(end + 5);
  if (!body.trim() || /(?![\t\r\n])\p{Cc}/u.test(body)) throw new Error("Invalid Markdown body");
  if (sha256(body) !== metadata.body_sha256 || sha256(`${title}\n${body}`) !== metadata.content_sha256) {
    throw new Error("Document body/content digest mismatch");
  }
  for (const field of ["warnings", "alternate_urls"]) {
    const values = array(metadata[field], field).map((value) => text(value, field));
    if (new Set(values).size !== values.length) throw new Error(`Duplicate ${field}`);
    if (field === "alternate_urls") {
      for (const value of values) {
        sourceUrl(value, expected.hostname);
        if (value === source) throw new Error("Source URL cannot also be an alternate URL");
      }
    }
  }
  const producer = record(metadata.producer, "producer");
  digest(producer.inputs_sha256, "producer inputs");
  const runtime = record(producer.runtime, "producer runtime");
  for (const field of ["node", "icu", "unicode", "platform", "arch"]) text(runtime[field], `runtime ${field}`);
  const routing = record(metadata.routing, "routing");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(text(routing.rule_id, "routing rule_id"))) {
    throw new Error("Invalid routing rule_id");
  }
  digest(routing.policy_sha256, "routing policy");
  validateExtraction(metadata, body, expected.hostname);
  return { ...metadata, content_markdown: body } as unknown as HostDocument;
}

/** Reads declared roots and rejects malformed, missing, duplicate or incomplete host documents. */
export async function* readHostDocuments(store: DataReader): AsyncGenerator<HostDocument> {
  const roots = readRegistry(await store.getJson("official-hosts.json"));
  const ids = new Set<string>();
  for (const root of roots) {
    const filenames = array(await store.list(root.path), `${root.path} entries`);
    if (filenames.length !== root.count) throw new Error(`Root document count mismatch: ${root.path}`);
    const seen = new Set<string>();
    for (const filename of filenames) {
      if (typeof filename !== "string" || !/^[a-f0-9]{64}\.md$/.test(filename)) {
        throw new Error(`Unexpected document entry in ${root.path}: ${String(filename)}`);
      }
      if (seen.has(filename)) throw new Error(`Duplicate document filename: ${root.path}/${filename}`);
      seen.add(filename);
      const key = `${root.path}/${filename}`;
      try {
        const document = parseDocument(await store.getText(key), { ...root, filename });
        if (ids.has(document.id)) throw new Error(`Duplicate document ID: ${document.id}`);
        ids.add(document.id);
        yield document;
      } catch (cause) {
        throw new Error(`Invalid host document ${key}: ${cause instanceof Error ? cause.message : String(cause)}`, {
          cause,
        });
      }
    }
  }
}
