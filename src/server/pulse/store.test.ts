import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
const clientQueryMock = vi.hoisted(() => vi.fn());
const releaseMock = vi.hoisted(() => vi.fn());
vi.mock("../db", () => ({
  getPool: () => ({
    query: queryMock,
    connect: async () => ({ query: clientQueryMock, release: releaseMock }),
  }),
}));

const { castVote, getActiveFeed, getRoundHistory, publishRound } = await import("./store");

beforeEach(() => {
  queryMock.mockReset();
  clientQueryMock.mockReset();
  releaseMock.mockReset();
});

describe("getActiveFeed", () => {
  it("returns a null round and no questions when no round is active", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    expect(await getActiveFeed("u1")).toEqual({ round: null, questions: [] });
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("returns questions in seed order with the caller's vote and tallies", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ id: 3, title: "Week 1", published_at: new Date("2026-08-25T00:00:00Z") }],
    });
    queryMock.mockResolvedValueOnce({
      rows: [
        { id: 10, text: "Q1", my_agree: true, agree_count: 6, disagree_count: 4 },
        { id: 11, text: "Q2", my_agree: null, agree_count: 1, disagree_count: 0 },
      ],
    });
    const feed = await getActiveFeed("u1");
    expect(feed.round).toEqual({ id: 3, title: "Week 1", publishedAt: "2026-08-25T00:00:00.000Z" });
    expect(feed.questions).toEqual([
      { id: 10, text: "Q1", myAgree: true, agreeCount: 6, disagreeCount: 4 },
      { id: 11, text: "Q2", myAgree: null, agreeCount: 1, disagreeCount: 0 },
    ]);
    // The question query scopes to the active round and the caller.
    expect(queryMock.mock.calls[1][1]).toEqual([3, "u1"]);
  });
});

describe("getRoundHistory", () => {
  it("returns an empty list without querying questions when no round is locked", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    expect(await getRoundHistory("u1")).toEqual([]);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0][0]).toContain("status = 'locked'");
    expect(queryMock.mock.calls[0][1]).toEqual([10]);
  });

  it("groups questions under their round, newest round first, with the caller's vote", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { id: 2, title: "Week 2", published_at: new Date("2026-08-20T00:00:00Z") },
        { id: 1, title: null, published_at: new Date("2026-08-13T00:00:00Z") },
      ],
    });
    queryMock.mockResolvedValueOnce({
      rows: [
        { round_id: 1, id: 10, text: "Old", my_agree: null, agree_count: 3, disagree_count: 1 },
        { round_id: 2, id: 20, text: "New A", my_agree: false, agree_count: 6, disagree_count: 4 },
        { round_id: 2, id: 21, text: "New B", my_agree: null, agree_count: 0, disagree_count: 0 },
      ],
    });
    const history = await getRoundHistory("u1", 5);
    expect(history).toEqual([
      {
        round: { id: 2, title: "Week 2", publishedAt: "2026-08-20T00:00:00.000Z" },
        questions: [
          { id: 20, text: "New A", myAgree: false, agreeCount: 6, disagreeCount: 4 },
          { id: 21, text: "New B", myAgree: null, agreeCount: 0, disagreeCount: 0 },
        ],
      },
      {
        round: { id: 1, title: null, publishedAt: "2026-08-13T00:00:00.000Z" },
        questions: [{ id: 10, text: "Old", myAgree: null, agreeCount: 3, disagreeCount: 1 }],
      },
    ]);
    expect(queryMock.mock.calls[0][1]).toEqual([5]);
    // The question query scopes to the listed rounds and the caller.
    expect(queryMock.mock.calls[1][1]).toEqual([[2, 1], "u1"]);
  });
});

describe("castVote", () => {
  it("returns the stored vote and tallies after a guarded insert", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    queryMock.mockResolvedValueOnce({ rows: [{ my_agree: true, agree_count: 7, disagree_count: 2 }] });
    expect(await castVote("u1", 10, true)).toEqual({ agree: true, agreeCount: 7, disagreeCount: 2 });
    expect(queryMock.mock.calls[0][0]).toContain("r.status = 'active'");
    expect(queryMock.mock.calls[0][0]).toContain("ON CONFLICT (question_id, user_id) DO NOTHING");
    expect(queryMock.mock.calls[0][1]).toEqual([10, "u1", true]);
  });

  it("returns the stored direction when the caller already voted the other way", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    queryMock.mockResolvedValueOnce({ rows: [{ my_agree: false, agree_count: 7, disagree_count: 3 }] });
    expect(await castVote("u1", 10, true)).toEqual({ agree: false, agreeCount: 7, disagreeCount: 3 });
  });

  it("returns null when no vote is stored (locked round or unknown question)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    queryMock.mockResolvedValueOnce({ rows: [{ my_agree: null, agree_count: 5, disagree_count: 5 }] });
    expect(await castVote("u1", 10, true)).toBeNull();
  });
});

describe("publishRound", () => {
  it("locks the active round and inserts the new round and questions in one transaction", async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith("UPDATE pulse_rounds")) return { rows: [{ id: 2 }] };
      if (sql.startsWith("INSERT INTO pulse_rounds")) return { rows: [{ id: 3 }] };
      return { rows: [] };
    });
    const result = await publishRound({ title: "Week 3", questions: ["A", "B"] });
    expect(result).toEqual({ lockedRoundId: 2, roundId: 3 });
    const statements = clientQueryMock.mock.calls.map((c) => (c[0] as string).split(" ", 3).join(" "));
    expect(statements).toEqual([
      "BEGIN",
      "UPDATE pulse_rounds SET",
      "INSERT INTO pulse_rounds",
      "INSERT INTO pulse_questions",
      "INSERT INTO pulse_questions",
      "COMMIT",
    ]);
    // Question inserts carry the new round id and 0-based seed positions.
    expect(clientQueryMock.mock.calls[3][1]).toEqual([3, 0, "A"]);
    expect(clientQueryMock.mock.calls[4][1]).toEqual([3, 1, "B"]);
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it("reports no locked round on first publish", async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith("UPDATE pulse_rounds")) return { rows: [] };
      if (sql.startsWith("INSERT INTO pulse_rounds")) return { rows: [{ id: 1 }] };
      return { rows: [] };
    });
    expect(await publishRound({ title: null, questions: ["A"] })).toEqual({ lockedRoundId: null, roundId: 1 });
  });

  it("rolls back and releases the client when an insert fails", async () => {
    clientQueryMock.mockImplementation(async (sql: string) => {
      if (sql.startsWith("UPDATE pulse_rounds")) return { rows: [{ id: 2 }] };
      if (sql.startsWith("INSERT INTO pulse_rounds")) throw new Error("boom");
      return { rows: [] };
    });
    await expect(publishRound({ title: null, questions: ["A"] })).rejects.toThrow("boom");
    const statements = clientQueryMock.mock.calls.map((c) => c[0] as string);
    expect(statements[statements.length - 1]).toBe("ROLLBACK");
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });
});
