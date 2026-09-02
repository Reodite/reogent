import type { FeatureCollection } from "geojson";
import { describe, expect, it } from "vitest";
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
        BLDG_HEIGHT: 12,
        CREATED_USER: "private@example.com",
      },
    },
  ],
};

describe("public building map data", () => {
  it("keeps documented building fields and removes source identifiers", () => {
    const collection = publicBuildingsGeoJson(buildings);
    const properties = collection.features[0]?.properties;

    expect(properties).toMatchObject({
      BLDG_CODE: "TEST",
      NAME: "Test Building",
      SHORTNAME: "Test",
      PRIMARY_ADDRESS: "1 Main Mall",
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
