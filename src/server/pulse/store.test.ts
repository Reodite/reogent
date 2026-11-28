import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectDatabase: vi.fn(),
  roundFindOne: vi.fn(),
  roundFind: vi.fn(),
  roundFindById: vi.fn(),
  roundUpdateOne: vi.fn(),
  roundFindOneAndUpdate: vi.fn(),
  roundCreate: vi.fn(),
  roundStartSession: vi.fn(),
  questionFind: vi.fn(),
  questionFindById: vi.fn(),
  questionInsertMany: vi.fn(),
  voteAggregate: vi.fn(),
  voteFind: vi.fn(),
  voteFindOne: vi.fn(),
  voteCreate: vi.fn(),
  voteStartSession: vi.fn(),
  counterFindOneAndUpdate: vi.fn(),
}));
const mongoSession = {
  withTransaction: vi.fn(async (callback: () => Promise<void>) => callback()),
  endSession: vi.fn(),
};
vi.mock("../db", () => ({ connectDatabase: mocks.connectDatabase }));
vi.mock("../db/models", () => ({
  PulseRound: {
    findOne: mocks.roundFindOne,
    find: mocks.roundFind,
    findById: mocks.roundFindById,
    updateOne: mocks.roundUpdateOne,
    findOneAndUpdate: mocks.roundFindOneAndUpdate,
    create: mocks.roundCreate,
    startSession: mocks.roundStartSession,
  },
  PulseQuestion: { find: mocks.questionFind, findById: mocks.questionFindById, insertMany: mocks.questionInsertMany },
  PulseVote: {
    aggregate: mocks.voteAggregate,
    find: mocks.voteFind,
    findOne: mocks.voteFindOne,
    create: mocks.voteCreate,
    startSession: mocks.voteStartSession,
  },
  Counter: { findOneAndUpdate: mocks.counterFindOneAndUpdate },
}));

function lean(value: unknown) {
  return { lean: async () => value };
}

function sessionLean(value: unknown) {
  return { session: () => lean(value) };
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.connectDatabase.mockResolvedValue(undefined);
  mocks.voteStartSession.mockResolvedValue(mongoSession);
  mocks.roundStartSession.mockResolvedValue(mongoSession);
  mongoSession.withTransaction.mockReset().mockImplementation(async (callback) => callback());
  mongoSession.endSession.mockReset().mockResolvedValue(undefined);
});

describe("getActiveFeed", () => {
  it("returns no questions when no round is active", async () => {
    mocks.roundFindOne.mockReturnValue(lean(null));
    await expect((await import("./store")).getActiveFeed("u1")).resolves.toEqual({ round: null, questions: [] });
  });

  it("returns questions in seed order with caller votes and tallies", async () => {
    mocks.roundFindOne.mockReturnValue(
      lean({ _id: 3, title: "Week 1", publishedAt: new Date("2026-08-25T00:00:00Z") }),
    );
    mocks.questionFind.mockReturnValue({
      sort: () =>
        sessionLean([
          { _id: 10, roundId: 3, text: "Q1" },
          { _id: 11, roundId: 3, text: "Q2" },
        ]),
    });
    mocks.voteAggregate.mockReturnValue({
      session: () =>
        Promise.resolve([
          { _id: { questionId: 10, agree: true }, count: 6 },
          { _id: { questionId: 10, agree: false }, count: 4 },
          { _id: { questionId: 11, agree: true }, count: 1 },
        ]),
    });
    mocks.voteFind.mockReturnValue(sessionLean([{ questionId: 10, agree: true, userId: "u1" }]));
    const { getActiveFeed } = await import("./store");
    await expect(getActiveFeed("u1")).resolves.toEqual({
      round: { id: 3, title: "Week 1", publishedAt: "2026-08-25T00:00:00.000Z" },
      questions: [
        { id: 10, text: "Q1", myAgree: true, agreeCount: 6, disagreeCount: 4 },
        { id: 11, text: "Q2", myAgree: null, agreeCount: 1, disagreeCount: 0 },
      ],
    });
    expect(mocks.questionFind).toHaveBeenCalledWith({ roundId: { $in: [3] } });
    expect(mocks.voteFind).toHaveBeenCalledWith({ questionId: { $in: [10, 11] }, userId: "u1" });
  });
});

