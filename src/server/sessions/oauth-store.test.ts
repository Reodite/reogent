import { beforeEach, describe, expect, it, vi } from "vitest";
import { findOrCreateOAuthUser } from "./store";

const mocks = vi.hoisted(() => ({ poolQuery: vi.fn(), clientQuery: vi.fn(), release: vi.fn() }));
vi.mock("../db", () => ({
  getPool: () => ({
    query: mocks.poolQuery,
    connect: async () => ({ query: mocks.clientQuery, release: mocks.release }),
  }),
}));

beforeEach(() => {
  mocks.poolQuery.mockReset();
  mocks.clientQuery.mockReset().mockResolvedValue({ rows: [] });
  mocks.release.mockReset();
});

describe("provider-neutral account persistence", () => {
  it("updates claims on the existing provider identity and retains its user UUID", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SELECT u.id, u.username")) return { rows: [{ id: "user-1", username: "ada-1234" }] };
      return { rows: [] };
    });

    await expect(
      findOrCreateOAuthUser("google", "subject-1", {
        email: "ada@example.com",
        emailVerified: true,
        displayName: "Ada Lovelace",
        avatarUrl: "https://images.example/ada.png",
      }),
    ).resolves.toEqual({ id: "user-1", username: "ada-1234" });

    expect(mocks.clientQuery.mock.calls[0][0]).toBe("BEGIN");
    expect(mocks.clientQuery.mock.calls[1][0]).toContain("pg_advisory_xact_lock");
    expect(mocks.clientQuery.mock.calls[2][1]).toEqual(["google", "subject-1"]);
    expect(mocks.clientQuery.mock.calls[3][0]).toContain("INSERT INTO oauth_profiles");
    expect(mocks.clientQuery.mock.calls[3][0]).toContain("email = COALESCE(EXCLUDED.email, oauth_profiles.email)");
    expect(mocks.clientQuery.mock.calls[3][0]).toContain(
      "CASE WHEN EXCLUDED.email IS NULL THEN oauth_profiles.email_verified",
    );
    expect(mocks.clientQuery.mock.calls[3][1]).toEqual([
      "google",
      "subject-1",
      "ada@example.com",
      true,
      "Ada Lovelace",
      "https://images.example/ada.png",
    ]);
    expect(mocks.clientQuery.mock.calls.at(-1)?.[0]).toBe("COMMIT");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("creates a user and provider account with one primary identity", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO users")) return { rows: [{ id: "user-2", username: "ada-lovelace-4721" }] };
      return { rows: [] };
    });

    await expect(findOrCreateOAuthUser("microsoft", "subject-2", { displayName: "Ada Lovelace" })).resolves.toEqual({
      id: "user-2",
      username: "ada-lovelace-4721",
    });

    expect(mocks.clientQuery.mock.calls[3][0]).toContain("INSERT INTO users (username)");
    expect(mocks.clientQuery.mock.calls[4][0]).toContain("INSERT INTO oauth_accounts");
    expect(mocks.clientQuery.mock.calls[4][0]).toContain("true");
    expect(mocks.clientQuery.mock.calls[4][1]).toEqual(["user-2", "microsoft", "subject-2"]);
    expect(mocks.clientQuery.mock.calls[5][1]).toEqual(["microsoft", "subject-2", null, false, "Ada Lovelace", null]);
    expect(mocks.clientQuery.mock.calls.at(-1)?.[0]).toBe("COMMIT");
  });

  it("retries internal handle collisions without linking by email", async () => {
    let userInsert = 0;
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO users")) {
        userInsert++;
        return userInsert === 1 ? { rows: [] } : { rows: [{ id: "user-3", username: "student-4721" }] };
      }
      return { rows: [] };
    });

    await findOrCreateOAuthUser("apple", "subject-3", { email: "same@example.com", emailVerified: true });

    expect(userInsert).toBe(2);
    expect(mocks.clientQuery.mock.calls[3][1][0]).toMatch(/^apple-\d{4}$/);
    expect(mocks.clientQuery.mock.calls[4][1][0]).toMatch(/^apple-\d{4}$/);
    expect(mocks.clientQuery.mock.calls[5][1]).toEqual(["user-3", "apple", "subject-3"]);
  });

  it("rolls back and releases the transaction when account persistence fails", async () => {
    mocks.clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("INSERT INTO oauth_accounts")) throw new Error("account insert failed");
      if (sql.includes("INSERT INTO users")) return { rows: [{ id: "user-4", username: "student-4721" }] };
      return { rows: [] };
    });

    await expect(findOrCreateOAuthUser("google", "subject-4", {})).rejects.toThrow("account insert failed");
    expect(mocks.clientQuery.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it.each([
    ["invalid provider", "Google", "subject", {}],
    ["empty subject", "google", " ", {}],
    ["oversized display name", "google", "subject", { displayName: "x".repeat(201) }],
    ["non-HTTPS avatar", "google", "subject", { avatarUrl: "http://images.example/avatar.png" }],
  ])("rejects %s before opening a transaction", async (_label, provider, subject, profile) => {
    await expect(findOrCreateOAuthUser(provider, subject, profile)).rejects.toThrow();
    expect(mocks.clientQuery).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });
});
