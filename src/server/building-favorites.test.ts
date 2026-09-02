import { beforeEach, describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ getPool: () => ({ query }) }));

const { listBuildingFavorites, setBuildingFavorite } = await import("./building-favorites");

beforeEach(() => {
  query.mockReset();
});

describe("building favorites store", () => {
  it("lists the caller's codes in recent-save order", async () => {
    query.mockResolvedValue({ rows: [{ building_code: "IBLC" }, { building_code: "NEST" }] });

    expect(await listBuildingFavorites("user-1")).toEqual(["IBLC", "NEST"]);
    expect(query.mock.calls[0][0]).toContain("ORDER BY created_at DESC");
    expect(query.mock.calls[0][1]).toEqual(["user-1"]);
  });

  it("saves idempotently before returning the current set", async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ building_code: "IBLC" }] });

    expect(await setBuildingFavorite("user-1", "IBLC", true)).toEqual(["IBLC"]);
    expect(query.mock.calls[0][0]).toContain("ON CONFLICT (user_id, building_code) DO NOTHING");
    expect(query.mock.calls[0][1]).toEqual(["user-1", "IBLC"]);
  });

  it("removes only the caller's building association", async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    expect(await setBuildingFavorite("user-2", "CHEM", false)).toEqual([]);
    expect(query.mock.calls[0][0]).toContain("WHERE user_id = $1 AND building_code = $2");
    expect(query.mock.calls[0][1]).toEqual(["user-2", "CHEM"]);
  });
});
