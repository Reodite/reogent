import type { BuildingSummary } from "@/src/lib/api-types";
import fc from "fast-check";
import type { FeatureCollection } from "geojson";
import { describe, expect, it } from "vitest";
import {
  buildingAliases,
  buildingsFromGeoJson,
  formatBuildingUrl,
  parseBuildingParam,
  POPULAR_BUILDING_CODES,
  popularBuildings,
  searchBuildings,
} from "./building-catalog";

function building(code: string, name = `Building ${code}`): BuildingSummary {
  return {
    code,
    name,
    shortName: null,
    aliases: [],
    address: null,
    postalCode: null,
    usage: null,
    state: null,
    floors: null,
    heightMeters: null,
    centroid: [-123.25, 49.26],
  };
}

describe("building catalog", () => {
  it("derives acronym aliases from official and short names", () => {
    expect(buildingAliases("Irving K. Barber Learning Centre", "I.K. Barber")).toEqual(["IK", "IKB", "IKBL", "IKBLC"]);
  });

  it("projects valid polygon features into unique sorted summaries", () => {
    const feature = (code: string, name: string) => ({
      type: "Feature" as const,
      properties: { BLDG_CODE: code, NAME: name, PRIMARY_ADDRESS: "1 Main Mall", MAX_FLOORS: 3 },
      geometry: {
        type: "Polygon" as const,
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
    });
    const collection: FeatureCollection = {
      type: "FeatureCollection",
      features: [feature("ZED", "Zed Hall"), feature("ALFA", "Alpha Hall"), feature("ALFA", "Duplicate")],
    };

    expect(buildingsFromGeoJson(collection).map(({ code, name }) => ({ code, name }))).toEqual([
      { code: "ALFA", name: "Alpha Hall" },
      { code: "ZED", name: "Zed Hall" },
    ]);
  });

  it("ranks exact codes before aliases, prefixes, and substrings", () => {
    const catalog = [
      { ...building("IBLC", "Irving K. Barber Learning Centre"), aliases: ["IKB"] },
      { ...building("IKB", "Institute Annex"), aliases: [] },
      building("WEST", "IKB Research Wing"),
    ];

    expect(searchBuildings(catalog, "ikb").map((item) => item.code)).toEqual(["IKB", "IBLC", "WEST"]);
  });

  it("keeps the curated list ordered and drops missing codes", () => {
    const catalog = [building("NEST"), building("IBLC"), building("CHEM")];
    expect(popularBuildings(catalog).map((item) => item.code)).toEqual(
      POPULAR_BUILDING_CODES.filter((code) => catalog.some((item) => item.code === code)),
    );
  });

  const codeArbitrary = fc
    .tuple(
      fc.string({ unit: fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"), minLength: 2, maxLength: 5 }),
      fc.option(fc.integer({ min: 0, max: 9 })),
    )
    .map(([letters, digit]) => `${letters}${digit ?? ""}`);
  const buildingArbitrary = fc
    .record({
      code: codeArbitrary,
      name: fc.string({
        unit: fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz"),
        minLength: 1,
        maxLength: 40,
      }),
      shortName: fc.option(
        fc.string({ unit: fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ "), minLength: 1, maxLength: 12 }),
        { nil: null },
      ),
      address: fc.option(
        fc.string({ unit: fc.constantFrom(..."0123456789 MainWestEast"), minLength: 1, maxLength: 30 }),
        { nil: null },
      ),
      lon: fc.double({ min: -123.3, max: -123.1, noNaN: true }),
      lat: fc.double({ min: 49.2, max: 49.35, noNaN: true }),
    })
    .map(({ code, name, shortName, address, lon, lat }): BuildingSummary => ({
      ...building(code, name),
      shortName,
      aliases: buildingAliases(name, shortName),
      address,
      centroid: [lon, lat],
    }));
  const catalogArbitrary = fc.uniqueArray(buildingArbitrary, {
    minLength: 1,
    maxLength: 40,
    selector: (item) => item.code,
  });

  // Feature: campus-map-explorer, Property 1: Building search is deterministic, unique, and bounded.
  it("keeps building search deterministic, unique, and bounded", () => {
    fc.assert(
      fc.property(catalogArbitrary, fc.integer({ min: 0, max: 30 }), fc.nat(), (catalog, limit, index) => {
        const query = catalog[index % catalog.length].code;
        const first = searchBuildings(catalog, query, limit);
        const second = searchBuildings(catalog, query, limit);
        expect(second).toEqual(first);
        expect(new Set(first.map((item) => item.code)).size).toBe(first.length);
        expect(first.length).toBeLessThanOrEqual(Math.min(20, limit));
        if (limit > 0) expect(first[0]?.code).toBe(query);
      }),
    );
  });

  // Feature: campus-map-explorer, Property 2: Selected-building URLs round-trip.
  it("round-trips selected building URLs", () => {
    fc.assert(
      fc.property(catalogArbitrary, fc.nat(), (catalog, index) => {
        const selected = catalog[index % catalog.length];
        const url = formatBuildingUrl(new URL("https://reodite.example/tools/map?theme=dark"), selected.code);
        expect(parseBuildingParam(url.searchParams.get("building"), catalog)?.code).toBe(selected.code);
        expect(url.searchParams.get("theme")).toBe("dark");
      }),
    );
  });
});
