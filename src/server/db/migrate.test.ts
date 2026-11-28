import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectDatabase: vi.fn(),
  createIndexes: Array.from({ length: 15 }, () => vi.fn()),
}));
vi.mock("../db", () => ({ connectDatabase: mocks.connectDatabase }));
vi.mock("./models", () => ({
  BuildingFavorite: { createIndexes: mocks.createIndexes[0] },
  Counter: { createIndexes: mocks.createIndexes[1] },
  DegreePlan: { createIndexes: mocks.createIndexes[2] },
  Message: { createIndexes: mocks.createIndexes[3] },
  OAuthAccount: { createIndexes: mocks.createIndexes[4] },
  PulseQuestion: { createIndexes: mocks.createIndexes[5] },
  PulseRound: { createIndexes: mocks.createIndexes[6] },
  PulseVote: { createIndexes: mocks.createIndexes[7] },
  Schedule: { createIndexes: mocks.createIndexes[8] },
  Session: { createIndexes: mocks.createIndexes[9] },
  SharerGroup: { createIndexes: mocks.createIndexes[10] },
  SharerGroupMember: { createIndexes: mocks.createIndexes[11] },
  SharerPerson: { createIndexes: mocks.createIndexes[12] },
  User: { createIndexes: mocks.createIndexes[13] },
  UserProfile: { createIndexes: mocks.createIndexes[14] },
}));

describe("MongoDB startup migration", () => {
  beforeEach(() => {
    mocks.connectDatabase.mockReset().mockResolvedValue(undefined);
    for (const createIndexes of mocks.createIndexes) createIndexes.mockReset().mockResolvedValue(undefined);
  });

  it("connects before creating all required indexes", async () => {
    const { migrate } = await import("./migrate");
    await migrate();
    expect(mocks.connectDatabase).toHaveBeenCalledOnce();
    for (const createIndexes of mocks.createIndexes) expect(createIndexes).toHaveBeenCalledOnce();
  });

  it("rejects startup when an index cannot be created", async () => {
    mocks.createIndexes[2].mockRejectedValueOnce(new Error("index failed"));
    const { migrate } = await import("./migrate");
    await expect(migrate()).rejects.toThrow("index failed");
  });
});
