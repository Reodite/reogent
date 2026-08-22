// Map-driving tool-call interpretation, shared by the chat renderers (which
// emit map highlight state) and the chat panel (which clears it when the
// latest response has no map-driving call).

import type { CanvasView } from "@/src/components/shell/pane-registry";
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
 * Parking pins from a find_places call with category "parking" (or the legacy
 * find_parking tool): each lot with a name and coordinates becomes a map marker.
 */
export function extractParkingHighlight(call: ToolCall): PlacesHighlight | null {
  if (isToolError(call.result)) return null;
  const isParking = call.name === "find_parking" || (call.name === "find_places" && call.input.category === "parking");
  if (!isParking) return null;
  const result = call.result as { near_building?: unknown; parking?: unknown } | undefined;
  if (!Array.isArray(result?.parking)) return null;
  const places: PlacePin[] = [];
  for (const p of result.parking as Partial<{ name: string; lat: number; lon: number }>[]) {
    if (typeof p?.name !== "string" || !p.name || typeof p.lat !== "number" || typeof p.lon !== "number") continue;
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    if (p.lat < -90 || p.lat > 90 || p.lon < -180 || p.lon > 180) continue;
    places.push({ name: p.name, lat: p.lat, lon: p.lon, service_type: null });
  }
  if (places.length === 0) return null;
  const near =
    (typeof result.near_building === "string" && result.near_building) ||
    (typeof call.input.near_building === "string" && call.input.near_building) ||
    null;
  return { kind: "places", near, places };
}

/** Tries every map-driving extractor; only one matches a given call name. */
function extractMapHighlight(call: ToolCall): MapHighlight | null {
  return (
    extractWalkingHighlight(call) ??
    extractPlacesHighlight(call) ??
    extractBuildingHighlight(call) ??
    extractParkingHighlight(call)
  );
}

/**
 * The canvas pane a tool call should load, or null when the call does not map
 * to a pane (unmapped tools render a static widget and never touch the canvas).
 * Map-driving tools reuse the existing extractors; course/prereq/calendar tools
 * seed the matching pane's state from the result. Error results yield null.
 * show_widget delegates to the same shape via its result `type`.
 */
export function toolCallToCanvasView(call: ToolCall): CanvasView | null {
  const highlight = extractMapHighlight(call);
  if (highlight) return { paneId: "map", state: { highlight } };

  if (call.name === "show_widget") {
    const outer = call.result as { type?: string; result?: unknown } | undefined;
    const data = outer?.result as Record<string, unknown> | undefined;
    switch (outer?.type) {
      case "route": {
        const r = data as { from?: string; to?: string; meters?: number; minutes?: number } | undefined;
        if (typeof r?.meters !== "number" || !r.from || !r.to) return null;
        const highlightRoute: MapHighlight = {
          kind: "route",
          from: r.from,
          to: r.to,
          meters: r.meters,
          minutes: r.minutes,
        };
        return { paneId: "map", state: { highlight: highlightRoute } };
      }
      case "building": {
        const b = data as { code?: string; name?: string; lat?: number; lon?: number } | undefined;
        if (!b?.code || typeof b.lat !== "number" || typeof b.lon !== "number") return null;
        const highlightBuildings: MapHighlight = {
          kind: "buildings",
          buildings: [{ code: b.code, name: b.name ?? b.code, lat: b.lat, lon: b.lon }],
        };
        return { paneId: "map", state: { highlight: highlightBuildings } };
      }
      case "places": {
        const p = data as
          | {
              near_building?: string;
              places?: { name?: string; lat?: number; lon?: number; service_type?: string | null }[];
            }
          | undefined;
        if (!Array.isArray(p?.places)) return null;
        const places = p.places
          .filter((pl) => typeof pl?.name === "string" && typeof pl.lat === "number" && typeof pl.lon === "number")
          .map((pl) => ({
            name: pl.name as string,
            lat: pl.lat as number,
            lon: pl.lon as number,
            service_type: pl.service_type ?? null,
          }));
        if (places.length === 0) return null;
        const highlightPlaces: MapHighlight = { kind: "places", near: p.near_building ?? null, places };
        return { paneId: "map", state: { highlight: highlightPlaces } };
      }
      case "parking": {
        const p = data as
          | { near_building?: string; parking?: { name?: string; lat?: number; lon?: number }[] }
          | undefined;
        if (!Array.isArray(p?.parking)) return null;
        const places = p.parking
          .filter((pl) => typeof pl?.name === "string" && typeof pl.lat === "number" && typeof pl.lon === "number")
          .map((pl) => ({
            name: pl.name as string,
            lat: pl.lat as number,
            lon: pl.lon as number,
            service_type: null,
          }));
        if (places.length === 0) return null;
        const highlightParking: MapHighlight = { kind: "places", near: p.near_building ?? null, places };
        return { paneId: "map", state: { highlight: highlightParking } };
      }
      case "course": {
        const c = data as { code?: string } | undefined;
        if (!c?.code) return null;
        return { paneId: "course-lookup", state: { code: c.code } };
      }
      case "courses": {
        const list = data as { courses?: { code?: string }[] } | undefined;
        const first = Array.isArray(list?.courses) ? list.courses[0] : undefined;
        if (!first?.code) return null;
        return { paneId: "course-lookup", state: { code: first.code } };
      }
      case "prereq_tree": {
        const g = data as { rootCode?: string } | undefined;
        if (!g?.rootCode) return null;
        return { paneId: "prereq-tree", state: { root: g.rootCode, selections: {} } };
      }
      case "key_dates": {
        const list = data as { dates?: unknown[] } | undefined;
        if (!Array.isArray(list?.dates) || list.dates.length === 0) return null;
        return {
          paneId: "calendar",
          state: { cursor: new Date().toISOString().slice(0, 7), kinds: ["academic", "holiday"] },
        };
      }
    }
    return null;
  }

  switch (call.name) {
    case "get_course": {
      if (isToolError(call.result)) return null;
      const result = call.result as Partial<{ code: string }> | undefined;
      const code =
        (typeof result?.code === "string" && result.code) ||
        (typeof call.input.course_code === "string" && call.input.course_code) ||
        "";
      if (!code) return null;
      return { paneId: "course-lookup", state: { code } };
    }
    case "find_courses": {
      if (isToolError(call.result)) return null;
      const result = call.result as Partial<{ courses: { code?: string }[] }> | undefined;
      const first = Array.isArray(result?.courses) ? result.courses[0] : undefined;
      const code =
        (typeof first?.code === "string" && first.code) ||
        (typeof call.input.subject === "string" && call.input.subject) ||
        "";
      if (!code) return null;
      return { paneId: "course-lookup", state: { code } };
    }
    case "get_prereq_tree": {
      if (isToolError(call.result)) return null;
      const result = call.result as Partial<{ rootCode: string }> | undefined;
      const root =
        (typeof result?.rootCode === "string" && result.rootCode) ||
        (typeof call.input.course_code === "string" && call.input.course_code) ||
        "";
      if (!root) return null;
      return { paneId: "prereq-tree", state: { root, selections: {} } };
    }
    case "get_key_dates": {
      if (isToolError(call.result)) return null;
      return {
        paneId: "calendar",
        state: { cursor: new Date().toISOString().slice(0, 7), kinds: ["academic", "holiday"] },
      };
    }
    default:
      return null;
  }
}