describe("getRoundHistory", () => {
  it("returns no history without querying questions when no round is locked", async () => {
    mocks.roundFind.mockReturnValue({ sort: () => ({ limit: () => sessionLean([]) }) });
    const { getRoundHistory } = await import("./store");
    await expect(getRoundHistory("u1", 5)).resolves.toEqual([]);
    expect(mocks.roundFind).toHaveBeenCalledWith({ status: "locked" });
    expect(mocks.questionFind).not.toHaveBeenCalled();
  });

  it("groups ordered questions under newest locked rounds", async () => {
    const rounds = [
      { _id: 2, title: "Week 2", publishedAt: new Date("2026-08-20T00:00:00Z") },
      { _id: 1, title: null, publishedAt: new Date("2026-08-13T00:00:00Z") },
    ];
    mocks.roundFind.mockReturnValue({ sort: () => ({ limit: () => sessionLean(rounds) }) });
    mocks.questionFind.mockImplementation(({ roundId: { $in: roundIds } }: { roundId: { $in: number[] } }) => ({
      sort: () =>
        sessionLean([
          ...(roundIds.includes(1) ? [{ _id: 10, roundId: 1, text: "Old" }] : []),
          ...(roundIds.includes(2)
            ? [
                { _id: 20, roundId: 2, text: "New A" },
                { _id: 21, roundId: 2, text: "New B" },
              ]
            : []),
        ]),
    }));
    mocks.voteAggregate.mockImplementation(([match]) => ({
      session: async () => {
        const ids = match.$match.questionId.$in as number[];
        return ids[0] === 10
          ? [
              { _id: { questionId: 10, agree: true }, count: 3 },
              { _id: { questionId: 10, agree: false }, count: 1 },
            ]
          : [];
      },
    }));
    mocks.voteFind.mockImplementation((filter: { questionId: { $in: number[] } }) =>
      sessionLean(filter.questionId.$in.includes(20) ? [{ questionId: 20, agree: false }] : []),
    );
    const { getRoundHistory } = await import("./store");
    await expect(getRoundHistory("u1", 5)).resolves.toEqual([
      {
        round: { id: 2, title: "Week 2", publishedAt: "2026-08-20T00:00:00.000Z" },
        questions: [
          { id: 20, text: "New A", myAgree: false, agreeCount: 0, disagreeCount: 0 },
          { id: 21, text: "New B", myAgree: null, agreeCount: 0, disagreeCount: 0 },
        ],
      },
      {
        round: { id: 1, title: null, publishedAt: "2026-08-13T00:00:00.000Z" },
        questions: [{ id: 10, text: "Old", myAgree: null, agreeCount: 3, disagreeCount: 1 }],
      },
    ]);
    expect(mongoSession.withTransaction).toHaveBeenCalledWith(expect.any(Function), {
      readConcern: { level: "snapshot" },
    });
  });
});

