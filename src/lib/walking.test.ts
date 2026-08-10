// The user journey, verified end to end at the logic level with
// vitest (UI rendering itself is verified visually per the task notes):
// walking question → highlight extraction → building resolution from geo
// data → route + camera bounds the map draws.

import type { ToolCall } from "@/src/lib/api-types";
import { featureCentroid, featuresBounds, findBuilding } from "@/src/lib/geo";
import {
  extractBuildingHighlight,
  extractPlacesHighlight,
  extractWalkingHighlight,
  mergeMapHighlights,
} from "@/src/lib/walking";
import fc from "fast-check";
import type { FeatureCollection } from "geojson";
import { describe, expect, it } from "vitest";

describe("extractWalkingHighlight", () => {
  const healthy: ToolCall = {
    name: "walking_distance",
    input: { from_building: "IKB", to_building: "ICCS" },
    result: { from: "IKB", to: "ICCS", meters: 790, minutes: 10 },
  };

  it("extracts the highlight from a healthy call", () => {
    expect(extractWalkingHighlight(healthy)).toEqual({
      kind: "route",
      from: "IKB",
      to: "ICCS",
      meters: 790,
      minutes: 10,
    });
  });

  it("returns null for other tools, error results, and malformed payloads", () => {
    expect(extractWalkingHighlight({ ...healthy, name: "search_courses" })).toBeNull();
    expect(
      extractWalkingHighlight({ ...healthy, result: { status: "error", message: "no such building" } }),
    ).toBeNull();
    expect(
      extractWalkingHighlight({ ...healthy, result: { from: "IKB", to: "ICCS", meters: "790", minutes: 10 } }),
    ).toBeNull();
    expect(extractWalkingHighlight({ ...healthy, result: undefined })).toBeNull();
  });

  it("returns null for NaN, Infinity, or negative meters/minutes", () => {
    expect(extractWalkingHighlight({ ...healthy, result: { from: "A", to: "B", meters: NaN, minutes: 5 } })).toBeNull();
    expect(
      extractWalkingHighlight({ ...healthy, result: { from: "A", to: "B", meters: 100, minutes: Infinity } }),
    ).toBeNull();
    expect(extractWalkingHighlight({ ...healthy, result: { from: "A", to: "B", meters: -1, minutes: 5 } })).toBeNull();
    expect(
      extractWalkingHighlight({ ...healthy, result: { from: "A", to: "B", meters: 100, minutes: -2 } }),
    ).toBeNull();
  });

  it("prefers the backend's resolved codes — the input may be a colloquial alias", () => {
    const call: ToolCall = {
      name: "walking_distance",
      input: { from_building: "IKB", to_building: "ICCS" }, // IKB is not a real BLDG_CODE
      result: { from: "IBLC", to: "ICCS", meters: 830, minutes: 11 },
    };
    expect(extractWalkingHighlight(call)).toEqual({
      kind: "route",
      from: "IBLC",
      to: "ICCS",
      meters: 830,
      minutes: 11,
    });
  });

  it("falls back to result codes when the input is malformed", () => {
    const call: ToolCall = {
      name: "walking_distance",
      input: {},
      result: { from: "NEST", to: "BUCH", meters: 500, minutes: 7 },
    };
    expect(extractWalkingHighlight(call)).toEqual({ kind: "route", from: "NEST", to: "BUCH", meters: 500, minutes: 7 });
  });

  it("never fabricates a highlight without both endpoints and numeric measures (property)", () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.constantFrom("walking_distance", "search_courses", "get_course"),
          input: fc.dictionary(fc.constantFrom("from_building", "to_building", "x"), fc.string()),
          result: fc.oneof(
            fc.constant(undefined),
            fc.dictionary(fc.constantFrom("from", "to", "meters", "minutes", "status"), fc.anything()),
          ),
        }),
        (call) => {
          const highlight = extractWalkingHighlight(call as ToolCall);
          if (highlight === null) return true;
          return (
            call.name === "walking_distance" &&
            typeof highlight.meters === "number" &&
            typeof highlight.minutes === "number" &&
            highlight.from.length > 0 &&
            highlight.to.length > 0
          );
        },
      ),
    );
  });
});

