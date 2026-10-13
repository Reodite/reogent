import type { EntranceFeatureCollection } from "@/src/lib/api-types";
import fc from "fast-check";
import type { FeatureCollection, Position } from "geojson";
import { describe, expect, it } from "vitest";
import { buildEntranceMarkers, visibleEntranceMarkers } from "./entrance-geometry";

const METERS_PER_LATITUDE_DEGREE = 110_540;
const ORIGIN: [number, number] = [-123.25, 49.26];

function longitudeDelta(meters: number, latitude = ORIGIN[1]): number {
  return meters / (111_320 * Math.cos((latitude * Math.PI) / 180));
}

function latitudeDelta(meters: number): number {
  return meters / METERS_PER_LATITUDE_DEGREE;
}

function ring(width: number, height: number, center = ORIGIN): Position[] {
  const dx = longitudeDelta(width / 2, center[1]);
  const dy = latitudeDelta(height / 2);
  return [
    [center[0] - dx, center[1] - dy],
    [center[0] + dx, center[1] - dy],
    [center[0] + dx, center[1] + dy],
    [center[0] - dx, center[1] + dy],
    [center[0] - dx, center[1] - dy],
  ];
}

function polygonCollection(coordinates: Position[][], code = "TEST"): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { BLDG_CODE: code, NAME: "Test Building" },
        geometry: { type: "Polygon", coordinates },
      },
    ],
  };
}

function entrances(position: [number, number], code = "TEST"): EntranceFeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: position },
        properties: { id: `${code}-1`, buildingCode: code, entranceType: "Primary", doorCount: 2 },
      },
    ],
  };
}

function southEntrance(height: number, center = ORIGIN): [number, number] {
  return [center[0], center[1] - latitudeDelta(height / 2)];
}

describe("entrance marker geometry", () => {
  it("builds an inward solid arrowhead and a vertical wall-aligned door", () => {
    const markers = buildEntranceMarkers(polygonCollection([ring(20, 12)]), entrances(southEntrance(12)));
    expect(markers).toHaveLength(1);
    const marker = markers[0];

    expect(marker.wallDistanceMeters).toBeCloseTo(0, 4);
    expect(marker.groundArrow).toHaveLength(4);
    expect(marker.groundArrow.at(-1)).toEqual(marker.groundArrow[0]);
    expect(marker.groundArrow[0][1]).toBeLessThan(marker.groundArrow[1][1]);
    expect(marker.groundArrow.every((position) => position[2] === 0)).toBe(true);
    expect(marker.doorOutline.map((position) => position[2])).toEqual([0.1, 2.2, 2.2, 0.1, 0.1]);
    expect((southEntrance(12)[1] - marker.doorOutline[0][1]) * METERS_PER_LATITUDE_DEGREE).toBeCloseTo(0, 3);
    expect(Math.abs(marker.wallTangent[0])).toBeCloseTo(1, 4);
    expect(Math.abs(marker.wallTangent[1])).toBeCloseTo(0, 4);
  });

  it("uses courtyard boundary rings instead of dropping verified courtyard entrances", () => {
    const outer = ring(30, 30);
    const courtyard = ring(8, 8);
    const entrance: [number, number] = [ORIGIN[0], ORIGIN[1] - latitudeDelta(4)];

    expect(buildEntranceMarkers(polygonCollection([outer, courtyard]), entrances(entrance))).toHaveLength(1);
  });

  it("supports MultiPolygon footprints", () => {
    const secondCenter: [number, number] = [ORIGIN[0] + longitudeDelta(40), ORIGIN[1]];
    const buildings: FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { BLDG_CODE: "MULTI", NAME: "Multi Building" },
          geometry: { type: "MultiPolygon", coordinates: [[ring(10, 10)], [ring(12, 12, secondCenter)]] },
        },
      ],
    };

    expect(buildEntranceMarkers(buildings, entrances(southEntrance(12, secondCenter), "MULTI"))).toHaveLength(1);
  });

  it("drops entrances farther than the wall tolerance", () => {
    const position: [number, number] = [ORIGIN[0], ORIGIN[1] - latitudeDelta(12)];
    expect(buildEntranceMarkers(polygonCollection([ring(10, 10)]), entrances(position))).toEqual([]);
  });

  it("shows focused entrances below detail zoom and all entrances at detail zoom", () => {
    const markers = [
      ...buildEntranceMarkers(polygonCollection([ring(20, 12)], "ONE"), entrances(southEntrance(12), "ONE")),
      ...buildEntranceMarkers(polygonCollection([ring(20, 12)], "TWO"), entrances(southEntrance(12), "TWO")),
    ];

    expect(visibleEntranceMarkers(markers, 14, new Set())).toEqual([]);
    expect(visibleEntranceMarkers(markers, 14, new Set(["ONE"])).map((marker) => marker.buildingCode)).toEqual(["ONE"]);
    expect(visibleEntranceMarkers(markers, 16, new Set())).toHaveLength(2);
  });

  // Feature: campus-map-explorer, Property 4: Entrance markers preserve verified geometry bounds.
  it("keeps generated rectangular-building markers finite, bounded, and vertical", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -123.28, max: -123.2, noNaN: true }),
        fc.double({ min: 49.23, max: 49.29, noNaN: true }),
        fc.double({ min: 6, max: 60, noNaN: true }),
        fc.double({ min: 6, max: 60, noNaN: true }),
        (longitude, latitude, width, height) => {
          const center: [number, number] = [longitude, latitude];
          const marker = buildEntranceMarkers(
            polygonCollection([ring(width, height, center)]),
            entrances(southEntrance(height, center)),
          )[0];
          expect(marker).toBeDefined();
          expect(marker.wallDistanceMeters).toBeLessThanOrEqual(4);
          expect(marker.groundArrow.flat().every(Number.isFinite)).toBe(true);
          const altitudes = marker.doorOutline.map((position) => position[2]);
          expect(Math.min(...altitudes)).toBeGreaterThanOrEqual(0);
          expect(Math.max(...altitudes)).toBeGreaterThanOrEqual(1.8);
          expect(Math.max(...altitudes)).toBeLessThanOrEqual(2.4);
          expect(marker.doorOutline[0][0]).toBeCloseTo(marker.doorOutline[1][0], 10);
          expect(marker.doorOutline[0][1]).toBeCloseTo(marker.doorOutline[1][1], 10);
        },
      ),
      { numRuns: 100 },
    );
  });
});
