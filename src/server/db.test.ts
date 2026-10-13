import { once } from "node:events";
import { createServer, type Socket } from "node:net";
import type pg from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let pool: pg.Pool | undefined;

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", "postgres://test:test@127.0.0.1:1/test");
  vi.stubEnv("DB_POOL_MAX", undefined);
  vi.stubEnv("DB_POOL_TIMEOUT_MS", undefined);
});

afterEach(async () => {
  if (pool && !pool.ending) await pool.end();
  pool = undefined;
  vi.unstubAllEnvs();
});

describe("shared database pool", () => {
  it("reuses one bounded pool with default limits", async () => {
    const { getPool } = await import("./db");
    pool = getPool();
    expect(pool.options).toMatchObject({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      connectionTimeoutMillis: 5000,
    });
    vi.stubEnv("DB_POOL_MAX", "3");
    expect(getPool()).toBe(pool);
    expect(pool.options.max).toBe(10);
  });

  it("uses explicitly configured limits", async () => {
    vi.stubEnv("DB_POOL_MAX", "3");
    vi.stubEnv("DB_POOL_TIMEOUT_MS", "2147483647");
    const { getPool } = await import("./db");
    pool = getPool();
    expect(pool.options).toMatchObject({ max: 3, connectionTimeoutMillis: 2147483647 });
  });

  it.each([
    ["DB_POOL_MAX", "0"],
    ["DB_POOL_TIMEOUT_MS", "2147483648"],
  ])("rejects invalid %s=%j before creating the pool", async (name, value) => {
    vi.stubEnv(name, value);
    const { getPool } = await import("./db");
    expect(() => getPool()).toThrow(name);
    vi.stubEnv(name, "1");
    pool = getPool();
    expect(pool).toBeDefined();
  });

  it("requires a database URL", async () => {
    vi.stubEnv("DATABASE_URL", undefined);
    const { getPool } = await import("./db");
    expect(() => getPool()).toThrow("DATABASE_URL");
  });

  it("times out a nonresponsive TCP connection without retrying", async () => {
    const sockets = new Set<Socket>();
    let connections = 0;
    const server = createServer((socket) => {
      connections++;
      sockets.add(socket);
      socket.on("close", () => sockets.delete(socket));
      socket.resume();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected a TCP address");
    vi.stubEnv("DATABASE_URL", `postgres://test:test@127.0.0.1:${address.port}/test?sslmode=disable`);
    vi.stubEnv("DB_POOL_MAX", "1");
    vi.stubEnv("DB_POOL_TIMEOUT_MS", "50");
    const { getPool } = await import("./db");
    pool = getPool();
    let watchdog: NodeJS.Timeout | undefined;
    const acquisition = pool.connect().then(
      (client) => {
        client.release();
        return undefined;
      },
      (error: Error) => error,
    );
    try {
      const result = await Promise.race([
        acquisition,
        new Promise<never>((_, reject) => {
          watchdog = setTimeout(() => reject(new Error("Acquisition did not time out")), 1000);
        }),
      ]);
      expect(result).toBeInstanceOf(Error);
      expect(result?.message).toMatch(/connection timeout/);
      expect(connections).toBe(1);
      expect(pool.totalCount).toBe(0);
      expect(pool.waitingCount).toBe(0);
    } finally {
      clearTimeout(watchdog);
      const ending = pool.end();
      for (const socket of sockets) socket.destroy();
      await acquisition;
      await ending;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