describe("extractBuildingHighlight", () => {
  const healthy: ToolCall = {
    name: "find_building",
    input: { query: "life sciences" },
    result: { code: "LSC", name: "Life Sciences Centre", lat: 49.2626, lon: -123.2453 },
  };

  it("extracts the highlight from a healthy call", () => {
    expect(extractBuildingHighlight(healthy)).toEqual({
      kind: "buildings",
      buildings: [{ code: "LSC", name: "Life Sciences Centre", lat: 49.2626, lon: -123.2453 }],
    });
  });

  it("returns null for other tools, error results, and malformed payloads", () => {
    expect(extractBuildingHighlight({ ...healthy, name: "walking_distance" })).toBeNull();
    expect(extractBuildingHighlight({ ...healthy, result: { status: "error", message: "no match" } })).toBeNull();
    expect(extractBuildingHighlight({ ...healthy, result: { code: "LSC", lat: "49", lon: -123 } })).toBeNull();
    expect(extractBuildingHighlight({ ...healthy, result: undefined })).toBeNull();
  });

  it("falls back to the code when the name is missing", () => {
    const highlight = extractBuildingHighlight({ ...healthy, result: { code: "LSC", lat: 49.26, lon: -123.24 } });
    expect(highlight?.buildings[0]?.name).toBe("LSC");
  });

  it("rejects coordinates outside valid WGS84 range", () => {
    expect(extractBuildingHighlight({ ...healthy, result: { code: "X", name: "X", lat: 91, lon: -123 } })).toBeNull();
    expect(extractBuildingHighlight({ ...healthy, result: { code: "X", name: "X", lat: 49, lon: 181 } })).toBeNull();
    expect(extractBuildingHighlight({ ...healthy, result: { code: "X", name: "X", lat: NaN, lon: -123 } })).toBeNull();
  });
});

describe("mergeMapHighlights", () => {
  const building = (code: string): ToolCall => ({
    name: "find_building",
    input: { query: code },
    result: { code, name: code, lat: 49.26, lon: -123.25 },
  });
  const walk: ToolCall = {
    name: "walking_distance",
    input: { from_building: "IBLC", to_building: "ICCS" },
    result: { from: "IBLC", to: "ICCS", meters: 830, minutes: 11 },
  };

  it("merges every looked-up building into one highlight", () => {
    const merged = mergeMapHighlights([building("NEST"), building("ICCS"), building("NEST")]);
    expect(merged?.kind).toBe("buildings");
    if (merged?.kind !== "buildings") throw new Error("expected buildings");
    expect(merged.buildings.map((b) => b.code)).toEqual(["NEST", "ICCS"]); // deduped
  });

  it("prefers the route when one was computed (the A → B answer)", () => {
    const merged = mergeMapHighlights([building("IBLC"), building("ICCS"), walk]);
    expect(merged?.kind).toBe("route");
  });

  it("returns null when no call drives the map", () => {
    expect(mergeMapHighlights([])).toBeNull();
    expect(
      mergeMapHighlights([{ name: "walking_distance", input: {}, result: { status: "error", message: "nope" } }]),
    ).toBeNull();
  });
});

