import { ESTIMATE_DETOUR, haversineMetersObj, WALK_SPEED_M_PER_MIN } from "@/src/shared/types";
import type { DatasetModule, SearchClient } from "../core/types";
import { resolveBuilding, type BuildingDoc } from "./buildings";

export interface PoiDoc {
  id: string;
  name: string;
  abbreviation: string | null;
  service_type: string | null; // cafe, restaurant, library, grocery, bank, ...
  url: string | null;
  contact: string | null;
  hours: string | null; // free text — return verbatim, never parse
  photo: string | null;
  lat: number;
  lon: number;
}

// biome-ignore lint/suspicious/noExplicitAny: raw GeoJSON features
type Feature = Record<string, any>;

export function transformPoi(f: Feature): { id: string; doc: PoiDoc } | null {
  const p = f?.properties ?? {};
  const coords = f?.geometry?.coordinates;
  if (!p.PLACENAME || !Array.isArray(coords)) return null;
  if (p.STATUS && p.STATUS !== "Current") return null;
  return {
    id: String(p.POI_ID ?? p.OBJECTID),
    doc: {
      id: String(p.POI_ID ?? p.OBJECTID),
      name: String(p.PLACENAME),
      abbreviation: p.ABBREVIATEDPLACENAME ?? null,
      service_type: p.SERVICE_TYPE ?? null,
      url: p.URL ?? null,
      contact: p.CONTACT ?? null,
      hours: p.HOURS ?? null,
      photo: p.PHOTOURL ?? null,
      lon: coords[0],
      lat: coords[1],
    },
  };
}

/** Straight-line walk estimate to each item, nearest first — same detour
 *  factor and speed as the routing fallback (src/server/routing.ts). Ranking
 *  stays on haversine deliberately; only walking_distance/api-route use the
 *  path network. */
// ponytail: haversine over ≤500 docs sorted in JS, no geo_point mapping; move to geo queries if datasets grow
function nearestFirst<T extends { lat: number; lon: number }>(
  items: T[],
  from: BuildingDoc,
): (T & { walk_meters: number; walk_minutes: number })[] {
  return items
    .map((item) => {
      const walk_meters = Math.round(haversineMetersObj(from, item) * ESTIMATE_DETOUR);
      return { ...item, walk_meters, walk_minutes: Math.ceil(walk_meters / WALK_SPEED_M_PER_MIN) };
    })
    .sort((a, b) => a.walk_meters - b.walk_meters);
}

export async function searchNearable<T extends { lat: number; lon: number }>(
  search: SearchClient,
  index: string,
  queryText: string,
  filter: string | undefined,
  nearBuilding: unknown,
  limit: number,
): Promise<{ results: T[]; near?: BuildingDoc; truncated_before_sort?: boolean }> {
  const NEAR_FETCH_CAP = 500;
  const res = await search.index(index).search(queryText, {
    filter,
    limit: nearBuilding ? NEAR_FETCH_CAP : limit,
  });
  let results = res.hits as unknown as T[];
  if (!nearBuilding) return { results };
  const truncated_before_sort = results.length >= NEAR_FETCH_CAP;
  const near = await resolveBuilding(search, String(nearBuilding));
  results = nearestFirst(results, near).slice(0, limit);
  return { results, near, ...(truncated_before_sort ? { truncated_before_sort } : {}) };
}

export const places: DatasetModule = {
  name: "places",
  indices: [
    {
      index: "poi",
      settings: {
        searchableAttributes: ["name", "abbreviation"],
        filterableAttributes: ["service_type"],
      },
      async *read(store) {
        yield* ((await store.getJson("geospatial/ubcv/locations/geojson/ubcv_poi.geojson")) as { features: Feature[] })
          .features;
      },
      transform: transformPoi,
    },
  ],
  tools: [
    {
      spec: {
        name: "find_places",
        description:
          "Find points of interest on UBC Vancouver campus: cafes, restaurants, libraries, groceries, banks, medical services, child care, transit. Optionally sorted by walking distance from a building. Hours are free text — quote them as-is.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              query: { type: "string", description: 'Optional name keywords, e.g. "Tim Hortons"' },
              service_type: {
                type: "string",
                description:
                  'Optional type filter: "cafe", "restaurant", "library", "grocery", "bank", "medical", "child_care", "transit", "campus_services", "commercial_services", "academic"',
              },
              near_building: {
                type: "string",
                description: "Optional building code or name to sort results by walking distance from",
              },
              limit: { type: "number", description: "Max results (default 10)" },
            },
            required: [],
          },
        },
      },
      async execute(input, search) {
        const queryText = input.query ? String(input.query) : "";
        const filters: string[] = [];
        if (input.service_type) filters.push(`service_type = '${String(input.service_type)}'`);
        const limit = Math.min(Number(input.limit) || 10, 30);
        const { results, near, truncated_before_sort } = await searchNearable<PoiDoc>(
          search,
          "poi",
          queryText,
          filters.length > 0 ? filters.join(" AND ") : undefined,
          input.near_building,
          limit,
        );
        if (results.length === 0) throw new Error(`No places matched "${input.query ?? input.service_type ?? ""}"`);
        return {
          ...(near ? { near_building: near.code } : {}),
          ...(truncated_before_sort ? { note: "Many matches exist; nearest results may be approximate." } : {}),
          places: results,
        };
      },
    },
  ],
};
