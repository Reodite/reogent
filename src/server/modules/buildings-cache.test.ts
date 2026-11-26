import { afterEach, describe, expect, it, vi } from "vitest";
import { getBuildingsGeoJson, getPublicEntrancesGeoJson } from "./buildings";

const store = vi.hoisted(() => ({ getJson: vi.fn() }));

vi.mock("../data", () => ({ dataStore: () => store }));

const buildings = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-123.25, 49.26],
            [-123.249, 49.26],
            [-123.249, 49.261],
            [-123.25, 49.261],
            [-123.25, 49.26],
          ],
        ],
      },
      properties: { BLDG_UID: "uid", BLDG_CODE: "TEST", NAME: "Test" },
    },
  ],
};
const entrances = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-123.25, 49.26] },
      properties: { BLDG_UID: "uid", STATUS: "Current" },
    },
  ],
};

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("building geometry caches", () => {
  it("reloads cached datasets at the TTL boundary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    let buildingRead = 0;
    store.getJson.mockImplementation(async (key: string) => {
      if (key.includes("entraces")) return entrances;
      buildingRead++;
      return { ...buildings, read: buildingRead };
    });

    const first = await getBuildingsGeoJson();
    expect(await getBuildingsGeoJson()).toBe(first);
    expect(store.getJson).toHaveBeenCalledTimes(1);

    vi.setSystemTime(1_600_000);
    expect(await getBuildingsGeoJson()).toMatchObject({ read: 2 });
    expect(store.getJson).toHaveBeenCalledTimes(2);

    await getPublicEntrancesGeoJson();
    const entranceReads = store.getJson.mock.calls.filter(([key]) => key.includes("entraces")).length;
    vi.setSystemTime(2_200_000);
    await getPublicEntrancesGeoJson();
    expect(store.getJson.mock.calls.filter(([key]) => key.includes("entraces")).length).toBe(entranceReads + 1);
  });
});
