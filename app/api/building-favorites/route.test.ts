import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  list: vi.fn(),
  set: vi.fn(),
  getBuildings: vi.fn(),
}));

vi.mock("@/src/server/auth", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/src/server/building-favorites", () => ({
  listBuildingFavorites: mocks.list,
  setBuildingFavorite: mocks.set,
}));
vi.mock("@/src/server/modules/buildings", () => ({ getBuildingsGeoJson: mocks.getBuildings }));

const { GET, PUT } = await import("./route");

const request = (body?: unknown) =>
  new Request("http://localhost/api/building-favorites", {
    method: body === undefined ? "GET" : "PUT",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  mocks.requireUser.mockReset().mockResolvedValue({ sub: "user-1", username: "student" });
  mocks.list.mockReset().mockResolvedValue(["IBLC"]);
  mocks.set.mockReset().mockResolvedValue(["IBLC", "CHEM"]);
  mocks.getBuildings.mockReset().mockResolvedValue({
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: { BLDG_CODE: "CHEM" }, geometry: null }],
  });
});

describe("building favorites API", () => {
  it("returns only the caller's favorite codes", async () => {
    const response = await GET(request());
    expect(await response.json()).toEqual({ codes: ["IBLC"] });
    expect(mocks.list).toHaveBeenCalledWith("user-1");
  });

  it("validates and applies an exact saved state", async () => {
    const response = await PUT(request({ code: "chem", saved: true }));
    expect(response.status).toBe(200);
    expect(mocks.set).toHaveBeenCalledWith("user-1", "CHEM", true);
    expect(await response.json()).toEqual({ codes: ["IBLC", "CHEM"] });
  });

  it("rejects guests, malformed bodies, and unknown codes", async () => {
    mocks.requireUser.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await GET(request())).status).toBe(401);
    expect((await PUT(request({ code: "CHEM" }))).status).toBe(400);
    expect((await PUT(request({ code: "NOPE", saved: true }))).status).toBe(404);
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
