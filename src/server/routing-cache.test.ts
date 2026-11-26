import { afterEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ getJson: vi.fn() }));

vi.mock("./data", () => ({ dataStore: () => store }));

const graphData = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [-123.25, 49.26],
          [-123.249, 49.26],
        ],
      },
    },
  ],
};

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("routing data caches", () => {
  it("reloads graph data at the TTL boundary", async () => {
    vi.resetModules();
    const { BUILDING_ENTRANCES_KEY, route, WALKING_ROUTES_KEY } = await import("./routing");
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    store.getJson.mockImplementation(async (key: string) => (key === WALKING_ROUTES_KEY ? graphData : {}));
    const endpoints = { lat: 49.26, lon: -123.25 };

    await route(endpoints, { lat: 49.26, lon: -123.249 });
    await route(endpoints, { lat: 49.26, lon: -123.249 });
    expect(store.getJson.mock.calls.filter(([key]) => key === WALKING_ROUTES_KEY)).toHaveLength(1);

    vi.setSystemTime(1_600_000);
    await route(endpoints, { lat: 49.26, lon: -123.249 });
    expect(store.getJson.mock.calls.filter(([key]) => key === WALKING_ROUTES_KEY)).toHaveLength(2);
    expect(store.getJson.mock.calls.filter(([key]) => key === BUILDING_ENTRANCES_KEY)).toHaveLength(2);
  });

  it("retries when graph construction fails", async () => {
    vi.resetModules();
    const { route, WALKING_ROUTES_KEY } = await import("./routing");
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    let graphReads = 0;
    store.getJson.mockImplementation(async (key: string) => {
      if (key !== WALKING_ROUTES_KEY) return {};
      graphReads++;
      return graphReads === 1 ? { type: "FeatureCollection", features: 42 } : graphData;
    });
    const endpoints = { lat: 49.26, lon: -123.25 };

    await expect(route(endpoints, { lat: 49.26, lon: -123.249 })).rejects.toThrow();
    await expect(route(endpoints, { lat: 49.26, lon: -123.249 })).resolves.toMatchObject({ method: "network" });
    expect(graphReads).toBe(2);
  });
});
