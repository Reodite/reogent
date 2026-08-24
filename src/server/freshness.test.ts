import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { getIndexFreshness, recordIndexFreshness } from "./freshness";

describe("dataset freshness manifest", () => {
  beforeEach(() => {
    process.env.DATA_PATH = mkdtempSync(join(tmpdir(), "fresh-"));
  });

  it("records and reads back per-index timestamps", async () => {
    expect(await getIndexFreshness("courses")).toBeNull();
    const at = new Date("2026-08-24T12:00:00Z");
    await recordIndexFreshness("courses", at);
    expect(await getIndexFreshness("courses")).toBe(at.toISOString());
    expect(await getIndexFreshness("tuition")).toBeNull();
  });

  it("survives a cache-expiring read from disk", async () => {
    await recordIndexFreshness("tuition", new Date("2026-08-01T00:00:00Z"));
    // Freshness cache is module-level; a second record still lands.
    await recordIndexFreshness("tuition", new Date("2026-08-02T00:00:00Z"));
    expect(await getIndexFreshness("tuition")).toBe("2026-08-02T00:00:00.000Z");
  });
});
