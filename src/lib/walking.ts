// Map-driving tool-call interpretation, shared by the chat renderers (which
// emit map highlight state) and the chat panel (which clears it when the
// latest response has no map-driving call).

import { isToolError, type ToolCall, type WalkingDistanceResult } from "@/src/lib/api-types";

interface WalkingHighlight {
  kind: "route";
  /** Building identifiers as the tool reported them (code preferred). */
  from: string;
  to: string;
  meters: number;
  minutes: number;
}

interface BuildingRef {
  code: string;
  name: string;
  lat: number;
  lon: number;
}

interface BuildingsHighlight {
  kind: "buildings";
  buildings: BuildingRef[];
}

interface PlacePin {
  name: string;
  lat: number;
  lon: number;
  service_type: string | null;
}

interface PlacesHighlight {
  kind: "places";
  /** Building code the search was anchored to, when given. */
  near: string | null;
  places: PlacePin[];
}

/** What the campus map renders: a walking route, focused buildings, or POI pins. */
export type MapHighlight = WalkingHighlight | BuildingsHighlight | PlacesHighlight;

/**
 * A map-renderable highlight from a walking_distance call, or null when the
 * call failed (`status: "error"`) or the payload is malformed. Building
 * identifiers come from the `result` — the backend's canonical BLDG_CODEs,
 * which is what the map matches footprints against (the raw input may be a
 * colloquial alias like "IKB" that resolves to IBLC). Input is only a
 * fallback for malformed results.
 */
export function extractWalkingHighlight(call: ToolCall): WalkingHighlight | null {
  if (call.name !== "walking_distance" || isToolError(call.result)) return null;
  const result = call.result as Partial<WalkingDistanceResult> | undefined;
  if (typeof result?.meters !== "number" || typeof result.minutes !== "number") return null;
  // Reject non-finite or negative values
  if (!Number.isFinite(result.meters) || !Number.isFinite(result.minutes)) return null;
  if (result.meters < 0 || result.minutes < 0) return null;
  const from =
    (typeof result.from === "string" && result.from) ||
    (typeof call.input.from_building === "string" && call.input.from_building) ||
    "";
  const to =
    (typeof result.to === "string" && result.to) ||
    (typeof call.input.to_building === "string" && call.input.to_building) ||
    "";
  if (!from || !to) return null;
  return { kind: "route", from, to, meters: result.meters, minutes: result.minutes };
}

/**
 * A building highlight from a healthy find_building call: the map highlights
 * the footprint and flies to it.
 */
export function extractBuildingHighlight(call: ToolCall): BuildingsHighlight | null {
  if (call.name !== "find_building" || isToolError(call.result)) return null;
  const result = call.result as Partial<BuildingRef> | undefined;
  if (
    typeof result?.code !== "string" ||
    !result.code ||
    typeof result.lat !== "number" ||
    typeof result.lon !== "number"
  ) {
    return null;
  }
  // Reject coordinates outside valid WGS84 range
  if (!Number.isFinite(result.lat) || !Number.isFinite(result.lon)) return null;
  if (result.lat < -90 || result.lat > 90 || result.lon < -180 || result.lon > 180) return null;
  const name = typeof result.name === "string" && result.name ? result.name : result.code;
  return { kind: "buildings", buildings: [{ code: result.code, name, lat: result.lat, lon: result.lon }] };
}

/**
 * POI pins from a healthy find_places call: every result with a name and
 * coordinates becomes a map marker.
 */
export function extractPlacesHighlight(call: ToolCall): PlacesHighlight | null {
  if (call.name !== "find_places" || isToolError(call.result)) return null;
  const result = call.result as { near_building?: unknown; places?: unknown } | undefined;
  if (!Array.isArray(result?.places)) return null;
  const places: PlacePin[] = [];
  for (const p of result.places as Partial<PlacePin>[]) {
    if (typeof p?.name !== "string" || !p.name || typeof p.lat !== "number" || typeof p.lon !== "number") continue;
    // Filter entries with invalid coordinates
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    if (p.lat < -90 || p.lat > 90 || p.lon < -180 || p.lon > 180) continue;
    places.push({
      name: p.name,
      lat: p.lat,
      lon: p.lon,
      service_type: typeof p.service_type === "string" ? p.service_type : null,
    });
  }
  if (places.length === 0) return null;
  const near =
    (typeof result.near_building === "string" && result.near_building) ||
    (typeof call.input.near_building === "string" && call.input.near_building) ||
    null;
  return { kind: "places", near, places };
}

/**
 * The map state for a whole response: the route if one was computed (the
 * "going A → B" answer), else place pins, else ALL looked-up buildings
 * together — so "highlight the buildings" lights up every one, not just the
 * last call.
 */
export function mergeMapHighlights(calls: ToolCall[]): MapHighlight | null {
  const routes = calls.map(extractWalkingHighlight).filter((h) => h !== null);
  if (routes.length > 0) return routes[routes.length - 1];
  const places = calls.map(extractPlacesHighlight).filter((h) => h !== null);
  if (places.length > 0) return places[places.length - 1];
  const byCode = new Map<string, BuildingRef>();
  for (const call of calls) {
    for (const b of extractBuildingHighlight(call)?.buildings ?? []) byCode.set(b.code, b);
  }
  if (byCode.size > 0) return { kind: "buildings", buildings: [...byCode.values()] };
  return null;
}
