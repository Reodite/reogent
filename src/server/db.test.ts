import { afterEach, describe, expect, it, vi } from "vitest";

const pools = vi.hoisted(() => ({ created: [] as Array<Record<string, unknown>> }));

vi.mock("pg", () => ({
  default: {
    Pool: class {
      constructor(options: Record<string, unknown>) {
        pools.created.push(options);
      }
    },
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  pools.created.length = 0;
});

describe("database connection pool", () => {
  it("uses bounded defaults", async () => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "postgres://localhost/reodite");
    const { getPool } = await import("./db");

    getPool();

    expect(pools.created).toEqual([
      { connectionString: "postgres://localhost/reodite", max: 10, connectionTimeoutMillis: 10_000 },
    ]);
  });

  it("accepts configured pool bounds", async () => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "postgres://localhost/reodite");
    vi.stubEnv("DB_POOL_MAX", "4");
    vi.stubEnv("DB_POOL_TIMEOUT_MS", "2500");
    const { getPool } = await import("./db");

    getPool();

    expect(pools.created[0]).toMatchObject({ max: 4, connectionTimeoutMillis: 2500 });
  });

  it.each(["0", "1.5", "2147483648"])("rejects invalid timeout %s", async (value) => {
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", "postgres://localhost/reodite");
    vi.stubEnv("DB_POOL_TIMEOUT_MS", value);
    const { getPool } = await import("./db");

    expect(() => getPool()).toThrow("DB_POOL_TIMEOUT_MS must be an integer");
    expect(pools.created).toHaveLength(0);
  });
});
