import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumeDailyChatMessage, DAILY_CHAT_LIMIT, getAccount, recordTokenUsage } from "./account";

const mocks = vi.hoisted(() => ({
  connectDatabase: vi.fn(),
  userFindById: vi.fn(),
  oauthFindOne: vi.fn(),
  profileFindById: vi.fn(),
  voteCountDocuments: vi.fn(),
  userFindOneAndUpdate: vi.fn(),
  userUpdateOne: vi.fn(),
}));

vi.mock("./db", () => ({ connectDatabase: mocks.connectDatabase }));
vi.mock("./db/models", () => ({
  User: {
    findById: mocks.userFindById,
    findOneAndUpdate: mocks.userFindOneAndUpdate,
    updateOne: mocks.userUpdateOne,
  },
  OAuthAccount: { findOne: mocks.oauthFindOne },
  UserProfile: { findById: mocks.profileFindById },
  PulseVote: { countDocuments: mocks.voteCountDocuments },
}));

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.connectDatabase.mockResolvedValue(undefined);
});

describe("account details", () => {
  it("combines account, verified OAuth profile, saved profile, and vote count", async () => {
    mocks.userFindById.mockReturnValue({
      lean: () => ({
        _id: "u1",
        username: "ada",
        createdAt: new Date("2025-09-01T12:00:00Z"),
        tokensSpent: 12345,
        tokenTrackingStartedAt: new Date("2026-10-01T12:00:00Z"),
      }),
    });
    mocks.oauthFindOne.mockReturnValue({
      sort: () => ({ lean: () => ({ displayName: "Ada Lovelace", email: "ada@example.com", emailVerified: true }) }),
    });
    mocks.profileFindById.mockReturnValue({
      lean: () => ({ data: { preferred_name: "Ada", program: "Computer Science" } }),
    });
    mocks.voteCountDocuments.mockResolvedValue(12);

    await expect(getAccount("u1")).resolves.toEqual({
      username: "ada",
      displayName: "Ada Lovelace",
      email: "ada@example.com",
      createdAt: "2025-09-01T12:00:00.000Z",
      profile: { preferred_name: "Ada", program: "Computer Science" },
      tokensSpent: 12345,
      tokenTrackingStartedAt: "2026-10-01T12:00:00.000Z",
      pulseQuestionsAnswered: 12,
    });
    expect(mocks.connectDatabase).toHaveBeenCalledOnce();
    expect(mocks.oauthFindOne).toHaveBeenCalledWith({ userId: "u1", isPrimary: true });
    expect(mocks.voteCountDocuments).toHaveBeenCalledWith({ userId: "u1" });
  });

  it("returns null when the user no longer exists", async () => {
    mocks.userFindById.mockReturnValue({ lean: () => null });
    await expect(getAccount("missing")).resolves.toBeNull();
    expect(mocks.oauthFindOne).not.toHaveBeenCalled();
  });

  it("hides an unverified OAuth email", async () => {
    mocks.userFindById.mockReturnValue({
      lean: () => ({
        username: "student",
        createdAt: null,
        tokensSpent: 0,
        tokenTrackingStartedAt: new Date("2026-10-01T12:00:00Z"),
      }),
    });
    mocks.oauthFindOne.mockReturnValue({
      sort: () => ({ lean: () => ({ displayName: "Student", email: "private@example.com", emailVerified: false }) }),
    });
    mocks.profileFindById.mockReturnValue({ lean: () => null });
    mocks.voteCountDocuments.mockResolvedValue(0);
    await expect(getAccount("u1")).resolves.toMatchObject({ displayName: "Student", email: null, profile: null });
  });
});

describe("token persistence", () => {
  it("increments the account counter atomically", async () => {
    mocks.userUpdateOne.mockResolvedValue({ matchedCount: 1 });
    await recordTokenUsage("u1", 250);
    expect(mocks.userUpdateOne).toHaveBeenCalledExactlyOnceWith({ _id: "u1" }, { $inc: { tokensSpent: 250 } });
  });

  it.each([undefined, 0])("skips unreported or empty usage: %s", async (tokens) => {
    await recordTokenUsage("u1", tokens);
    expect(mocks.userUpdateOne).not.toHaveBeenCalled();
  });

  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects invalid usage: %s", async (tokens) => {
    await expect(recordTokenUsage("u1", tokens)).rejects.toThrow("Invalid token usage");
    expect(mocks.userUpdateOne).not.toHaveBeenCalled();
  });
});

describe("daily chat allowance", () => {
  it("atomically resets by Vancouver date or increments below the daily limit", async () => {
    mocks.userFindOneAndUpdate.mockReturnValue({ lean: () => ({ _id: "u1" }) });
    expect(await consumeDailyChatMessage("u1")).toBe(true);
    const [filter, update, options] = mocks.userFindOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({
      _id: "u1",
      $or: [{ chatDay: { $ne: expect.any(String) } }, { chatMessages: { $lt: DAILY_CHAT_LIMIT } }],
    });
    expect(update[0].$set.chatMessages.$cond).toEqual([
      { $eq: ["$chatDay", expect.any(String)] },
      { $add: ["$chatMessages", 1] },
      1,
    ]);
    expect(options).toMatchObject({ returnDocument: "after", runValidators: true });
  });

  it("refuses when the limit or account check does not match", async () => {
    mocks.userFindOneAndUpdate.mockReturnValue({ lean: () => null });
    expect(await consumeDailyChatMessage("u1")).toBe(false);
  });
});
