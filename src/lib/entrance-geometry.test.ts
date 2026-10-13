import type { EntranceFeatureCollection } from "@/src/lib/api-types";
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
  it("projects an entrance onto the building wall", () => {
    const markers = buildEntranceMarkers(polygonCollection([ring(20, 12)]), entrances(southEntrance(12)));
    expect(markers).toHaveLength(1);
    const marker = markers[0];

    expect(marker.wallDistanceMeters).toBeCloseTo(0, 4);
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
});
