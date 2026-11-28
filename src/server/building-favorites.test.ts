import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ find: vi.fn(), updateOne: vi.fn(), deleteOne: vi.fn() }));
vi.mock("./db/models", () => ({ BuildingFavorite: mocks }));

const { listBuildingFavorites, setBuildingFavorite } = await import("./building-favorites");

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
});

describe("building favorites store", () => {
  it("lists the caller's codes in recent-save order", async () => {
    mocks.find.mockReturnValue({
      sort: () => ({ lean: async () => [{ buildingCode: "IBLC" }, { buildingCode: "NEST" }] }),
    });
    expect(await listBuildingFavorites("user-1")).toEqual(["IBLC", "NEST"]);
    expect(mocks.find).toHaveBeenCalledWith({ userId: "user-1" });
  });

  it("upserts idempotently before returning the current set", async () => {
    mocks.updateOne.mockResolvedValue(undefined);
    mocks.find.mockReturnValue({ sort: () => ({ lean: async () => [{ buildingCode: "IBLC" }] }) });
    expect(await setBuildingFavorite("user-1", "IBLC", true)).toEqual(["IBLC"]);
    expect(mocks.updateOne).toHaveBeenCalledWith(
      { userId: "user-1", buildingCode: "IBLC" },
      { $setOnInsert: { createdAt: expect.any(Date) } },
      { upsert: true },
    );
  });

  it("removes only the caller's building association", async () => {
    mocks.deleteOne.mockResolvedValue({ deletedCount: 1 });
    mocks.find.mockReturnValue({ sort: () => ({ lean: async () => [] }) });
    expect(await setBuildingFavorite("user-2", "CHEM", false)).toEqual([]);
    expect(mocks.deleteOne).toHaveBeenCalledWith({ userId: "user-2", buildingCode: "CHEM" });
  });
});
