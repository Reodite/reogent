import { pointInFeature, type BuildingFeature } from "@/src/lib/geo";
import { toPoiCard } from "@/src/server/building-details";
import { describe, expect, it } from "vitest";

describe("POI links", () => {
  it("omits non-HTTPS links before labeling a service website", () => {
    expect(
      toPoiCard(
        {
          id: "1",
          name: "Test service",
          abbreviation: null,
          service_type: "service",
          url: "http://example.com",
          contact: null,
          hours: null,
          photo: null,
          lat: 49.26,
          lon: -123.25,
        },
        "location-derived",
      ).url,
    ).toBeNull();
  });
});

describe("pointInFeature", () => {
  const square: BuildingFeature = {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0],
        ],
        // hole in the middle
        [
          [0.8, 0.8],
          [1.2, 0.8],
          [1.2, 1.2],
          [0.8, 1.2],
          [0.8, 0.8],
        ],
      ],
    },
  };

  it("is inside the ring, outside the bounds, and excluded from holes", () => {
    expect(pointInFeature(square, [0.5, 0.5])).toBe(true);
    expect(pointInFeature(square, [3, 1])).toBe(false);
    expect(pointInFeature(square, [1, 1])).toBe(false); // inside the hole
  });
});