describe("extractPlacesHighlight", () => {
  const healthy: ToolCall = {
    name: "find_places",
    input: { service_type: "restaurant", near_building: "SWNG" },
    result: {
      near_building: "SWNG",
      places: [
        { name: "Mercante", lat: 49.2637, lon: -123.2551, service_type: "restaurant", walk_meters: 152 },
        { name: "The Point Grill", lat: 49.2611, lon: -123.2557, service_type: "restaurant" },
      ],
    },
  };

  it("extracts pins with the anchor building", () => {
    const highlight = extractPlacesHighlight(healthy);
    expect(highlight?.kind).toBe("places");
    expect(highlight?.near).toBe("SWNG");
    expect(highlight?.places).toEqual([
      { name: "Mercante", lat: 49.2637, lon: -123.2551, service_type: "restaurant" },
      { name: "The Point Grill", lat: 49.2611, lon: -123.2557, service_type: "restaurant" },
    ]);
  });

  it("skips malformed entries and returns null when none survive", () => {
    const partial = extractPlacesHighlight({
      ...healthy,
      result: { places: [{ name: "OK", lat: 49, lon: -123 }, { name: "no coords" }, { lat: 49, lon: -123 }] },
    });
    expect(partial?.places).toHaveLength(1);
    expect(partial?.near).toBe("SWNG"); // input fallback
    expect(extractPlacesHighlight({ ...healthy, result: { places: [] } })).toBeNull();
    expect(extractPlacesHighlight({ ...healthy, name: "search_courses" })).toBeNull();
    expect(extractPlacesHighlight({ ...healthy, result: { status: "error", message: "none" } })).toBeNull();
  });

  it("filters out places with out-of-range or non-finite coordinates", () => {
    const result = extractPlacesHighlight({
      ...healthy,
      result: {
        places: [
          { name: "Valid", lat: 49, lon: -123, service_type: "cafe" },
          { name: "Bad lat", lat: 91, lon: -123, service_type: "x" },
          { name: "NaN lon", lat: 49, lon: NaN, service_type: "x" },
          { name: "Infinity", lat: Infinity, lon: -123, service_type: "x" },
        ],
      },
    });
    expect(result?.places).toHaveLength(1);
    expect(result?.places[0].name).toBe("Valid");
  });
});

describe("journey: highlight → geo resolution → camera bounds", () => {
  const routeCall: ToolCall = {
    name: "walking_distance",
    input: { from_building: "IKB", to_building: "ICCS" },
    result: { from: "IBLC", to: "ICCS", meters: 830, minutes: 11 },
  };

  // Building footprint stand-ins, shaped like /api/geo/buildings polygons.
  const buildings: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "Irving K. Barber Learning Centre", BLDG_CODE: "IBLC" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-123.2533, 49.2689],
              [-123.2517, 49.2689],
              [-123.2517, 49.2677],
              [-123.2533, 49.2677],
              [-123.2533, 49.2689],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: { name: "ICCS", BLDG_CODE: "ICCS" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-123.2507, 49.2612],
              [-123.249, 49.2612],
              [-123.249, 49.2601],
              [-123.2507, 49.2601],
              [-123.2507, 49.2612],
            ],
          ],
        },
      },
    ],
  };

  it("resolves the answered route to two footprints, centroids, and camera bounds", () => {
    // 1) The renderer extracts highlight state for the map.
    const highlight = extractWalkingHighlight(routeCall);
    if (!highlight) throw new Error("expected a highlight from the healthy walking_distance result");

    // 2) The map resolves both buildings from /api/geo/buildings…
    const from = findBuilding(buildings, highlight.from);
    const to = findBuilding(buildings, highlight.to);
    if (!from || !to) throw new Error("both highlighted buildings must exist in the geo data");

    // …computes centroid-to-centroid route endpoints…
    const fromCenter = featureCentroid(from);
    const toCenter = featureCentroid(to);
    expect(fromCenter).not.toBeNull();
    expect(toCenter).not.toBeNull();

    // …and camera bounds that contain both endpoints.
    const bounds = featuresBounds([from, to]);
    if (!bounds || !fromCenter || !toCenter) throw new Error("bounds and centroids must resolve");
    for (const [lng, lat] of [fromCenter, toCenter]) {
      expect(lng).toBeGreaterThanOrEqual(bounds.west);
      expect(lng).toBeLessThanOrEqual(bounds.east);
      expect(lat).toBeGreaterThanOrEqual(bounds.south);
      expect(lat).toBeLessThanOrEqual(bounds.north);
    }
  });

  it("clears the route when a call carries no walking highlight", () => {
    const courseCall: ToolCall = {
      name: "search_courses",
      input: { query: "CPSC" },
      result: { courses: [] },
    };
    expect(extractWalkingHighlight(courseCall)).toBeNull();
  });
});
