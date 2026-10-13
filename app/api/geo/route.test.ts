import { beforeEach, describe, expect, it, vi } from "vitest";

const load = vi.hoisted(() => vi.fn());
vi.mock("@/src/server/modules", () => ({
  modules: [{ geo: [{ name: "public-layer", load }] }],
}));

const { GET } = await import("./[name]/route");

beforeEach(() => {
  load.mockReset().mockResolvedValue({ type: "FeatureCollection", features: [] });
});

describe("GET /api/geo/[name]", () => {
  it("serves transformed map data without authentication", async () => {
    const response = await GET(new Request("http://localhost/api/geo/public-layer"), {
      params: Promise.resolve({ name: "public-layer" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    expect(await response.json()).toEqual({ type: "FeatureCollection", features: [] });
  });

  it("rejects unknown map artifacts", async () => {
    const response = await GET(new Request("http://localhost/api/geo/private-layer"), {
      params: Promise.resolve({ name: "private-layer" }),
    });

    expect(response.status).toBe(404);
  });
});
