import { buildingAliases } from "@/src/lib/building-catalog";
import { featureCentroid, type BuildingFeature } from "@/src/lib/geo";
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

export function transformBuilding(f: Feature): { id: string; doc: BuildingDoc } | null {
  const code = f?.properties?.BLDG_CODE;
  if (!code) return null;
  const pt = featureCentroid(f as BuildingFeature);
  if (!pt) return null;
  const [lon, lat] = pt;
  const name = f.properties.NAME ?? code;
  return { id: code, doc: { code, name, aliases: buildingAliases(name, f.properties.SHORTNAME), lat, lon } };
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

const PUBLIC_BUILDING_FIELDS = [
  "BLDG_CODE",
  "NAME",
  "SHORTNAME",
  "POSTAL_CODE",
  "PRIMARY_ADDRESS",
  "CONSTR_STATUS",
  "OCCU_DATE",
  "BLDG_USAGE",
  "BLDG_SEC_USAGE",
  "JURISDICTION",
  "NEIGHBOURHOOD",
  "MANAGE_ORG",
  "BLDG_STATE",
  "GREEN_STATUS",
  "CONSTR_TYPE",
  "MAX_FLOORS",
  "BLDG_HEIGHT",
  "GBA",
  "BLDG_FORM",
  "BLDG_CONDITION",
  "BLDG_MAINTENANCE",
  "LABEL_NAME",
] as const;

/** Removes source identifiers and undocumented fields from public building geometry. */
export function publicBuildingsGeoJson(collection: FeatureCollection): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: collection.features.flatMap((feature) => {
      if (feature.geometry?.type !== "Polygon" && feature.geometry?.type !== "MultiPolygon") return [];
      const source = (feature.properties ?? {}) as Record<string, unknown>;
      if (typeof source.BLDG_CODE !== "string" || typeof source.NAME !== "string") return [];
      return [
        {
          type: "Feature" as const,
          geometry: feature.geometry,
          properties: Object.fromEntries(
            PUBLIC_BUILDING_FIELDS.flatMap((field) => (source[field] == null ? [] : [[field, source[field]]])),
          ),
        },
      ];
    }),
  };
}

/** Joins current entrance points to public building codes and drops undocumented flags. */
export function publicEntrancesGeoJson(
  buildingsCollection: FeatureCollection,
  entrancesCollection: FeatureCollection,
): FeatureCollection {
  const uidToCode = new Map<string, string>();
  for (const feature of buildingsCollection.features) {
    const properties = (feature.properties ?? {}) as Record<string, unknown>;
    if (properties.BLDG_UID && properties.BLDG_CODE) {
      uidToCode.set(String(properties.BLDG_UID), String(properties.BLDG_CODE).toUpperCase());
    }
  }
  return {
    type: "FeatureCollection",
    features: entrancesCollection.features.flatMap((feature, index) => {
      if (feature.geometry?.type !== "Point") return [];
      const properties = (feature.properties ?? {}) as Record<string, unknown>;
      if (properties.STATUS !== "Current") return [];
      const code = uidToCode.get(String(properties.BLDG_UID ?? ""));
      const [longitude, latitude] = feature.geometry.coordinates;
      if (!code || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return [];
      const doorCount = Number(properties.NUM_DOORS);
      return [
        {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [longitude, latitude] },
          properties: {
            id: `${code}-${index}`,
            buildingCode: code,
            entranceType: typeof properties.ENTRANCE_TYPE === "string" ? properties.ENTRANCE_TYPE : null,
            doorCount: Number.isFinite(doorCount) && doorCount >= 0 ? doorCount : null,
          },
        },
      ];
    }),
  };
}

export async function getPublicBuildingsGeoJson(): Promise<FeatureCollection> {
  return publicBuildingsGeoJson(await getBuildingsGeoJson());
}

let entrancesPromise: Promise<FeatureCollection> | undefined;
let entrancesLoadedAt = 0;

export function getPublicEntrancesGeoJson(): Promise<FeatureCollection> {
  if (entrancesPromise && Date.now() - entrancesLoadedAt > GEO_TTL_MS) entrancesPromise = undefined;
  entrancesPromise ??= Promise.all([getBuildingsGeoJson(), dataStore().getJson(ENTRANCES_KEY)])
    .then(([buildingsCollection, entrancesCollection]) => {
      entrancesLoadedAt = Date.now();
      return publicEntrancesGeoJson(buildingsCollection, entrancesCollection as FeatureCollection);
    })
    .catch((error) => {
      entrancesPromise = undefined;
      throw error;
    });
  return entrancesPromise;
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
    if (!hit) {
      // Surface the closest real name so the model can retry with something
      // that actually exists instead of guessing more codes.
      const suggest = await search.index("buildings").search(query.slice(0, 4), { limit: 3 });
      const names = (suggest.hits as unknown as BuildingDoc[]).map((b) => b.name).filter(Boolean);
      throw new Error(
        `Unknown building: "${query}"${names.length > 0 ? `. Closest matches: ${names.join("; ")}` : ""}`,
      );
    }
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
          'Walking distance and time between two UBC Vancouver buildings. Pass the building names or codes directly — no need to call find_building first. For example: from_building="ICCS" to_building="Buchanan". Route is computed over the campus pedestrian path network.',
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
          'Resolve a UBC Vancouver building by name or code to its official building code, full name, and coordinates. Only use this when you need the building\'s official code or lat/lon. Do NOT use this for walking routes (use walking_distance) or parking (use find_places with category="parking"). walking_distance and find_places accept building names directly.',
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
    { name: "buildings", load: getPublicBuildingsGeoJson },
    { name: "entrances", load: getPublicEntrancesGeoJson },
    { name: "walking-routes", path: WALKING_ROUTES_KEY },
  ],
};
