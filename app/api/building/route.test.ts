import { beforeEach, describe, expect, it, vi } from "vitest";

const loadBuildingDetails = vi.hoisted(() => vi.fn());
vi.mock("@/src/server/building-details", () => ({ loadBuildingDetails }));
vi.mock("@/src/server/search", () => ({ getSearch: () => ({}) }));

const { GET } = await import("./[code]/route");

beforeEach(() => {
  loadBuildingDetails.mockReset().mockResolvedValue({ code: "TEST", name: "Test Building" });
});

describe("GET /api/building/[code]", () => {
  it("returns public building details without an authorization header", async () => {
    const response = await GET(new Request("http://localhost/api/building/TEST"), {
      params: Promise.resolve({ code: "TEST" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ code: "TEST", name: "Test Building" });
  });

  it("returns 404 for an unknown building", async () => {
    loadBuildingDetails.mockRejectedValue(new Error('Unknown building: "NOPE"'));
    const response = await GET(new Request("http://localhost/api/building/NOPE"), {
      params: Promise.resolve({ code: "NOPE" }),
    });

    expect(response.status).toBe(404);
  });
});
