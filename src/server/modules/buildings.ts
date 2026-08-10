import type { FeatureCollection } from "geojson";
import type { DatasetModule, SearchClient } from "../core/types";
import { dataStore } from "../data";
import { BUILDING_ENTRANCES_KEY, route, WALKING_ROUTES_KEY } from "../routing";

export interface BuildingDoc {
  code: string;
  name: string;
  /** Acronym aliases (e.g. "IKB" for Irving K. Barber) — colloquial codes that aren't the official BLDG_CODE. */
  aliases: string[];
  lat: number;
  lon: number;
}

// biome-ignore lint/suspicious/noExplicitAny: raw GeoJSON features
type Feature = Record<string, any>;

const BUILDINGS_KEY = "geospatial/ubcv/locations/geojson/ubcv_buildings.geojson";
const ROUTES_KEY = "geospatial/ubcv/transportation/geojson/ubcv_routes.geojson";
const ENTRANCES_KEY = "geospatial/ubcv/locations/geojson/ubcv_building_entraces.geojson"; // (sic — dataset typo)

/** Average of all footprint vertices — good enough for walking estimates. */
function centroid(geometry: Feature): { lat: number; lon: number } {
  let latSum = 0;
  let lonSum = 0;
  let n = 0;
  const walk = (c: unknown) => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number" && typeof c[1] === "number") {
      lonSum += c[0];
      latSum += c[1];
      n++;
    } else {
      for (const child of c) walk(child);
    }
  };
  walk(geometry?.coordinates);
  return { lat: latSum / n, lon: lonSum / n };
}

/** Initial-letter prefixes (length ≥ 2) of each name — how people abbreviate
 *  buildings colloquially: "Irving K. Barber Learning Centre" → IK, IKB, IKBL, IKBLC. */
function acronymAliases(...names: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const name of names) {
    if (!name) continue;
    const initials = name
      .split(/[^A-Za-z]+/)
      .map((word) => word[0] ?? "")
      .join("")
      .toUpperCase();
    for (let n = 2; n <= initials.length; n++) out.add(initials.slice(0, n));
  }
  return [...out];
}

export function transformBuilding(f: Feature): { id: string; doc: BuildingDoc } | null {
  const code = f?.properties?.BLDG_CODE;
  if (!code) return null;
  const { lat, lon } = centroid(f.geometry);
  const name = f.properties.NAME ?? code;
  return { id: code, doc: { code, name, aliases: acronymAliases(name, f.properties.SHORTNAME), lat, lon } };
}

let geoPromise: Promise<FeatureCollection> | undefined;
let geoLoadedAt = 0;
const GEO_TTL_MS = 10 * 60 * 1000;

/** Cached raw buildings GeoJSON — footprints for point-in-polygon joins
 *  (e.g. which POIs sit inside a building). Same TTL pattern as the
 *  routing graph. */
export function getBuildingsGeoJson(): Promise<FeatureCollection> {
  if (geoPromise && Date.now() - geoLoadedAt > GEO_TTL_MS) geoPromise = undefined;
  geoPromise ??= dataStore()
    .getJson(BUILDINGS_KEY)
    .then((geo) => {
      geoLoadedAt = Date.now();
      return geo as FeatureCollection;
    })
    .catch((e) => {
      geoPromise = undefined;
      throw e;
    });
  return geoPromise;
}

/** Exact code, then acronym alias ("IKB" → IBLC), then fuzzy name search. */
export async function resolveBuilding(search: SearchClient, query: string): Promise<BuildingDoc> {
  const norm = query.trim().toUpperCase();
  try {
    return (await search.index("buildings").getDocument(norm)) as unknown as BuildingDoc;
  } catch {
    const alias = await search.index("buildings").search("", {
      filter: `aliases = '${norm}'`,
      limit: 1,
    });
    const aliasHit = alias.hits[0];
    if (aliasHit) return aliasHit as unknown as BuildingDoc;
    const res = await search.index("buildings").search(query, { limit: 1 });
    const hit = res.hits[0];
    if (!hit) throw new Error(`Unknown building: "${query}"`);
    return hit as unknown as BuildingDoc;
  }
}

