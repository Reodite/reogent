import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAccount, recordTokenUsage } from "./account";

const query = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ getPool: () => ({ query }) }));
beforeEach(() => query.mockReset());

describe("account details", () => {
  it("scopes identity, saved profile, and votes across all rounds to one account", async () => {
    query.mockResolvedValue({
      rows: [
        {
          username: "ada",
          created_at: new Date("2025-09-01T12:00:00Z"),
          profile: { preferred_name: "Ada", program: "Computer Science" },
          tokens_spent: "12345",
          token_tracking_started_at: new Date("2026-10-01T12:00:00Z"),
          pulse_questions_answered: "12",
        },
      ],
    });
    expect(await getAccount("u1")).toEqual({
      username: "ada",
      createdAt: "2025-09-01T12:00:00.000Z",
      profile: { preferred_name: "Ada", program: "Computer Science" },
      tokensSpent: 12345,
      tokenTrackingStartedAt: "2026-10-01T12:00:00.000Z",
      pulseQuestionsAnswered: 12,
    });
    expect(query.mock.calls[0][1]).toEqual(["u1"]);
    const sql = query.mock.calls[0][0];
    expect(sql).toContain("WHERE u.id = $1");
    expect(sql).toContain("LEFT JOIN user_profiles p ON p.user_id = u.id");
    expect(sql).toContain("COUNT(*) FROM pulse_votes WHERE user_id = u.id");
    expect(sql).not.toContain("status = 'active'");
    expect(sql).not.toContain("password_hash");
  });

  it("keeps absent dates and profiles distinct from new accounts with no activity", async () => {
    query.mockResolvedValue({
      rows: [
        {
          username: "new-user",
          created_at: null,
          profile: null,
          tokens_spent: "0",
          token_tracking_started_at: new Date("2026-10-01T12:00:00Z"),
          pulse_questions_answered: "0",
        },
      ],
    });
    expect(await getAccount("u1")).toMatchObject({
      createdAt: null,
      profile: null,
      tokensSpent: 0,
      pulseQuestionsAnswered: 0,
    });
    query.mockResolvedValue({ rows: [] });
    expect(await getAccount("missing")).toBeNull();
  });
});

describe("token persistence", () => {
  it("increments the account counter atomically, independently of saved conversations", async () => {
    query.mockResolvedValue({ rowCount: 1 });
    await recordTokenUsage("u1", 250);
    expect(query).toHaveBeenCalledExactlyOnceWith("UPDATE users SET tokens_spent = tokens_spent + $2 WHERE id = $1", [
      "u1",
      250,
    ]);
  });

  it.each([undefined, 0])("skips unreported or empty usage: %s", async (tokens) => {
    await recordTokenUsage("u1", tokens);
    expect(query).not.toHaveBeenCalled();
  });

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid usage: %s", async (tokens) => {
    await expect(recordTokenUsage("u1", tokens)).rejects.toThrow("Invalid token usage");
    expect(query).not.toHaveBeenCalled();
  });
});