describe("castVote", () => {
  it("returns the first stored direction and fresh tallies", async () => {
    mocks.questionFindById.mockReturnValue({ session: () => lean({ _id: 10, roundId: 3 }) });
    mocks.roundFindById.mockReturnValue({ session: () => lean({ _id: 3, status: "active" }) });
    mocks.roundUpdateOne.mockResolvedValue({ matchedCount: 1 });
    mocks.voteCreate.mockResolvedValue([{ questionId: 10, userId: "u1", agree: true }]);
    mocks.voteFindOne.mockReturnValue(lean({ agree: true }));
    mocks.voteAggregate.mockResolvedValue([
      { _id: true, count: 7 },
      { _id: false, count: 2 },
    ]);
    const { castVote } = await import("./store");
    await expect(castVote("u1", 10, true)).resolves.toEqual({ agree: true, agreeCount: 7, disagreeCount: 2 });
    expect(mocks.roundUpdateOne).toHaveBeenCalledWith(
      { _id: 3, status: "active" },
      { $inc: { voteRevision: 1 } },
      { session: mongoSession },
    );
    expect(mongoSession.withTransaction).toHaveBeenCalledOnce();
  });

  it("retries a transient vote transaction conflict", async () => {
    mocks.questionFindById.mockReturnValue({ session: () => lean({ _id: 10, roundId: 3 }) });
    mocks.roundFindById.mockReturnValue({ session: () => lean({ _id: 3, status: "active" }) });
    mocks.roundUpdateOne.mockResolvedValue({ matchedCount: 1 });
    mocks.voteCreate.mockResolvedValue([{ questionId: 10, userId: "u1", agree: true }]);
    mocks.voteFindOne.mockReturnValue(lean({ agree: true }));
    mocks.voteAggregate.mockResolvedValue([{ _id: true, count: 1 }]);
    mongoSession.withTransaction
      .mockRejectedValueOnce({ code: 112 })
      .mockImplementationOnce(async (callback) => callback());

    const { castVote } = await import("./store");
    await expect(castVote("u1", 10, true)).resolves.toEqual({ agree: true, agreeCount: 1, disagreeCount: 0 });
    expect(mongoSession.withTransaction).toHaveBeenCalledTimes(2);
    expect(mongoSession.endSession).toHaveBeenCalledTimes(2);
  });

  it("returns the previously stored direction when a duplicate submission races", async () => {
    mocks.questionFindById.mockReturnValue({ session: () => lean({ _id: 10, roundId: 3 }) });
    mocks.roundFindById.mockReturnValue({ session: () => lean({ _id: 3, status: "active" }) });
    mocks.roundUpdateOne.mockResolvedValue({ matchedCount: 1 });
    mocks.voteCreate.mockRejectedValueOnce({ code: 11000, keyValue: { questionId: 10, userId: "u1" } });
    mocks.voteFindOne.mockReturnValue(lean({ agree: false }));
    mocks.voteAggregate.mockResolvedValue([
      { _id: true, count: 7 },
      { _id: false, count: 3 },
    ]);
    const { castVote } = await import("./store");
    await expect(castVote("u1", 10, true)).resolves.toEqual({ agree: false, agreeCount: 7, disagreeCount: 3 });
  });

  it("returns null for unknown questions and locked rounds", async () => {
    mocks.questionFindById.mockReturnValue({ session: () => lean(null) });
    mocks.voteFindOne.mockReturnValue(lean(null));
    const { castVote } = await import("./store");
    await expect(castVote("u1", 99, true)).resolves.toBeNull();
    mocks.questionFindById.mockReturnValue({ session: () => lean({ _id: 10, roundId: 3 }) });
    mocks.roundFindById.mockReturnValue({ session: () => lean({ _id: 3, status: "locked" }) });
    mocks.roundUpdateOne.mockResolvedValue({ matchedCount: 0 });
    mocks.voteFindOne.mockReturnValue(lean(null));
    await expect(castVote("u1", 10, true)).resolves.toBeNull();
  });

  it("rechecks round status when a vote transaction callback retries", async () => {
    mocks.questionFindById.mockReturnValue({ session: () => lean({ _id: 10, roundId: 3 }) });
    mocks.roundFindById
      .mockReturnValueOnce({ session: () => lean({ _id: 3, status: "active" }) })
      .mockReturnValueOnce({ session: () => lean({ _id: 3, status: "locked" }) });
    mocks.roundUpdateOne.mockResolvedValue({ matchedCount: 0 });
    mongoSession.withTransaction.mockImplementation(async (callback) => {
      await callback();
      await callback();
    });
    mocks.voteFindOne.mockReturnValue(lean(null));
    const { castVote } = await import("./store");
    await expect(castVote("u1", 10, true)).resolves.toBeNull();
    expect(mocks.roundUpdateOne).toHaveBeenCalledOnce();
    expect(mocks.voteCreate).not.toHaveBeenCalled();
  });

  it("does not recover an unrelated duplicate key as an existing vote", async () => {
    mocks.questionFindById.mockReturnValue({ session: () => lean({ _id: 10, roundId: 3 }) });
    mocks.roundFindById.mockReturnValue({ session: () => lean({ _id: 3, status: "active" }) });
    mocks.roundUpdateOne.mockResolvedValue({ matchedCount: 1 });
    const conflict = { code: 11000, keyValue: { _id: "other" } };
    mocks.voteCreate.mockRejectedValueOnce(conflict);
    const { castVote } = await import("./store");
    await expect(castVote("u1", 10, true)).rejects.toMatchObject(conflict);
    expect(mocks.voteFindOne).not.toHaveBeenCalled();
  });
});

