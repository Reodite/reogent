import { featureCentroid, featuresBounds, findBuilding, type BuildingFeature } from "@/src/lib/geo";
import { haversineMeters } from "@/src/shared/types";
import fc from "fast-check";
import type { FeatureCollection } from "geojson";
import { describe, expect, it } from "vitest";

function square(cx: number, cy: number, half: number, properties: Record<string, unknown> = {}): BuildingFeature {
  return {
    type: "Feature",
    properties,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [cx - half, cy - half],
          [cx + half, cy - half],
          [cx + half, cy + half],
          [cx - half, cy + half],
          [cx - half, cy - half],
        ],
      ],
    },
  };
}

describe("featureCentroid", () => {
  it("returns the center of any square (property)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -170, max: 170, noNaN: true }),
        fc.double({ min: -80, max: 80, noNaN: true }),
        fc.double({ min: 0.0001, max: 0.01, noNaN: true }),
        (cx, cy, half) => {
          const centroid = featureCentroid(square(cx, cy, half));
          if (!centroid) return false;
          return Math.abs(centroid[0] - cx) < 1e-9 && Math.abs(centroid[1] - cy) < 1e-9;
        },
      ),
    );
  });

  it("stays inside the bounding box for any simple polygon (property)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.double({ min: -1, max: 1, noNaN: true }), fc.double({ min: -1, max: 1, noNaN: true })), {
          minLength: 3,
          maxLength: 12,
        }),
        (points) => {
          // GeoJSON rings must be simple; sorting by angle around the vertex
          // mean yields a star-shaped (non-self-intersecting) ring.
          const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
          const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
          const sorted = [...points].sort(
            (a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx),
          );
          const ring = [...sorted, sorted[0]];
          const feature: BuildingFeature = {
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: [ring] },
          };
          const centroid = featureCentroid(feature);
          if (!centroid) return true; // degenerate ring rejected — acceptable
          const bounds = featuresBounds([feature]);
          if (!bounds) return false;
          const eps = 1e-9;
          return (
            centroid[0] >= bounds.west - eps &&
            centroid[0] <= bounds.east + eps &&
            centroid[1] >= bounds.south - eps &&
            centroid[1] <= bounds.north + eps
          );
        },
      ),
    );
  });
});

describe("findBuilding", () => {
  const collection: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      square(-123.25, 49.26, 0.0004, { BLDG_CODE: "ICCS", NAME: "Institute for Computing" }),
      square(-123.252, 49.267, 0.0004, { BLDG_CODE: "IKB", NAME: "Irving K. Barber Learning Centre" }),
    ],
  };

  it("matches codes case-insensitively before names", () => {
    expect(findBuilding(collection, "iccs")?.properties?.BLDG_CODE).toBe("ICCS");
    expect(findBuilding(collection, "IKB")?.properties?.BLDG_CODE).toBe("IKB");
  });

  it("falls back to name substring matching", () => {
    expect(findBuilding(collection, "Barber")?.properties?.BLDG_CODE).toBe("IKB");
  });

  it("returns null for unknown or blank queries", () => {
    expect(findBuilding(collection, "HOGWARTS")).toBeNull();
    expect(findBuilding(collection, "  ")).toBeNull();
  });

  it("returns null for malformed collections", () => {
    expect(findBuilding({ type: "FeatureCollection", features: [] }, "ICCS")).toBeNull();
    expect(findBuilding(null as unknown as FeatureCollection, "ICCS")).toBeNull();
    expect(findBuilding({ type: "FeatureCollection" } as unknown as FeatureCollection, "ICCS")).toBeNull();
  });

  it("skips features with missing geometry.coordinates", () => {
    const broken: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { BLDG_CODE: "X" },
          geometry: { type: "Polygon" },
        } as unknown as BuildingFeature,
      ],
    };
    expect(findBuilding(broken, "X")).toBeNull();
  });
});

describe("featureCentroid edge cases", () => {
  it("returns null for features with NaN coordinates", () => {
    const feature: BuildingFeature = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [NaN, NaN],
            [NaN, NaN],
            [NaN, NaN],
            [NaN, NaN],
          ],
        ],
      },
    };
    expect(featureCentroid(feature)).toBeNull();
  });

  it("returns null for rings with fewer than 3 points", () => {
    const feature: BuildingFeature = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 1],
          ],
        ],
      },
    };
    expect(featureCentroid(feature)).toBeNull();
  });
});

describe("haversineMeters", () => {
  it("is symmetric and zero at identity (property)", () => {
    const lngLat = fc.tuple(
      fc.double({ min: -179, max: 179, noNaN: true }),
      fc.double({ min: -85, max: 85, noNaN: true }),
    );
    fc.assert(
      fc.property(lngLat, lngLat, (a, b) => {
        const ab = haversineMeters(a as [number, number], b as [number, number]);
        const ba = haversineMeters(b as [number, number], a as [number, number]);
        return Math.abs(ab - ba) < 1e-6 && haversineMeters(a as [number, number], a as [number, number]) < 1e-6;
      }),
    );
  });

  it("measures ~111 km per degree of latitude", () => {
    const d = haversineMeters([-123.25, 49.0], [-123.25, 50.0]);
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_500);
  });
});