export const buildings: DatasetModule = {
  name: "buildings",
  indices: [
    {
      index: "buildings",
      settings: {
        searchableAttributes: ["code", "name", "aliases"],
        filterableAttributes: ["code", "aliases"],
      },
      async *read(store) {
        yield* ((await store.getJson(BUILDINGS_KEY)) as { features: Feature[] }).features;
      },
      transform: transformBuilding,
      async derive(store) {
        // pedestrian-only route lines, properties stripped — serves both the
        // map overlay and the routing graph (src/server/routing.ts)
        const routes = (await store.getJson(ROUTES_KEY)) as { features: Feature[] };
        await store.putJson(WALKING_ROUTES_KEY, {
          type: "FeatureCollection",
          features: routes.features
            .filter((f) => f.properties?.PEDESTRIAN_ACCESS === "Y")
            .map((f) => ({ type: "Feature", properties: {}, geometry: f.geometry })),
        });

        // building code -> entrance coordinates, joined via BLDG_UID — routing
        // snaps route endpoints to the nearest entrance pair instead of centroids
        const [buildingsGeo, entrancesGeo] = await Promise.all([
          store.getJson(BUILDINGS_KEY) as Promise<{ features: Feature[] }>,
          store.getJson(ENTRANCES_KEY) as Promise<{ features: Feature[] }>,
        ]);
        const uidToCode = new Map<string, string>();
        for (const f of buildingsGeo.features) {
          if (f.properties?.BLDG_UID && f.properties?.BLDG_CODE) {
            uidToCode.set(String(f.properties.BLDG_UID), String(f.properties.BLDG_CODE));
          }
        }
        const byCode: Record<string, [number, number][]> = {};
        for (const f of entrancesGeo.features) {
          if (f.properties?.STATUS !== "Current" || f.geometry?.type !== "Point") continue;
          const code = uidToCode.get(String(f.properties?.BLDG_UID ?? ""));
          if (!code) continue;
          byCode[code] ??= [];
          byCode[code].push(f.geometry.coordinates as [number, number]);
        }
        await store.putJson(BUILDING_ENTRANCES_KEY, byCode);
      },
    },
  ],
  tools: [
    {
      spec: {
        name: "walking_distance",
        description:
          "Walking distance and time between two UBC Vancouver buildings, by building code or name, routed over the campus pedestrian path network.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              from_building: {
                type: "string",
                description: 'Building code or name, e.g. "ICCS" or "Irving K. Barber"',
              },
              to_building: { type: "string", description: 'Building code or name, e.g. "BUCH"' },
            },
            required: ["from_building", "to_building"],
          },
        },
      },
      async execute(input, search) {
        const from = await resolveBuilding(search, String(input.from_building ?? ""));
        const to = await resolveBuilding(search, String(input.to_building ?? ""));
        if (from.code === to.code) return { from: from.code, to: to.code, meters: 0, minutes: 0 };
        // polyline stays out of the model context — /api/route serves it to the map
        const { meters, minutes, method } = await route(from, to);
        return { from: from.code, to: to.code, meters, minutes, method };
      },
    },
    {
      spec: {
        name: "find_building",
        description:
          "Resolve a UBC Vancouver building by name or code to its official building code, full name, and coordinates. Use this to get the code other tools need.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              query: { type: "string", description: 'Building name or code, e.g. "Irving K. Barber" or "ICCS"' },
            },
            required: ["query"],
          },
        },
      },
      async execute(input, search) {
        return await resolveBuilding(search, String(input.query ?? ""));
      },
    },
  ],
  geo: [
    { name: "buildings", path: BUILDINGS_KEY },
    { name: "walking-routes", path: WALKING_ROUTES_KEY },
  ],
};