describe("publishRound", () => {
  it("retries a transient publish transaction conflict", async () => {
    mocks.roundFindOneAndUpdate.mockReturnValue(lean({ _id: 2 }));
    mocks.counterFindOneAndUpdate.mockReturnValueOnce(lean({ value: 3 }));
    mocks.roundCreate.mockResolvedValue([{ _id: 3 }]);
    mongoSession.withTransaction
      .mockRejectedValueOnce({ code: 112 })
      .mockImplementationOnce(async (callback) => callback());

    const { publishRound } = await import("./store");
    await expect(publishRound({ title: "Week 3", questions: [] })).resolves.toEqual({
      lockedRoundId: 2,
      roundId: 3,
    });
    expect(mongoSession.withTransaction).toHaveBeenCalledTimes(2);
    expect(mocks.roundCreate).toHaveBeenCalledOnce();
    expect(mongoSession.endSession).toHaveBeenCalledTimes(2);
  });

  it("locks the active round and inserts a new round with questions in one transaction", async () => {
    mocks.roundFindOneAndUpdate.mockReturnValue(lean({ _id: 2 }));
    mocks.counterFindOneAndUpdate.mockReturnValueOnce(lean({ value: 3 })).mockReturnValueOnce(lean({ value: 2 }));
    mocks.roundCreate.mockResolvedValue([{ _id: 3 }]);
    mocks.questionInsertMany.mockResolvedValue([]);
    const { publishRound } = await import("./store");
    await expect(publishRound({ title: "Week 3", questions: ["A", "B"] })).resolves.toEqual({
      lockedRoundId: 2,
      roundId: 3,
    });
    expect(mocks.roundFindOneAndUpdate).toHaveBeenCalledWith(
      { status: "active" },
      { $set: { status: "locked", lockedAt: expect.any(Date) } },
      { returnDocument: "after", session: mongoSession },
    );
    expect(mocks.counterFindOneAndUpdate.mock.calls[0][2]).toMatchObject({ updatePipeline: true });
    expect(mocks.counterFindOneAndUpdate.mock.calls[0][1]).toEqual([
      { $set: { value: { $add: [{ $ifNull: ["$value", 0] }, 1] } } },
    ]);
    expect(mocks.questionInsertMany).toHaveBeenCalledWith(
      [
        { _id: 1, roundId: 3, position: 0, text: "A" },
        { _id: 2, roundId: 3, position: 1, text: "B" },
      ],
      { session: mongoSession },
    );
    expect(mongoSession.withTransaction).toHaveBeenCalledOnce();
  });

  it("reports no locked round on the first publish", async () => {
    mocks.roundFindOneAndUpdate.mockReturnValue(lean(null));
    mocks.counterFindOneAndUpdate.mockReturnValueOnce(lean({ value: 1 }));
    mocks.roundCreate.mockResolvedValue([{ _id: 1 }]);
    const { publishRound } = await import("./store");
    await expect(publishRound({ title: null, questions: [] })).resolves.toEqual({ lockedRoundId: null, roundId: 1 });
  });

  it("starts pulse question IDs at one when counters are absent", async () => {
    mocks.roundFindOneAndUpdate.mockReturnValue(lean(null));
    mocks.counterFindOneAndUpdate.mockReturnValueOnce(lean({ value: 1 })).mockReturnValueOnce(lean({ value: 2 }));
    mocks.roundCreate.mockResolvedValue([{ _id: 1 }]);
    mocks.questionInsertMany.mockResolvedValue([]);
    const { publishRound } = await import("./store");
    await expect(publishRound({ title: null, questions: ["A", "B"] })).resolves.toEqual({
      lockedRoundId: null,
      roundId: 1,
    });
    expect(mocks.questionInsertMany).toHaveBeenCalledWith(
      [
        { _id: 1, roundId: 1, position: 0, text: "A" },
        { _id: 2, roundId: 1, position: 1, text: "B" },
      ],
      { session: mongoSession },
    );
    expect(mocks.counterFindOneAndUpdate.mock.calls[1][2]).toMatchObject({ updatePipeline: true });
  });

  it("propagates transaction failures and ends the session", async () => {
    mongoSession.withTransaction.mockRejectedValueOnce(new Error("boom"));
    const { publishRound } = await import("./store");
    await expect(publishRound({ title: null, questions: ["A"] })).rejects.toThrow("boom");
    expect(mongoSession.endSession).toHaveBeenCalledOnce();
  });
});
