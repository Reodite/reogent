import { afterEach, describe, expect, it, vi } from "vitest";

async function load() {
  vi.resetModules();
  return import("./search");
}

afterEach(() => vi.unstubAllEnvs());

describe("Meilisearch credentials", () => {
  it("serves requests with the read-only key, never the master key", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MEILI_API_KEY", "read-only");
    vi.stubEnv("MEILI_MASTER_KEY", "master");
    const { getSearch } = await load();
    expect(getSearch().config.apiKey).toBe("read-only");
  });

  it("refuses to fall back to the master key in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MEILI_API_KEY", "");
    vi.stubEnv("MEILI_MASTER_KEY", "master");
    const { getSearch } = await load();
    expect(() => getSearch()).toThrow("MEILI_API_KEY is not set");
  });

  it("falls back to the master key in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("MEILI_API_KEY", "");
    vi.stubEnv("MEILI_MASTER_KEY", "master");
    const { getSearch } = await load();
    expect(getSearch().config.apiKey).toBe("master");
  });

  it("gives operator scripts the master key", async () => {
    vi.stubEnv("MEILI_API_KEY", "read-only");
    vi.stubEnv("MEILI_MASTER_KEY", "master");
    const { getAdminSearch } = await load();
    expect(getAdminSearch().config.apiKey).toBe("master");
  });
});
