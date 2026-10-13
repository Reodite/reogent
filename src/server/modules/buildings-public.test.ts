import type { FeatureCollection } from "geojson";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { publicBuildingsGeoJson, publicEntrancesGeoJson } from "./buildings";

const buildings: FeatureCollection = {
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
      properties: {
        BLDG_UID: "private-uid",
        BLDG_CODE: "TEST",
        NAME: "Test Building",
        SHORTNAME: "Test",
        PRIMARY_ADDRESS: "1 Main Mall",
        JURISDICTION: "UBC",
        PROPERTY_TYPE: "FeeSimple",
        HAS_SUBBLDGS: 0,
        BLDG_HEIGHT: 12,
        CREATED_USER: "private@example.com",
      },
    },
  ],
};

const getJson = vi.hoisted(() => vi.fn());
vi.mock("../data", () => ({ dataStore: () => ({ getJson }) }));

describe("building dataset reuse", () => {
  const ttl = 10 * 60 * 1000;
  const dataset = (key: string) =>
    key.endsWith("ubcv_buildings.geojson") ? buildings : { type: "FeatureCollection", features: [] };

  beforeEach(() => {
    vi.resetModules();
    getJson.mockReset();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01"));
  });
  afterEach(() => vi.useRealTimers());

  it("shares cold and expired loads across public consumers until completion-based expiry", async () => {
    const { getPublicBuildingsGeoJson, getPublicEntrancesGeoJson } = await import("./buildings");
    const load = () => Promise.all([getPublicBuildingsGeoJson(), getPublicEntrancesGeoJson()]);
    for (let cycle = 1; cycle <= 2; cycle++) {
      const gate = Promise.withResolvers<void>();
      getJson.mockImplementation(async (key: string) => {
        await gate.promise;
        return dataset(key);
      });
      const requests = Array.from({ length: 10 }, load);
      vi.setSystemTime(Date.now() + ttl + 1);
      requests.push(load());
      gate.resolve();
      for (const [publicBuildings, entrances] of await Promise.all(requests)) {
        expect(publicBuildings).toEqual(publicBuildingsGeoJson(buildings));
        expect(entrances).toEqual({ type: "FeatureCollection", features: [] });
      }
      vi.setSystemTime(Date.now() + ttl - 1);
      await load();
      expect(getJson).toHaveBeenCalledTimes(cycle * 2);
      vi.setSystemTime(Date.now() + 1);
    }
  });

  it.each(["buildings", "entraces"])("evicts a failed %s load so a later request can retry", async (failed) => {
    const { getPublicEntrancesGeoJson } = await import("./buildings");
    let fail = true;
    getJson.mockImplementation(async (key: string) => {
      if (key.endsWith(`${failed}.geojson`) && fail) {
        fail = false;
        throw new Error("Dataset unavailable");
      }
      return dataset(key);
    });
    await expect(getPublicEntrancesGeoJson()).rejects.toThrow("Dataset unavailable");
    await expect(getPublicEntrancesGeoJson()).resolves.toEqual({ type: "FeatureCollection", features: [] });
    expect(getJson.mock.calls.filter(([key]) => key.endsWith(`${failed}.geojson`))).toHaveLength(2);
  });
});

describe("public building map data", () => {
  it.each([
    [null, null],
    [undefined, null],
    ["", null],
    [" ", null],
    [false, null],
    [[], null],
    [0, 0],
    ["0", 0],
    ["2", 2],
  ])("preserves unknown entrance door counts for %j", (value, expected) => {
    const result = publicEntrancesGeoJson(buildings, {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [-123.25, 49.26] },
          properties: { BLDG_UID: "private-uid", STATUS: "Current", NUM_DOORS: value },
        },
      ],
    });
    expect(result.features[0].properties?.doorCount).toBe(expected);
  });

  it("keeps documented building fields and removes source identifiers", () => {
    const collection = publicBuildingsGeoJson(buildings);
    const properties = collection.features[0]?.properties;

    expect(properties).toMatchObject({
      BLDG_CODE: "TEST",
      NAME: "Test Building",
      SHORTNAME: "Test",
      PRIMARY_ADDRESS: "1 Main Mall",
      JURISDICTION: "UBC",
      PROPERTY_TYPE: "FeeSimple",
      HAS_SUBBLDGS: 0,
      BLDG_HEIGHT: 12,
    });
    expect(properties).not.toHaveProperty("BLDG_UID");
    expect(properties).not.toHaveProperty("CREATED_USER");
  });

  it("joins current finite entrance points and allowlists their properties", () => {
    const entrance = (status: string, coordinates: [number, number], uid = "private-uid") => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates },
      properties: {
        BLDG_UID: uid,
        STATUS: status,
        ENTRANCE_TYPE: "Primary",
        NUM_DOORS: 2,
        ACCESSIBLE: 1,
        ROT: 90,
        CREATED_USER: "private@example.com",
      },
    });
    const entrances: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        entrance("Current", [-123.2495, 49.26]),
        entrance("Retired", [-123.2496, 49.26]),
        entrance("Current", [-123.2497, 49.26], "unknown"),
        entrance("Current", [Number.NaN, 49.26]),
      ],
    };

    const collection = publicEntrancesGeoJson(buildings, entrances);
    expect(collection.features).toHaveLength(1);
    expect(collection.features[0]?.properties).toEqual({
      id: "TEST-0",
      buildingCode: "TEST",
      entranceType: "Primary",
      doorCount: 2,
    });
  });
});
