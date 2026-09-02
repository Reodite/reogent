// The user journey, verified end to end at the logic level with
// vitest (UI rendering itself is verified visually per the task notes):
// walking question → highlight extraction → building resolution from geo
// data → route + camera bounds the map draws.

import type { ToolCall } from "@/src/lib/api-types";
import { featureCentroid, featuresBounds, findBuilding } from "@/src/lib/geo";
import {
  drawableRoutePath,
  extractBuildingHighlight,
  extractParkingHighlight,
  extractPeopleHighlight,
  extractPlacesHighlight,
  extractWalkingHighlight,
  toolCallToCanvasView,
} from "@/src/lib/walking";
import fc from "fast-check";
import type { FeatureCollection } from "geojson";
import { describe, expect, it } from "vitest";

describe("extractWalkingHighlight", () => {
  const healthy: ToolCall = {
    name: "walking_distance",
    input: { from_building: "IKB", to_building: "ICCS" },
    result: { from: "IKB", to: "ICCS", meters: 790, minutes: 10, method: "network" },
  };

  it("extracts the highlight from a healthy call", () => {
    expect(extractWalkingHighlight(healthy)).toEqual({
      kind: "route",
      from: "IKB",
      to: "ICCS",
      meters: 790,
      minutes: 10,
      method: "network",
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
      method: null,
    });
  });

  it("falls back to result codes when the input is malformed", () => {
    const call: ToolCall = {
      name: "walking_distance",
      input: {},
      result: { from: "NEST", to: "BUCH", meters: 500, minutes: 7 },
    };
    expect(extractWalkingHighlight(call)).toEqual({
      kind: "route",
      from: "NEST",
      to: "BUCH",
      meters: 500,
      minutes: 7,
      method: null,
    });
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

describe("drawableRoutePath", () => {
  it("returns network geometry and rejects estimates or malformed coordinates", () => {
    const network = {
      from: "A",
      to: "B",
      meters: 100,
      minutes: 2,
      method: "network" as const,
      polyline: [
        [-123.25, 49.26],
        [-123.24, 49.27],
      ] as [number, number][],
    };
    expect(drawableRoutePath(network)).toEqual(network.polyline);
    expect(drawableRoutePath({ ...network, method: "estimate" })).toBeNull();
    expect(
      drawableRoutePath({
        ...network,
        polyline: [
          [Number.NaN, 49.26],
          [-123.24, 49.27],
        ],
      }),
    ).toBeNull();
    expect(drawableRoutePath({ ...network, polyline: [network.polyline[0], network.polyline[0]] })).toBeNull();
  });

  // Feature: campus-map-explorer, Property 7: Estimated routes never become path geometry.
  it("emits geometry exactly for valid network routes", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("network" as const, "estimate" as const),
        fc.array(
          fc.tuple(fc.double({ min: -180, max: 180, noNaN: true }), fc.double({ min: -90, max: 90, noNaN: true })),
          { minLength: 2, maxLength: 20 },
        ),
        (method, polyline) => {
          const result = drawableRoutePath({ from: "A", to: "B", meters: 10, minutes: 1, method, polyline });
          const [firstLongitude, firstLatitude] = polyline[0];
          const hasDistance = polyline.some(
            ([longitude, latitude]) => longitude !== firstLongitude || latitude !== firstLatitude,
          );
          expect(result !== null).toBe(method === "network" && hasDistance);
        },
      ),
      { numRuns: 100 },
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

describe("extractParkingHighlight", () => {
  const healthy: ToolCall = {
    name: "find_parking",
    input: { near_building: "SWNG" },
    result: {
      near_building: "SWNG",
      parking: [
        { name: "Rose Garden Parkade", lat: 49.27, lon: -123.25, rate: "$4.50/hr" },
        { name: "North Parkade", lat: 49.271, lon: -123.251 },
      ],
    },
  };

  it("extracts parking pins as a places highlight anchored to the building", () => {
    const highlight = extractParkingHighlight(healthy);
    expect(highlight?.kind).toBe("places");
    expect(highlight?.near).toBe("SWNG");
    expect(highlight?.places).toEqual([
      { name: "Rose Garden Parkade", lat: 49.27, lon: -123.25, service_type: null },
      { name: "North Parkade", lat: 49.271, lon: -123.251, service_type: null },
    ]);
  });

  it("returns null for other tools, error results, and malformed payloads", () => {
    expect(extractParkingHighlight({ ...healthy, name: "find_places" })).toBeNull();
    expect(extractParkingHighlight({ ...healthy, result: { status: "error", message: "none" } })).toBeNull();
    expect(extractParkingHighlight({ ...healthy, result: { parking: [] } })).toBeNull();
    expect(extractParkingHighlight({ ...healthy, result: undefined })).toBeNull();
  });
});

describe("toolCallToCanvasView", () => {
  const month = new Date().toISOString().slice(0, 7);

  function mapKind(view: { paneId: string; state: Record<string, unknown> } | null): string | undefined {
    if (!view) return undefined;
    const highlight = view.state.highlight as { kind?: string } | undefined;
    return highlight?.kind;
  }

  it("maps a walking_distance call to the map pane with the route highlight", () => {
    const view = toolCallToCanvasView({
      name: "walking_distance",
      input: { from_building: "IBLC", to_building: "ICCS" },
      result: { from: "IBLC", to: "ICCS", meters: 830, minutes: 11 },
    });
    expect(view?.paneId).toBe("map");
    expect(view?.state.highlight).toEqual({
      kind: "route",
      from: "IBLC",
      to: "ICCS",
      meters: 830,
      minutes: 11,
      method: null,
    });
  });

  it("maps a find_places call to the map pane", () => {
    const view = toolCallToCanvasView({
      name: "find_places",
      input: { service_type: "restaurant", near_building: "SWNG" },
      result: { places: [{ name: "Mercante", lat: 49.2637, lon: -123.2551, service_type: "restaurant" }] },
    });
    expect(view?.paneId).toBe("map");
    expect(mapKind(view)).toBe("places");
  });

  it("maps a find_building call to the map pane", () => {
    const view = toolCallToCanvasView({
      name: "find_building",
      input: { query: "life sciences" },
      result: { code: "LSC", name: "Life Sciences Centre", lat: 49.2626, lon: -123.2453 },
    });
    expect(view?.paneId).toBe("map");
    expect(mapKind(view)).toBe("buildings");
  });

  it.each([
    ["building_detail", false, "building"],
    ["building_entrances", true, undefined],
    ["building_spaces", false, "spaces"],
  ] as const)("maps %s to one rich building highlight", (type, showEntrances, detailKind) => {
    const view = toolCallToCanvasView({
      name: "show_widget",
      input: { type, building_code: "IBLC" },
      result: {
        type,
        result: {
          building: {
            code: "IBLC",
            name: "Irving K. Barber Learning Centre",
            centroid: [-123.252, 49.267],
          },
        },
      },
    } as ToolCall);
    expect(view?.paneId).toBe("map");
    const highlight = view?.state.highlight as { kind?: string; showEntrances?: boolean; detailKind?: string };
    expect(highlight.kind).toBe("buildings");
    expect(Boolean(highlight.showEntrances)).toBe(showEntrances);
    expect(highlight.detailKind).toBe(detailKind);
  });

  // Feature: campus-map-explorer, Property 5: Map widget mapping rejects malformed spatial state.
  it("accepts rich widgets exactly for finite in-range building centroids", () => {
    fc.assert(
      fc.property(fc.double({ noNaN: false }), fc.double({ noNaN: false }), (lon, lat) => {
        const view = toolCallToCanvasView({
          name: "show_widget",
          input: { type: "building_entrances", building_code: "IBLC" },
          result: {
            type: "building_entrances",
            result: { building: { code: "IBLC", name: "IKB", centroid: [lon, lat] } },
          },
        } as ToolCall);
        const valid =
          Number.isFinite(lon) && Number.isFinite(lat) && lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90;
        expect(view !== null).toBe(valid);
        if (view) expect(view.state.highlight).toMatchObject({ showEntrances: true });
      }),
      { numRuns: 100 },
    );
  });

  it("maps a find_parking call to the map pane", () => {
    const view = toolCallToCanvasView({
      name: "find_parking",
      input: { near_building: "SWNG" },
      result: { parking: [{ name: "Rose Garden Parkade", lat: 49.27, lon: -123.25 }] },
    });
    expect(view?.paneId).toBe("map");
    expect(mapKind(view)).toBe("places");
  });

  it("does not open panes for raw data tools (only show_widget does)", () => {
    expect(
      toolCallToCanvasView({
        name: "get_course",
        input: { course_code: "CPSC 110" },
        result: { code: "CPSC 110", title: "Computation, Programs, and Programming" },
      } as ToolCall),
    ).toBeNull();
    expect(
      toolCallToCanvasView({
        name: "find_courses",
        input: { query: "machine learning", subject: "CPSC" },
        result: { courses: [{ code: "CPSC 340", title: "Machine Learning" }] },
      } as ToolCall),
    ).toBeNull();
    expect(
      toolCallToCanvasView({
        name: "get_prereq_tree",
        input: { course_code: "CPSC 320" },
        result: { rootCode: "CPSC 320", nodes: [], edges: [], selectionKeys: [] },
      } as ToolCall),
    ).toBeNull();
    expect(
      toolCallToCanvasView({
        name: "get_key_dates",
        input: { query: "withdrawal" },
        result: { dates: [{ kind: "academic", name: "Withdrawal deadline", start: "2026-10-01", end: null }] },
      } as ToolCall),
    ).toBeNull();
  });

  it("maps show_widget course/courses/prereq_tree/key_dates to their panes", () => {
    const course = toolCallToCanvasView({
      name: "show_widget",
      input: { type: "course" },
      result: { type: "course", result: { code: "CPSC 110" } },
    } as unknown as ToolCall);
    expect(course?.paneId).toBe("course-lookup");
    expect(course?.state.code).toBe("CPSC 110");

    const courses = toolCallToCanvasView({
      name: "show_widget",
      input: { type: "courses" },
      result: { type: "courses", result: { courses: [{ code: "CPSC 340" }] } },
    } as unknown as ToolCall);
    expect(courses?.paneId).toBe("course-lookup");
    expect(courses?.state.code).toBe("CPSC 340");

    const prereq = toolCallToCanvasView({
      name: "show_widget",
      input: { type: "prereq_tree" },
      result: { type: "prereq_tree", result: { rootCode: "CPSC 320" } },
    } as unknown as ToolCall);
    expect(prereq?.paneId).toBe("prereq-tree");
    expect(prereq?.state.root).toBe("CPSC 320");

    const dates = toolCallToCanvasView({
      name: "show_widget",
      input: { type: "key_dates" },
      result: {
        type: "key_dates",
        result: { dates: [{ kind: "academic", name: "W", start: "2026-10-01", end: null }] },
      },
    } as unknown as ToolCall);
    expect(dates?.paneId).toBe("calendar");
    expect(dates?.state.cursor).toBe(month);
    expect(dates?.state.kinds).toEqual(["academic", "holiday"]);
  });

  it("returns null for an unmapped tool", () => {
    expect(
      toolCallToCanvasView({
        name: "get_tuition",
        input: { program: "BSc" },
        result: { program: "BSc", amount_cad: 5000, student_type: "domestic", cohort_year: 2026 },
      } as ToolCall),
    ).toBeNull();
  });

  it("returns null for every mapped tool when its result is an error", () => {
    const err = { status: "error", message: "nope" };
    const names = [
      ["walking_distance", { from_building: "A", to_building: "B" }],
      ["find_places", { category: "cafe" }],
      ["find_building", { query: "x" }],
      ["find_parking", {}],
      ["get_course", { course_code: "X" }],
      ["find_courses", { query: "X" }],
      ["get_prereq_tree", { course_code: "X" }],
      ["get_key_dates", { query: "X" }],
    ] as const;
    for (const [name, input] of names) {
      expect(toolCallToCanvasView({ name, input, result: err } as ToolCall)).toBeNull();
    }
  });

  it("tolerates a null/undefined result without crashing", () => {
    expect(toolCallToCanvasView({ name: "get_course", input: {}, result: undefined } as ToolCall)).toBeNull();
    expect(toolCallToCanvasView({ name: "walking_distance", input: {}, result: undefined } as ToolCall)).toBeNull();
    expect(toolCallToCanvasView({ name: "get_prereq_tree", input: {}, result: undefined } as ToolCall)).toBeNull();
  });
});

describe("find_food and find_person map highlights", () => {
  it("find_food pins render through the places extractor; unlocated outlets are skipped", () => {
    const call: ToolCall = {
      name: "find_food",
      input: { near_building: "SWNG" },
      result: {
        near_building: "SWNG",
        places: [
          { name: "Kyros Kitchen", service_type: "food", lat: 49.2637, lon: -123.2551 },
          { name: "Mercante", service_type: "food" },
        ],
      },
    };
    expect(extractPlacesHighlight(call)).toEqual({
      kind: "places",
      near: "SWNG",
      places: [{ name: "Kyros Kitchen", lat: 49.2637, lon: -123.2551, service_type: "food" }],
    });
  });

  it("find_person highlights each distinct office building once", () => {
    const building = { code: "CEME", name: "Civil and Mechanical Engineering", lat: 49.2624, lon: -123.2489 };
    const call: ToolCall = {
      name: "find_person",
      input: { query: "Louie" },
      result: {
        people: [
          { name: "A", office: "CEME 1214", building },
          { name: "B", office: "CEME 2020", building },
          { name: "C", office: "PPC" },
        ],
      },
    };
    expect(extractPeopleHighlight(call)).toEqual({ kind: "buildings", buildings: [building] });
    expect(toolCallToCanvasView(call)?.paneId).toBe("map");
    expect(extractPeopleHighlight({ ...call, result: { people: [{ name: "C" }] } })).toBeNull();
    expect(extractPeopleHighlight({ ...call, result: { status: "error", message: "none" } })).toBeNull();
  });
});
