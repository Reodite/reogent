import { beforeEach, describe, expect, it, vi } from "vitest";
import { migrate } from "./migrate";

const mocks = vi.hoisted(() => ({ poolQuery: vi.fn(), clientQuery: vi.fn(), release: vi.fn() }));

vi.mock("../db", () => ({
  getPool: () => ({
    query: mocks.poolQuery,
    connect: async () => ({ query: mocks.clientQuery, release: mocks.release }),
  }),
}));

beforeEach(() => {
  mocks.poolQuery.mockReset().mockResolvedValue({ rows: [] });
  mocks.clientQuery.mockReset().mockResolvedValue({ rows: [] });
  mocks.release.mockReset();
});

describe("OAuth identity migration", () => {
  it("creates normalized identity tables and backfills Google identities transactionally", async () => {
    await migrate();

    const schema = mocks.poolQuery.mock.calls[0][0] as string;
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS oauth_accounts");
    expect(schema).toContain("UNIQUE (provider, provider_subject)");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS oauth_profiles");
    const usersTable = schema.slice(
      schema.indexOf("CREATE TABLE IF NOT EXISTS users"),
      schema.indexOf("ALTER TABLE users"),
    );
    expect(usersTable).not.toContain("google_sub");
    expect(usersTable).not.toContain("display_name");

    const statements = mocks.clientQuery.mock.calls.map(([sql]) => sql as string);
    expect(statements[0]).toBe("BEGIN");
    expect(statements[1]).toContain("column_name = 'google_sub'");
    expect(statements[1]).toContain("SELECT id, 'google', google_sub, true FROM users WHERE google_sub IS NOT NULL");
    expect(statements[1]).toContain("SELECT oa.id, u.email, u.email IS NOT NULL, u.display_name");
    expect(statements[1]).toContain("ON CONFLICT (provider, provider_subject) DO NOTHING");
    expect(statements[1]).toContain("ON CONFLICT (oauth_account_id) DO NOTHING");
    expect(statements[1]).toContain(
      "ALTER TABLE users DROP COLUMN google_sub, DROP COLUMN email, DROP COLUMN display_name",
    );
    expect(statements[2]).toBe("COMMIT");
    expect(mocks.poolQuery.mock.calls[1][0]).toContain("ALTER TABLE messages DROP COLUMN IF EXISTS tool_calls");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("rolls back the identity backfill if a statement fails", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO oauth_profiles")) throw new Error("identity backfill failed");
      return { rows: [] };
    });

    await expect(migrate()).rejects.toThrow("identity backfill failed");
    expect(mocks.clientQuery.mock.calls.map(([sql]) => sql)).toEqual([
      "BEGIN",
      expect.stringContaining("INSERT INTO oauth_accounts"),
      "ROLLBACK",
    ]);
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.poolQuery).toHaveBeenCalledTimes(1);
  });
});
