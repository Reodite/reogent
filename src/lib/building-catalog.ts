import type { BuildingSummary } from "@/src/lib/api-types";
import { featureCentroid, type BuildingFeature } from "@/src/lib/geo";
import type { FeatureCollection } from "geojson";

export const POPULAR_BUILDING_CODES = ["IBLC", "NEST", "LIFE", "BUCH", "ICCS", "CIRS", "SRC", "CHEM"] as const;

const SEARCH_LIMIT = 20;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nonNegativeNumber(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function normalizeBuildingText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

/** Generates the same initial-letter aliases used by server building resolution. */
export function buildingAliases(...names: (string | null | undefined)[]): string[] {
  const aliases = new Set<string>();
  for (const name of names) {
    if (!name) continue;
    const initials = name
      .split(/[^A-Za-z]+/)
      .map((word) => word[0] ?? "")
      .join("")
      .toUpperCase();
    for (let length = 2; length <= initials.length; length++) aliases.add(initials.slice(0, length));
  }
  return [...aliases];
}

function toBuildingSummary(feature: BuildingFeature): BuildingSummary | null {
  const properties = feature.properties ?? {};
  const code = normalizeBuildingText(text(properties.BLDG_CODE) ?? "");
  const name = text(properties.NAME);
  const centroid = featureCentroid(feature);
  if (!code || !name || !centroid) return null;
  const shortName = text(properties.SHORTNAME);
  return {
    code,
    name,
    shortName,
    aliases: buildingAliases(name, shortName),
    address: text(properties.PRIMARY_ADDRESS),
    postalCode: text(properties.POSTAL_CODE),
    usage: text(properties.BLDG_USAGE),
    state: text(properties.BLDG_STATE),
    floors: nonNegativeNumber(properties.MAX_FLOORS),
    heightMeters: nonNegativeNumber(properties.BLDG_HEIGHT),
    centroid,
  };
}

/** Converts public building GeoJSON into one deterministic summary per code. */
export function buildingsFromGeoJson(collection: FeatureCollection): BuildingSummary[] {
  const byCode = new Map<string, BuildingSummary>();
  for (const feature of collection.features) {
    if (feature.geometry?.type !== "Polygon" && feature.geometry?.type !== "MultiPolygon") continue;
    const summary = toBuildingSummary(feature as BuildingFeature);
    if (summary && !byCode.has(summary.code)) byCode.set(summary.code, summary);
  }
  return [...byCode.values()].sort((a, b) => compareText(a.name, b.name) || compareText(a.code, b.code));
}

function searchRank(building: BuildingSummary, query: string): number | null {
  if (building.code === query) return 0;
  if (building.aliases.some((alias) => alias === query)) return 1;
  const values = [building.code, building.name, building.shortName, building.address, ...building.aliases]
    .filter((value): value is string => Boolean(value))
    .map(normalizeBuildingText);
  if (values.some((value) => value.startsWith(query))) return 2;
  if (values.some((value) => value.includes(query))) return 3;
  return null;
}

/** Ranks local building matches by exact code, alias, prefix, then substring. */
export function searchBuildings(catalog: BuildingSummary[], query: string, limit = SEARCH_LIMIT): BuildingSummary[] {
  const normalized = normalizeBuildingText(query);
  if (!normalized) return [];
  const cappedLimit = Math.max(0, Math.min(SEARCH_LIMIT, Math.floor(limit)));
  return catalog
    .map((building) => ({ building, rank: searchRank(building, normalized) }))
    .filter((entry): entry is { building: BuildingSummary; rank: number } => entry.rank !== null)
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        compareText(a.building.name, b.building.name) ||
        compareText(a.building.code, b.building.code),
    )
    .slice(0, cappedLimit)
    .map((entry) => entry.building);
}

/** Returns configured popular buildings that still exist in the loaded catalog. */
export function popularBuildings(catalog: BuildingSummary[]): BuildingSummary[] {
  const byCode = new Map(catalog.map((building) => [building.code, building]));
  return POPULAR_BUILDING_CODES.flatMap((code) => {
    const building = byCode.get(code);
    return building ? [building] : [];
  });
}

export function parseBuildingParam(value: string | null, catalog: BuildingSummary[]): BuildingSummary | null {
  if (!value) return null;
  const code = normalizeBuildingText(value);
  return catalog.find((building) => building.code === code) ?? null;
}

export function formatBuildingUrl(base: URL, code: string): URL {
  const url = new URL(base);
  url.searchParams.set("building", normalizeBuildingText(code));
  return url;
}
