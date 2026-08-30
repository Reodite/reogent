import { ESTIMATE_DETOUR, haversineMetersObj, WALK_SPEED_M_PER_MIN } from "@/src/shared/types";
import type { DatasetModule, SearchClient } from "../core/types";
import { getIndexFreshness } from "../freshness";
import { resolveBuilding, type BuildingDoc } from "./buildings";
import type { ParkingDoc } from "./parking";

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
export function nearestFirst<T extends { lat: number; lon: number }>(
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
          "Find points of interest on UBC Vancouver campus: cafes, restaurants, libraries, groceries, banks, medical services, child care, transit, campus services — or public parking lots (category 'parking') with rates, hours, EV charging, and accessibility. For parking questions (rates, EV charging, accessibility, whether permit required) ALWAYS set category=\"parking\". Optionally sorted by walking distance from a building. Hours are free text — quote them as-is.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              query: { type: "string", description: 'Optional name keywords, e.g. "Tim Hortons"' },
              category: {
                type: "string",
                enum: [
                  "cafe",
                  "restaurant",
                  "library",
                  "grocery",
                  "bank",
                  "medical",
                  "transit",
                  "campus_services",
                  "academic",
                  "parking",
                ],
                description:
                  'Optional type filter. Use "parking" to find parking lots with rates and EV charging; otherwise a place category',
              },
              near_building: {
                type: "string",
                description: "Optional building code or name to sort results by walking distance from",
              },
              ev_charging: { type: "boolean", description: "Parking only: if true, only facilities with EV charging" },
              motorcycle: { type: "boolean", description: "Parking only: if true, only lots with motorcycle parking" },
              bike_cage: { type: "boolean", description: "Parking only: if true, only lots with secured bike cages" },
              accessible_stalls: {
                type: "boolean",
                description: "Parking only: if true, only lots with accessible (disabled) stalls",
              },
              limit: { type: "number", description: "Max results (default 10)" },
            },
            required: [],
          },
        },
      },
      async execute(input, search) {
        const category = input.category ? String(input.category) : "";
        const isParking = category === "parking";
        const queryText = input.query ? String(input.query) : "";
        const filters: string[] = [];
        if (isParking) {
          if (input.ev_charging) filters.push("ev_charging = true");
          if (input.motorcycle) filters.push("motorcycle = true");
          if (input.bike_cage) filters.push("bike_cage = true");
          if (input.accessible_stalls) filters.push("accessible_stalls = true");
        } else if (category) {
          filters.push(`service_type = '${category}'`);
        }
        const limit = Math.min(Number(input.limit) || 10, 30);
        const filterStr = filters.length > 0 ? filters.join(" AND ") : undefined;
        let { results, near, truncated_before_sort } = await searchNearable<PoiDoc | ParkingDoc>(
          search,
          isParking ? "parking" : "poi",
          queryText,
          filterStr,
          input.near_building,
          limit,
        );
        // A keyword that matches nothing shouldn't kill the lookup — retry
        // with the filters alone so e.g. "vegetarian near the Nest" still
        // returns nearby food instead of an error.
        let keywordDropped = false;
        if (results.length === 0 && queryText) {
          keywordDropped = true;
          ({ results, near, truncated_before_sort } = await searchNearable<PoiDoc | ParkingDoc>(
            search,
            isParking ? "parking" : "poi",
            "",
            filterStr,
            input.near_building,
            limit,
          ));
        }
        if (results.length === 0) throw new Error(`No ${isParking ? "parking facilities" : "places"} matched`);
        const key = isParking ? "parking" : "places";
        const asOf = isParking ? await getIndexFreshness("parking") : null;
        return {
          ...(near ? { near_building: near.code } : {}),
          ...(asOf ? { rates_as_of: asOf } : {}),
          ...(keywordDropped
            ? { note: `No match for "${queryText}"; showing all matching places sorted by distance.` }
            : {}),
          ...(truncated_before_sort ? { note: "Many matches exist; nearest results may be approximate." } : {}),
          [key]: results,
        };
      },
    },
  ],
};
