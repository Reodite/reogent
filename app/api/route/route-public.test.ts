import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveBuilding = vi.hoisted(() => vi.fn());
const route = vi.hoisted(() => vi.fn());
vi.mock("@/src/server/modules/buildings", () => ({ resolveBuilding }));
vi.mock("@/src/server/routing", () => ({ route }));
vi.mock("@/src/server/search", () => ({ getSearch: () => ({}) }));

const { GET } = await import("./route");

beforeEach(() => {
  resolveBuilding.mockReset().mockImplementation(async (_search: unknown, query: string) => ({
    code: query.toUpperCase(),
    name: query,
    aliases: [],
    lat: 49.26,
    lon: -123.25,
  }));
  route.mockReset();
});

describe("GET /api/route", () => {
  it("serves a network route without authentication", async () => {
    route.mockResolvedValue({
      method: "network",
      meters: 120,
      minutes: 2,
      polyline: [
        [-123.25, 49.26],
        [-123.24, 49.27],
      ],
    });

    const response = await GET(new Request("http://localhost/api/route?from=TEST&to=DEST"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      method: "network",
      from: "TEST",
      to: "DEST",
      polyline: expect.any(Array),
    });
  });

  it("returns estimate text data without drawable path geometry", async () => {
    route.mockResolvedValue({
      method: "estimate",
      meters: 150,
      minutes: 2,
      polyline: [
        [-123.25, 49.26],
        [-123.24, 49.27],
      ],
    });

    const response = await GET(new Request("http://localhost/api/route?from=TEST&to=DEST"));
    expect(await response.json()).toMatchObject({ method: "estimate", meters: 150, minutes: 2, polyline: [] });
  });

  it("rejects missing or unresolved buildings", async () => {
    expect((await GET(new Request("http://localhost/api/route?from=TEST"))).status).toBe(400);
    resolveBuilding.mockRejectedValue(new Error("Unknown building"));
    expect((await GET(new Request("http://localhost/api/route?from=TEST&to=NOPE"))).status).toBe(404);
  });
});
