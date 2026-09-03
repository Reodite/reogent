"use client";

// Campus_Map: deck.gl v9 layers over a MapLibre basemap. Buildings come from
// /api/geo/buildings (cached client-side by the api layer) extruded to their
// real heights (BLDG_HEIGHT / MAX_FLOORS), with a pick-tooltip showing
// NAME / BLDG_CODE; walking routes are an optional context layer.
//
// Agent tool calls drive the highlight: a walking_distance call traces the
// actual pedestrian-network polyline from /api/route, and a find_building call
// highlights the footprint and flies to it.
//
// maplibre + deck are imported dynamically inside the init effect so the ~1 MB
// of map code stays out of the initial bundle (and out of SSR).
// Precomputed convex hull of campus buildings + buffer distance in degrees (~1.5km)
import campusHull from "@/data/campus-hull.json";
import type { MapHighlight } from "@/src/components/chat/chat-shell-context";
import { BuildingPopup, type SelectedBuilding } from "@/src/components/map/building-popup";
import { useApi, useTheme, type ResolvedTheme } from "@/src/components/providers";
import type { BuildingSummary, EntranceFeatureCollection } from "@/src/lib/api-types";
import { buildingFromFeature } from "@/src/lib/building-catalog";
import { buildEntranceMarkers, visibleEntranceMarkers } from "@/src/lib/entrance-geometry";
import { formatMeters, formatMinutes } from "@/src/lib/format";
import { featureCentroid, featuresBounds, findBuilding, type BuildingFeature, type LngLat } from "@/src/lib/geo";
import { cachePaneState, getCachedPaneState } from "@/src/lib/pane-state-cache";
import { drawableRoutePath } from "@/src/lib/walking";
import type { LayerProps as DeckLayerProps } from "@deck.gl/core";
import type { FeatureCollection } from "geojson";
import type { ErrorEvent as MapLibreErrorEvent } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// MapLibre spawns its Web Worker via `new Worker(WORKER_URL)`. The default
// worker URL resolves to the page route (/chat/{id}) in Turbopack builds, so
// the spawn fails with a text/html MIME error and no basemap tiles render.
// Synced to public/ by scripts/sync-maplibre-worker.mjs (predev/prebuild) and
// loaded from a stable origin-relative path. The worker file's inner import
// `./maplibre-gl-shared.mjs` resolves to `/maplibre-gl-shared.mjs`.
const maplibreWorkerUrl = "/maplibre-gl-worker.mjs";

export type MapStatus = "loading" | "ready" | "error";

export interface MapControls {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  resize: () => void;
}

interface CampusMapProps {
  highlight: MapHighlight | null;
  /** Bumps re-focus the camera on the current highlight. */
  focusNonce: number;
  showRoutes: boolean;
  selectedBuilding?: BuildingSummary | null;
  onBuildingSelect?: (building: BuildingSummary | null) => void;
  showBuildingPopup?: boolean;
  onStatus?: (status: MapStatus) => void;
  /** Filled with imperative camera controls once the map is up. */
  controls?: React.RefObject<MapControls | null>;
}

interface PickedBuilding {
  name: string;
  code: string;
  x: number;
  y: number;
}

const TOOLTIP_OFFSET = 12;

/** Position the building tooltip, flipping anchor when it would overflow the container. */
function tooltipPosition(picked: PickedBuilding, container: HTMLDivElement | null): React.CSSProperties {
  const w = container?.clientWidth ?? 800;
  const h = container?.clientHeight ?? 600;

  const fitsRight = picked.x + TOOLTIP_OFFSET + 240 < w;
  const fitsBelow = picked.y + TOOLTIP_OFFSET + 56 < h;

  return {
    // Fits right: tooltip starts offset to the right of cursor
    // Doesn't fit: tooltip ends offset to the left of cursor (right edge near cursor)
    left: fitsRight ? picked.x + TOOLTIP_OFFSET : undefined,
    right: fitsRight ? undefined : w - picked.x + TOOLTIP_OFFSET,
    top: fitsBelow ? picked.y + TOOLTIP_OFFSET : undefined,
    bottom: fitsBelow ? undefined : h - picked.y + TOOLTIP_OFFSET,
  };
}

const UBC_CENTER: LngLat = [-123.246, 49.2626];
const INITIAL_VIEW = { center: UBC_CENTER, zoom: 14.4, pitch: 40, bearing: -8 };

const PAN_BUFFER_DEG = 0.0045; // ~0.5km buffer from hull edge

/** Signed distance from point to hull. Negative = inside, positive = outside. */
function distToHull(lng: number, lat: number): number {
  const hull = campusHull as [number, number][];
  // Point-in-polygon (ray casting)
  let inside = false;
  for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) {
    const [xi, yi] = hull[i],
      [xj, yj] = hull[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  // Distance to nearest edge segment
  let minDist = Infinity;
  for (let i = 0, j = hull.length - 1; i < hull.length; j = i++) {
    const [ax, ay] = hull[j],
      [bx, by] = hull[i];
    const dx = bx - ax,
      dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((lng - ax) * dx + (lat - ay) * dy) / len2)) : 0;
    const px = ax + t * dx,
      py = ay + t * dy;
    const d = Math.sqrt((lng - px) ** 2 + (lat - py) ** 2);
    if (d < minDist) minDist = d;
  }
  return inside ? -minDist : minDist;
}

/** How far past the allowed boundary (hull + buffer). 0 = inside, positive = overshoot. */
function overshootFromBoundary(lng: number, lat: number): number {
  return Math.max(0, distToHull(lng, lat) - PAN_BUFFER_DEG);
}

const STYLE_URLS: Record<ResolvedTheme, string> = {
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
};

type Rgba = [number, number, number, number];

// ---- Map color system ----
// Derived from DESIGN.md tokens. Buildings use the neumorphic raised-surface
// material; highlights and routes use the primary palette; route casing keeps
// the trace legible; the basemap blends with --background.

const MAP_COLORS: Record<
  ResolvedTheme,
  Record<
    | "fill"
    | "line"
    | "fillHighlight"
    | "lineHighlight"
    | "route"
    | "routeCasing"
    | "label"
    | "labelBg"
    | "walkway"
    | "entrance"
    | "door",
    Rgba
  >
> = {
  light: {
    // Buildings
    fill: [190, 190, 197, 255],
    line: [195, 196, 202, 255],
    // Highlighted: primary muted indigo #4a4e7a
    fillHighlight: [74, 78, 122, 255],
    lineHighlight: [26, 29, 58, 255],
    // Route: primary #4a4e7a with a light casing.
    route: [74, 78, 122, 235],
    routeCasing: [250, 250, 250, 190],
    // Labels: on-surface-variant for legibility without heaviness
    label: [62, 67, 72, 255],
    labelBg: [250, 250, 250, 255],
    // Walkways: primary accent at 25%
    walkway: [74, 78, 122, 64],
    entrance: [74, 78, 122, 190],
    door: [250, 250, 250, 255],
  },
  dark: {
    // Buildings
    fill: [9, 9, 11, 255],
    line: [64, 65, 72, 255],
    // Highlighted: dark-mode primary #b0b4d8
    fillHighlight: [176, 180, 216, 255],
    lineHighlight: [208, 210, 235, 255],
    // Route: dark-mode primary #b0b4d8 with a dark casing.
    route: [176, 180, 216, 220],
    routeCasing: [18, 18, 20, 190],
    // Labels: on-surface-variant (dark) for clarity
    label: [194, 199, 204, 255],
    labelBg: [14, 14, 16, 255],
    // Walkways: primary accent at 25%
    walkway: [176, 180, 216, 64],
    entrance: [176, 180, 216, 210],
    door: [18, 18, 20, 255],
  },
};

const BUILDING_LAYER_PARAMETERS = {
  depthCompare: "less-equal",
  depthWriteEnabled: true,
} as const satisfies NonNullable<DeckLayerProps["parameters"]>;
const OVERLAY_LAYER_PARAMETERS = {
  depthCompare: "always",
  depthWriteEnabled: false,
} as const satisfies NonNullable<DeckLayerProps["parameters"]>;
const ROUTE_VISIBLE_PARAMETERS = {
  depthCompare: "less-equal",
  depthWriteEnabled: false,
} as const satisfies NonNullable<DeckLayerProps["parameters"]>;
const ROUTE_OCCLUDED_PARAMETERS = {
  depthCompare: "greater",
  depthWriteEnabled: false,
} as const satisfies NonNullable<DeckLayerProps["parameters"]>;
const SURFACE_OVERLAY_PARAMETERS = {
  depthCompare: "less-equal",
  depthWriteEnabled: false,
} as const satisfies NonNullable<DeckLayerProps["parameters"]>;
const ROUTE_ALTITUDE_METERS = 0.2;
const NO_POLYGON_OFFSET = () => [0, 0] as [number, number];
const SURFACE_DEPTH_BIAS = () => [-1, -1] as [number, number];

function withAlpha([red, green, blue]: Rgba, alpha: number): Rgba {
  return [red, green, blue, alpha];
}

/** Returns opaque building colors and depth-writing state for solid occlusion. */
export function buildingLayerAppearance(theme: ResolvedTheme) {
  return {
    fillColor: MAP_COLORS[theme].fill,
    highlightColor: MAP_COLORS[theme].fillHighlight,
    parameters: BUILDING_LAYER_PARAMETERS,
  };
}

/** Returns non-writing wall depth state with rasterization bias for door outlines. */
export function doorLayerAppearance() {
  return {
    parameters: SURFACE_OVERLAY_PARAMETERS,
    getPolygonOffset: SURFACE_DEPTH_BIAS,
  };
}

/** Returns non-writing ground depth state with rasterization bias for entrance arrows. */
export function groundEntranceLayerAppearance() {
  return {
    filled: true,
    stroked: false,
    parameters: SURFACE_OVERLAY_PARAMETERS,
    getPolygonOffset: SURFACE_DEPTH_BIAS,
  };
}

/** Returns ordered visible and occluded route stroke descriptors. */
export function routeLayerAppearance(theme: ResolvedTheme) {
  return {
    getPolygonOffset: NO_POLYGON_OFFSET,
    strokes: [
      {
        id: "route-occluded",
        width: 9,
        color: withAlpha(MAP_COLORS[theme].route, 77),
        parameters: ROUTE_OCCLUDED_PARAMETERS,
      },
      {
        id: "route-casing",
        width: 9,
        color: withAlpha(MAP_COLORS[theme].routeCasing, 255),
        parameters: ROUTE_VISIBLE_PARAMETERS,
      },
      {
        id: "route-trace",
        width: 5,
        color: withAlpha(MAP_COLORS[theme].route, 255),
        parameters: ROUTE_VISIBLE_PARAMETERS,
      },
    ] as const,
  };
}

/** Lifts route vertices above flat ground while keeping them below building geometry. */
export function routeRenderPath(path: LngLat[]): Array<[number, number, number]> {
  return path.map(([longitude, latitude]) => [longitude, latitude, ROUTE_ALTITUDE_METERS]);
}

// Basemap layer overrides: makes CARTO tiles seamless with the app shell.
// Positron (light) gets matched to --background; Dark Matter loses its black.
const BASEMAP_OVERRIDES: Record<
  ResolvedTheme,
  { background: string; landcover: string; water: string; road: string; roadMinor: string }
> = {
  light: {
    background: "#f7f7f5", // --background
    landcover: "#eff2ee", // hint of life, barely-there warm green
    water: "#e2e6ee", // cool blue-gray from the indigo family
    road: "#eae9e6", // --border adjacent — hairline dividers
    roadMinor: "#f0efed", // even subtler for small paths
  },
  dark: {
    background: "#141416", // between --background #121214 and --surface-container-lowest
    landcover: "#171819", // barely differentiated, no tint
    water: "#111113", // dark, not black — subtle depth
    road: "#1e1f22", // --border-subtle adjacent
    roadMinor: "#191a1d", // ghostly
  },
};

function patchBasemapColors(map: import("maplibre-gl").Map, resolvedTheme: ResolvedTheme) {
  const ov = BASEMAP_OVERRIDES[resolvedTheme];
  try {
    const style = map.getStyle();
    if (!style?.layers) return;
    for (const layer of style.layers) {
      const id = layer.id;
      if (id === "background" && layer.type === "background") {
        map.setPaintProperty(id, "background-color", ov.background);
      } else if (layer.type === "fill") {
        if (id.includes("water")) {
          map.setPaintProperty(id, "fill-color", ov.water);
        } else if (id.includes("landcover") || id.includes("landuse") || id.includes("park")) {
          map.setPaintProperty(id, "fill-color", ov.landcover);
        } else if (id.includes("building")) {
          // Hide basemap flat buildings — deck.gl renders them in 3D
          map.setPaintProperty(id, "fill-opacity", 0);
        }
      } else if (layer.type === "line") {
        if (id.includes("road") || id.includes("highway") || id.includes("street")) {
          if (id.includes("path") || id.includes("pedestrian")) continue;
          const isMinor = id.includes("minor") || id.includes("service");
          map.setPaintProperty(id, "line-color", isMinor ? ov.roadMinor : ov.road);
        }
      }
    }
  } catch {
    // Non-critical — deck.gl layers render regardless of basemap tinting
  }
}

/** Real height where the dataset has one; ~3.5 m per floor otherwise; low default. */
function buildingHeight(feature: BuildingFeature): number {
  const p = feature.properties ?? {};
  return Number(p.BLDG_HEIGHT) || (Number(p.MAX_FLOORS) || 0) * 3.5 || 8;
}

interface MapHandles {
  map: import("maplibre-gl").Map;
  overlay: import("@deck.gl/mapbox").MapboxOverlay;
  layerModules: {
    GeoJsonLayer: typeof import("@deck.gl/layers").GeoJsonLayer;
    PathLayer: typeof import("@deck.gl/layers").PathLayer;
    PolygonLayer: typeof import("@deck.gl/layers").PolygonLayer;
    ScatterplotLayer: typeof import("@deck.gl/layers").ScatterplotLayer;
    TextLayer: typeof import("@deck.gl/layers").TextLayer;
  };
  gradientExtension: import("@deck.gl/core").LayerExtension;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Resolve the highlighted route pair to features + centroids; null when unmatchable. */
function resolveRoute(buildings: FeatureCollection | null, highlight: MapHighlight | null) {
  if (!buildings || highlight?.kind !== "route") return null;
  const from = findBuilding(buildings, highlight.from);
  const to = findBuilding(buildings, highlight.to);
  if (!from || !to) return null;
  const fromCenter = featureCentroid(from);
  const toCenter = featureCentroid(to);
  if (!fromCenter || !toCenter) return null;
  return { from, to, fromCenter, toCenter };
}

export function CampusMap({
  highlight,
  focusNonce,
  showRoutes,
  selectedBuilding: controlledSelected,
  onBuildingSelect,
  showBuildingPopup = true,
  onStatus,
  controls,
}: CampusMapProps) {
  const api = useApi();
  const { theme } = useTheme();

  const containerRef = useRef<HTMLDivElement>(null);
  const handlesRef = useRef<MapHandles | null>(null);
  const appliedStyleRef = useRef<ResolvedTheme | null>(null);
  const didPanRef = useRef(false);
  const [status, setStatus] = useState<MapStatus>("loading");
  const [buildings, setBuildings] = useState<FeatureCollection | null>(null);
  const [entrances, setEntrances] = useState<EntranceFeatureCollection | null>(null);
  const [entranceStatus, setEntranceStatus] = useState<"loading" | "ready" | "error">("loading");
  const [entranceNonce, setEntranceNonce] = useState(0);
  const [walkingRoutes, setWalkingRoutes] = useState<FeatureCollection | null>(null);
  const [zoom, setZoom] = useState(INITIAL_VIEW.zoom);
  const [picked, setPicked] = useState<PickedBuilding | null>(null);
  /** Building whose details popup is open when selection is not controlled by Tools. */
  const [internalSelected, setInternalSelected] = useState<SelectedBuilding | null>(null);
  const selected = controlledSelected === undefined ? internalSelected : controlledSelected;
  const selectBuilding = useCallback(
    (building: BuildingSummary | null) => {
      if (onBuildingSelect) onBuildingSelect(building);
      else setInternalSelected(building);
    },
    [onBuildingSelect],
  );

  // Restore the last-selected building (its popup carries the rooms/POIs the
  // user was reading) after mount — effect, not initializer, so SSR markup
  // matches the first client render. Saves skip the mount commit so the
  // pre-restore `null` never wipes the cached value.
  useEffect(() => {
    if (controlledSelected !== undefined) return;
    const cached = getCachedPaneState("map")?.selected as SelectedBuilding | null | undefined;
    if (
      cached &&
      typeof cached === "object" &&
      typeof cached.code === "string" &&
      Array.isArray(cached.centroid) &&
      cached.centroid.every(Number.isFinite)
    ) {
      setInternalSelected(cached);
    }
  }, [controlledSelected]);
  const skipSelectedSave = useRef(true);
  useEffect(() => {
    if (controlledSelected !== undefined) return;
    if (skipSelectedSave.current) {
      skipSelectedSave.current = false;
      return;
    }
    cachePaneState("map", { selected });
  }, [controlledSelected, selected]);
  /** Pedestrian-network polyline for the current route highlight. */
  const [routePath, setRoutePath] = useState<{ key: string; path: LngLat[] } | null>(null);
  const renderedRoutePath = useMemo(() => (routePath ? routeRenderPath(routePath.path) : null), [routePath]);
  /** First basemap label layer — deck layers insert before it so labels stay on top. */
  const [labelLayerId, setLabelLayerId] = useState<string | null>(null);

  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  useEffect(() => {
    onStatusRef.current?.(status);
  }, [status]);

  // ---- Init: map + overlay (once) ----
  useEffect(() => {
    let disposed = false;
    const container = containerRef.current;
    if (!container) return;

    (async () => {
      try {
        const [maplibre, { MapboxOverlay }, layers, core] = await Promise.all([
          import("maplibre-gl"),
          import("@deck.gl/mapbox"),
          import("@deck.gl/layers"),
          import("@deck.gl/core"),
          import("maplibre-gl/dist/maplibre-gl.css"),
        ]);
        if (disposed) return;

        const initialTheme: ResolvedTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
        appliedStyleRef.current = initialTheme;
        maplibre.setWorkerUrl(maplibreWorkerUrl);
        // Reopen at the camera the user left; falls back to the campus default.
        // A highlight fit (route/buildings) still overrides after load.
        const cachedCamera = getCachedPaneState("map")?.camera as
          { center: [number, number]; zoom: number; pitch: number; bearing: number } | undefined;
        const map = new maplibre.Map({
          container,
          style: STYLE_URLS[initialTheme],
          center: cachedCamera?.center ?? INITIAL_VIEW.center,
          zoom: cachedCamera?.zoom ?? INITIAL_VIEW.zoom,
          pitch: cachedCamera?.pitch ?? INITIAL_VIEW.pitch,
          bearing: cachedCamera?.bearing ?? INITIAL_VIEW.bearing,
          minZoom: 13,
          maxZoom: 18,
          attributionControl: false,
        });
        // Bottom-left keeps the required attribution clear of the zoom stack.
        map.addControl(new maplibre.AttributionControl({ compact: true }), "bottom-left");

        // maplibre v6 removed the public `transform`, but deck.gl's interleaved
        // overlay still reads it (height/nearZ/farZ) on every frame. Expose the
        // internal transform under the old name; drop when deck supports v6.
        Object.defineProperty(map, "transform", {
          get: () => (map as unknown as { painter: { transform: unknown } }).painter.transform,
          configurable: true,
        });

        // Elastic circular boundary: custom drag with rubber-band physics.
        // MapLibre's dragPan is disabled to avoid setCenter fights.
        // All animation uses jumpTo + rAF to avoid MapLibre's internal ease system.
        map.dragPan.disable();

        const canvasEl = map.getCanvasContainer();
        const mapCanvas = map.getCanvas();
        let dragging = false;
        let lastPt = { x: 0, y: 0 };
        let vel = { x: 0, y: 0 };
        let lastT = 0;
        let animating = false;

        function snapBack() {
          const c = map.getCenter();
          const overshoot = overshootFromBoundary(c.lng, c.lat);
          if (overshoot <= 0) {
            animating = false;
            return;
          }
          // Find nearest point on the boundary (hull + buffer) by moving toward hull center
          const hullCenterLng = (campusHull as [number, number][]).reduce((s, p) => s + p[0], 0) / campusHull.length;
          const hullCenterLat = (campusHull as [number, number][]).reduce((s, p) => s + p[1], 0) / campusHull.length;
          const dx = c.lng - hullCenterLng;
          const dy = c.lat - hullCenterLat;
          const dist = Math.sqrt(dx * dx + dy * dy);
          // Target: pull back toward hull center by overshoot amount
          const pullRatio = Math.max(0, 1 - overshoot / dist);
          const targetLng = hullCenterLng + dx * pullRatio;
          const targetLat = hullCenterLat + dy * pullRatio;

          animating = true;
          const startLng = c.lng,
            startLat = c.lat;
          const startTime = performance.now();
          const duration = 250;
          (function animate() {
            if (dragging) {
              animating = false;
              return;
            }
            const t = Math.min((performance.now() - startTime) / duration, 1);
            const ease = 1 - (1 - t) ** 3;
            const lng = startLng + (targetLng - startLng) * ease;
            const lat = startLat + (targetLat - startLat) * ease;
            map.jumpTo({ center: [lng, lat] });
            if (t < 1) requestAnimationFrame(animate);
            else animating = false;
          })();
        }

        canvasEl.addEventListener("pointerdown", (e) => {
          if (e.button !== 0 || e.ctrlKey || e.metaKey) return;
          dragging = true;
          didPanRef.current = false;
          animating = false;
          lastPt = { x: e.clientX, y: e.clientY };
          lastT = performance.now();
          vel = { x: 0, y: 0 };
          // Capture on the canvas (not the container) so pointerup stays
          // targeted at the canvas — deck.gl's interleaved event manager
          // listens there and needs the full gesture to register clicks.
          mapCanvas.setPointerCapture(e.pointerId);
        });

        canvasEl.addEventListener("pointermove", (e) => {
          if (!dragging) return;
          didPanRef.current = true;
          const now = performance.now();
          const dt = now - lastT;
          let dx = e.clientX - lastPt.x;
          let dy = e.clientY - lastPt.y;
          if (dt > 0) vel = { x: dx / dt, y: dy / dt };
          lastPt = { x: e.clientX, y: e.clientY };
          lastT = now;

          // Dampen pixel movement when past the hull boundary
          const c = map.getCenter();
          const overshoot = overshootFromBoundary(c.lng, c.lat);
          if (overshoot > 0) {
            const dampen = 1 / (1 + (overshoot / PAN_BUFFER_DEG) * 4);
            dx *= dampen;
            dy *= dampen;
          }

          const cur = map.project(c);
          const target = map.unproject([cur.x - dx, cur.y - dy]);
          map.jumpTo({ center: [target.lng, target.lat] });
        });

        function endDrag(e: PointerEvent) {
          if (!dragging) return;
          dragging = false;
          mapCanvas.releasePointerCapture(e.pointerId);

          const c = map.getCenter();
          if (overshootFromBoundary(c.lng, c.lat) > 0) {
            snapBack();
            return;
          }

          // Inside boundary: apply inertia coast
          const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
          if (speed > 0.05) {
            animating = true;
            let vx = vel.x,
              vy = vel.y;
            const decay = 0.93;
            (function coast() {
              if (dragging) {
                animating = false;
                return;
              }
              vx *= decay;
              vy *= decay;
              if (Math.abs(vx) < 0.002 && Math.abs(vy) < 0.002) {
                snapBack();
                return;
              }
              const cur = map.project(map.getCenter());
              const target = map.unproject([cur.x - vx * 16, cur.y - vy * 16]);
              if (overshootFromBoundary(target.lng, target.lat) > 0) {
                snapBack();
                return;
              }
              map.jumpTo({ center: [target.lng, target.lat] });
              requestAnimationFrame(coast);
            })();
          }
        }

        canvasEl.addEventListener("pointerup", endDrag);
        canvasEl.addEventListener("pointercancel", endDrag);

        // Constrain zoom/keyboard-induced pan.
        map.on("moveend", () => {
          if (!dragging && !animating) snapBack();
        });
        map.on("zoomend", () => setZoom(map.getZoom()));

        // Persist the camera so the map reopens where the user left it.
        // Debounced: the rubber-band drag emits moveend per jumpTo frame.
        let cameraSaveTimer: ReturnType<typeof setTimeout> | null = null;
        map.on("moveend", () => {
          if (cameraSaveTimer) clearTimeout(cameraSaveTimer);
          cameraSaveTimer = setTimeout(() => {
            if (disposed) return; // map may already be removed
            const c = map.getCenter();
            cachePaneState("map", {
              camera: { center: [c.lng, c.lat], zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() },
            });
          }, 400);
        });

        const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
        map.addControl(overlay);

        if (process.env.NODE_ENV === "development") {
          (window as unknown as { __campusMap?: unknown }).__campusMap = map;
        }

        map.on("error", (event: MapLibreErrorEvent) => {
          // Style/tile failures (e.g. offline) → text fallback; transient tile
          // errors after load are ignored.
          if (!map.isStyleLoaded()) {
            setStatus("error");
          }
          console.warn("Map error", event.error?.message);
        });
        // Mark ready as soon as the style object loads, before all tiles
        // resolve. The `load` event fires only when every source/tile has
        // loaded, which in some envs never happens (e.g. slow tile workers),
        // leaving the parent's 15s fallback to flip the map to error even
        // though the canvas paints fine. style.load is the earliest signal
        // that the map is operational.
        map.on("style.load", () => {
          // Bottom-most symbol layer in the stack; deck layers insert before it.
          const firstLabel = map.getStyle().layers?.find((l) => l.type === "symbol");
          setLabelLayerId(firstLabel?.id ?? null);
          setStatus("ready");
        });
        map.on("load", () => {
          if (!disposed) {
            setStatus("ready");
            // Defer basemap tinting to next frame so deck.gl overlay initializes first
            requestAnimationFrame(() => patchBasemapColors(map, initialTheme));
          }
        });

        // WebGL context loss: report error so the parent can offer retry
        const canvas = map.getCanvas();
        canvas.addEventListener("webglcontextlost", () => {
          if (!disposed) setStatus("error");
        });

        // Shader extension: bottom-to-top gradient on building sides
        class GradientExtension extends core.LayerExtension {
          getShaders() {
            return {
              inject: {
                "vs:#decl": "out float vHeightFrac;",
                "vs:#main-end": "vHeightFrac = clamp(geometry.position.z / 35.0, 0.0, 1.0);",
                "fs:#decl": "in float vHeightFrac;",
                "fs:DECKGL_FILTER_COLOR": `
                  color.rgb *= mix(0.7, 1.0, vHeightFrac);
                `,
              },
            };
          }
        }

        handlesRef.current = {
          map,
          overlay,
          layerModules: {
            GeoJsonLayer: layers.GeoJsonLayer,
            PathLayer: layers.PathLayer,
            PolygonLayer: layers.PolygonLayer,
            ScatterplotLayer: layers.ScatterplotLayer,
            TextLayer: layers.TextLayer,
          },
          gradientExtension: new GradientExtension(),
        };

        if (controls) {
          const duration = () => (prefersReducedMotion() ? 0 : 300);
          controls.current = {
            zoomIn: () => map.zoomIn({ duration: duration() }),
            zoomOut: () => map.zoomOut({ duration: duration() }),
            resetView: () =>
              map.flyTo({ ...INITIAL_VIEW, duration: prefersReducedMotion() ? 0 : 700, essential: true }),
            resize: () => map.resize(),
          };
        }
      } catch (error) {
        console.warn("Map init failed", error);
        if (!disposed) setStatus("error");
      }
    })();

    return () => {
      disposed = true;
      if (controls?.current) controls.current = null;
      const handles = handlesRef.current;
      handlesRef.current = null;
      if (handles) {
        handles.map.removeControl(handles.overlay);
        handles.map.remove();
      }
    };
    // `controls` is a stable ref from the parent; init runs exactly once per mount.
  }, [controls]);

  // ---- Data: buildings (required), walking routes (on demand) ----
  useEffect(() => {
    let cancelled = false;
    api
      .getGeo("buildings")
      .then((collection) => {
        if (!cancelled) setBuildings(collection);
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  useEffect(() => {
    void entranceNonce;
    let cancelled = false;
    setEntranceStatus("loading");
    api
      .getGeo("entrances")
      .then((collection) => {
        if (cancelled) return;
        setEntrances(collection as EntranceFeatureCollection);
        setEntranceStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setEntrances(null);
        setEntranceStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [api, entranceNonce]);

  useEffect(() => {
    if (!showRoutes || walkingRoutes) return;
    let cancelled = false;
    api
      .getGeo("walking-routes")
      .then((collection) => {
        if (!cancelled) setWalkingRoutes(collection);
      })
      .catch(() => {
        // Optional layer — buildings and routes still work without it.
      });
    return () => {
      cancelled = true;
    };
  }, [api, showRoutes, walkingRoutes]);

  // Fetch route geometry only when the server confirms a connected pedestrian path.
  useEffect(() => {
    setRoutePath(null);
    if (highlight?.kind !== "route") return;
    const key = `${highlight.from}|${highlight.to}`;
    if (highlight.method === "estimate") return;
    if (highlight.method === "network" && highlight.path) {
      const path = drawableRoutePath({
        from: highlight.from,
        to: highlight.to,
        meters: highlight.meters,
        minutes: highlight.minutes,
        method: "network",
        polyline: highlight.path,
      });
      if (path) setRoutePath({ key, path });
      return;
    }
    const controller = new AbortController();
    api
      .getRoute(highlight.from, highlight.to, controller.signal)
      .then((route) => {
        const path = drawableRoutePath(route);
        if (path) setRoutePath({ key, path });
      })
      .catch(() => {});
    return () => controller.abort();
  }, [api, highlight]);

  const entranceMarkers = useMemo(
    () => (buildings && entrances ? buildEntranceMarkers(buildings, entrances) : []),
    [buildings, entrances],
  );

  // ---- Layers ----
  useEffect(() => {
    // `status` gates the pass so layers apply once the map reports ready.
    const handles = handlesRef.current;
    if (!handles || !buildings || status === "error") return;
    const { GeoJsonLayer, PathLayer, PolygonLayer, ScatterplotLayer, TextLayer } = handles.layerModules;
    const colors = MAP_COLORS[theme];
    const buildingAppearance = buildingLayerAppearance(theme);
    const doorAppearance = doorLayerAppearance();
    const groundEntranceAppearance = groundEntranceLayerAppearance();
    const routeAppearance = routeLayerAppearance(theme);
    const route = resolveRoute(buildings, highlight);
    const focusedBuildings = highlight?.kind === "buildings" ? highlight.buildings : [];
    const highlightedCodes = new Set(
      [route?.from, route?.to].map((f) => (f?.properties?.BLDG_CODE ?? "").toString().toUpperCase()).filter(Boolean),
    );
    for (const b of focusedBuildings) highlightedCodes.add(b.code.toUpperCase());
    if (selected) highlightedCodes.add(selected.code.toUpperCase());
    // Anchor building of a places search gets the highlight tint too.
    if (highlight?.kind === "places" && highlight.near) highlightedCodes.add(highlight.near.toUpperCase());
    const entranceFocusCodes = new Set<string>();
    if (selected) entranceFocusCodes.add(selected.code.toUpperCase());
    if (highlight?.kind === "buildings" && highlight.showEntrances) {
      for (const building of highlight.buildings) entranceFocusCodes.add(building.code.toUpperCase());
    }
    const visibleEntrances = visibleEntranceMarkers(entranceMarkers, zoom, entranceFocusCodes);
    const pins = highlight?.kind === "places" ? highlight.places : [];

    const isHighlighted = (feature: BuildingFeature) =>
      highlightedCodes.has((feature.properties?.BLDG_CODE ?? "").toString().toUpperCase());

    const endpoints =
      route && routePath
        ? [
            { center: route.fromCenter, feature: route.from, text: highlight?.kind === "route" ? highlight.from : "" },
            { center: route.toCenter, feature: route.to, text: highlight?.kind === "route" ? highlight.to : "" },
          ]
        : [];

    /**
     * deck reads `beforeId` at runtime (interleaved insertion point) but does
     * not type it. Layers with a beforeId slot in below the basemap's label
     * layers; the building tag skips it so it draws above every basemap layer,
     * labels included.
     */
    const withBeforeId = <P extends object>(props: P): P & { beforeId?: string } => ({
      ...props,
      beforeId: (props as { id?: string }).id === "building-labels" ? undefined : (labelLayerId ?? undefined),
    });

    const layers = [
      showRoutes && walkingRoutes
        ? new GeoJsonLayer(
            withBeforeId({
              id: "walking-routes",
              data: walkingRoutes,
              stroked: true,
              filled: false,
              getLineColor: colors.walkway,
              getLineWidth: 2,
              lineWidthUnits: "pixels" as const,
              lineCapRounded: true,
              lineJointRounded: true,
            }),
          )
        : null,
      visibleEntrances.length > 0
        ? new PolygonLayer(
            withBeforeId({
              id: "entrance-arrows",
              data: visibleEntrances,
              getPolygon: (marker) => marker.groundArrow,
              getFillColor: colors.entrance,
              filled: groundEntranceAppearance.filled,
              stroked: groundEntranceAppearance.stroked,
              parameters: groundEntranceAppearance.parameters,
              getPolygonOffset: groundEntranceAppearance.getPolygonOffset,
              pickable: false,
            }),
          )
        : null,
      new GeoJsonLayer(
        withBeforeId({
          id: "buildings",
          data: buildings,
          extruded: true,
          wireframe: false,
          extensions: [handles.gradientExtension],
          getElevation: (feature) => buildingHeight(feature as BuildingFeature),
          getFillColor: (feature) =>
            isHighlighted(feature as BuildingFeature)
              ? buildingAppearance.highlightColor
              : buildingAppearance.fillColor,
          getLineColor: (feature) => (isHighlighted(feature as BuildingFeature) ? colors.lineHighlight : colors.line),
          material: { ambient: 1, diffuse: 0.6, shininess: 1 },
          parameters: buildingAppearance.parameters,
          stroked: true,
          getLineWidth: 1,
          lineWidthUnits: "pixels" as const,
          pickable: true,
          autoHighlight: true,
          highlightColor: [124, 158, 178, 120],
          transitions: { getFillColor: 300 },
          // Hover shows identity without committing a map selection.
          onHover: (info) => {
            const properties = (info.object as BuildingFeature | undefined)?.properties;
            if (properties?.NAME || properties?.BLDG_CODE) {
              setPicked({
                name: String(properties.NAME ?? ""),
                code: String(properties.BLDG_CODE ?? ""),
                x: info.x,
                y: info.y,
              });
            } else {
              setPicked(null);
            }
          },
          // Click/tap selects a building unless the gesture panned the map.
          onClick: (info) => {
            if (didPanRef.current) return;
            const feature = info.object as BuildingFeature | undefined;
            const building = feature ? buildingFromFeature(feature) : null;
            setPicked(null);
            selectBuilding(building);
          },
          updateTriggers: {
            getFillColor: [theme, ...highlightedCodes],
            getLineColor: [theme, ...highlightedCodes],
          },
        }),
      ),
      // Draw one x-ray stroke behind buildings, then the visible casing and trace.
      ...(renderedRoutePath && routePath
        ? routeAppearance.strokes.map(
            (stroke) =>
              new PathLayer(
                withBeforeId({
                  id: stroke.id,
                  data: [{ path: renderedRoutePath }],
                  getPath: (d: { path: Array<[number, number, number]> }) => d.path,
                  getColor: stroke.color,
                  getWidth: stroke.width,
                  widthUnits: "pixels" as const,
                  capRounded: true,
                  jointRounded: true,
                  parameters: stroke.parameters,
                  getPolygonOffset: routeAppearance.getPolygonOffset,
                  pickable: false,
                  updateTriggers: { getPath: [routePath.key] },
                }),
              ),
          )
        : []),
      visibleEntrances.length > 0
        ? new PathLayer(
            withBeforeId({
              id: "entrance-doors",
              data: visibleEntrances,
              getPath: (marker) => marker.doorOutline,
              getColor: colors.door,
              getWidth: 3,
              widthUnits: "pixels" as const,
              billboard: true,
              capRounded: false,
              jointRounded: false,
              parameters: doorAppearance.parameters,
              getPolygonOffset: doorAppearance.getPolygonOffset,
              pickable: false,
            }),
          )
        : null,
      endpoints.length > 0
        ? new ScatterplotLayer(
            withBeforeId({
              id: "route-endpoints",
              // Dots mark where the walk starts/ends — the entrances the polyline
              // connects, not the building centroids.
              data: (routePath
                ? [routePath.path[0], routePath.path[routePath.path.length - 1]].map((p) => ({ position: [...p, 2] }))
                : endpoints.map((e) => ({ position: [...e.center, buildingHeight(e.feature) + 4] }))) as {
                position: [number, number, number];
              }[],
              getPosition: (d: { position: [number, number, number] }) => d.position,
              getRadius: 5,
              radiusUnits: "pixels" as const,
              getFillColor: colors.route,
              stroked: true,
              getLineColor: colors.routeCasing,
              getLineWidth: 3,
              lineWidthUnits: "pixels" as const,
            }),
          )
        : null,
      endpoints.length > 0
        ? new TextLayer(
            withBeforeId({
              id: "route-labels",
              data: endpoints.map((e) => ({ position: [...e.center, buildingHeight(e.feature) + 10], text: e.text })),
              getPosition: (d: { position: [number, number, number] }) => d.position,
              getText: (d: { text: string }) => d.text,
              getSize: 13,
              getColor: colors.label,
              background: true,
              getBackgroundColor: colors.labelBg,
              backgroundPadding: [6, 3],
              fontFamily: "Aspekta, ui-sans-serif, sans-serif",
              fontWeight: 600,
              getPixelOffset: [0, -14],
            }),
          )
        : null,
      pins.length > 0
        ? new ScatterplotLayer(
            withBeforeId({
              id: "place-pins",
              data: pins.map((p) => ({ position: [p.lon, p.lat, 2] as [number, number, number] })),
              getPosition: (d: { position: [number, number, number] }) => d.position,
              getRadius: 6,
              radiusUnits: "pixels" as const,
              getFillColor: colors.route,
              stroked: true,
              getLineColor: colors.routeCasing,
              getLineWidth: 2,
              lineWidthUnits: "pixels" as const,
            }),
          )
        : null,
      pins.length > 0
        ? new TextLayer(
            withBeforeId({
              id: "place-labels",
              data: pins.map((p) => ({ position: [p.lon, p.lat, 2] as [number, number, number], text: p.name })),
              getPosition: (d: { position: [number, number, number] }) => d.position,
              getText: (d: { text: string }) => d.text,
              getSize: 12,
              getColor: colors.label,
              background: true,
              getBackgroundColor: colors.labelBg,
              backgroundPadding: [5, 2],
              fontFamily: "Aspekta, ui-sans-serif, sans-serif",
              fontWeight: 600,
              getPixelOffset: [0, -16],
            }),
          )
        : null,
      focusedBuildings.length > 0
        ? new TextLayer(
            withBeforeId({
              id: "building-labels",
              data: focusedBuildings.map((b) => {
                const feature = findBuilding(buildings, b.code);
                const center = (feature && featureCentroid(feature)) ?? [b.lon, b.lat];
                return {
                  position: [...center, feature ? buildingHeight(feature) + 10 : 10] as [number, number, number],
                  text: b.name,
                };
              }),
              getPosition: (d: { position: [number, number, number] }) => d.position,
              getText: (d: { text: string }) => d.text,
              getSize: 13,
              getColor: colors.label,
              background: true,
              getBackgroundColor: colors.labelBg,
              backgroundPadding: [6, 3],
              fontFamily: "Aspekta, ui-sans-serif, sans-serif",
              fontWeight: 600,
              getPixelOffset: [0, -14],
              // The focused tag stays above the earlier building group at pitch.
              parameters: OVERLAY_LAYER_PARAMETERS,
            }),
          )
        : null,
    ].filter(Boolean);

    try {
      handles.overlay.setProps({ layers });
    } catch (e) {
      console.warn("deck.gl layer error:", e);
      setStatus("error");
    }
  }, [
    buildings,
    walkingRoutes,
    showRoutes,
    highlight,
    theme,
    status,
    routePath,
    renderedRoutePath,
    selected,
    labelLayerId,
    entranceMarkers,
    zoom,
    selectBuilding,
  ]);

  // ---- Theme: swap basemap style ----
  useEffect(() => {
    const handles = handlesRef.current;
    if (!handles || status !== "ready") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    if (appliedStyleRef.current !== theme) {
      appliedStyleRef.current = theme;
      const el = containerRef.current;
      const vtActive = document.documentElement.classList.contains("vt-active");
      const fade = !vtActive && !prefersReducedMotion() && el;
      if (fade) {
        el.style.transition = "opacity 200ms ease-out";
        el.style.opacity = "0";
      }
      const apply = () => {
        handles.map.setStyle(STYLE_URLS[theme]);
        handles.map.once("style.load", () => {
          requestAnimationFrame(() => patchBasemapColors(handles.map, theme));
          if (fade) {
            el.style.opacity = "1";
          }
        });
      };
      if (fade) timer = setTimeout(apply, 200);
      else apply();
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [theme, status]);

  // ---- Camera: focus the highlight when its selection or nonce changes ----
  useEffect(() => {
    void focusNonce;
    const handles = handlesRef.current;
    if (!handles || status !== "ready" || !highlight) return;
    const duration = prefersReducedMotion() ? 0 : 2000;

    if (highlight.kind === "buildings") {
      if (highlight.buildings.length === 1) {
        const b = highlight.buildings[0];
        handles.map.flyTo({ center: [b.lon, b.lat], zoom: 16.8, pitch: 55, duration, essential: true });
      } else if (highlight.buildings.length > 1) {
        const lons = highlight.buildings.map((b) => b.lon);
        const lats = highlight.buildings.map((b) => b.lat);
        handles.map.fitBounds(
          [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ],
          { padding: 90, duration: prefersReducedMotion() ? 0 : 700, maxZoom: 16.6 },
        );
      }
      return;
    }

    if (highlight.kind === "places") {
      const anchor = highlight.near && buildings ? findBuilding(buildings, highlight.near) : null;
      const anchorCenter = anchor ? featureCentroid(anchor) : null;
      const points = [...highlight.places.map((p): LngLat => [p.lon, p.lat]), ...(anchorCenter ? [anchorCenter] : [])];
      if (points.length === 0) return;
      const lons = points.map((p) => p[0]);
      const lats = points.map((p) => p[1]);
      handles.map.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        { padding: 90, duration: prefersReducedMotion() ? 0 : 700, maxZoom: 16.6 },
      );
      return;
    }

    const route = resolveRoute(buildings, highlight);
    if (!route) return;
    const bounds = featuresBounds([route.from, route.to]);
    if (!bounds) return;
    // Widen to cover the traced polyline, which can detour outside the
    // footprints' box.
    for (const [x, y] of routePath?.path ?? []) {
      if (x < bounds.west) bounds.west = x;
      if (x > bounds.east) bounds.east = x;
      if (y < bounds.south) bounds.south = y;
      if (y > bounds.north) bounds.north = y;
    }
    handles.map.fitBounds(
      [
        [bounds.west, bounds.south],
        [bounds.east, bounds.north],
      ],
      { padding: 90, duration: prefersReducedMotion() ? 0 : 700, maxZoom: 16.6 },
    );
  }, [buildings, highlight, focusNonce, status, routePath]);

  useEffect(() => {
    const handles = handlesRef.current;
    if (!handles || status !== "ready" || !selected || highlight) return;
    handles.map.flyTo({
      center: selected.centroid,
      zoom: 16.8,
      pitch: 55,
      duration: prefersReducedMotion() ? 0 : 700,
      essential: true,
    });
  }, [highlight, selected, status]);

  return (
    // The outer workspace surface clips the full-bleed map. A second radius
    // would show a double curve where the map meets its header.
    // biome-ignore lint/a11y/noStaticElementInteractions: mouseleave clears tooltip
    <div className="relative h-full w-full overflow-hidden" onMouseLeave={() => setPicked(null)}>
      <div
        ref={containerRef}
        className="h-full w-full"
        role="application"
        aria-label="Interactive campus map"
        aria-roledescription="map"
      />
      {showBuildingPopup && selected && <BuildingPopup building={selected} onClose={() => selectBuilding(null)} />}
      {entranceStatus === "error" ? (
        <div
          role="alert"
          className="neu-panel bg-surface absolute right-3 bottom-28 z-20 flex max-w-64 items-center gap-2 rounded-xl p-2"
        >
          <span className="text-on-surface-variant text-xs">Entrance markers unavailable.</span>
          <button
            type="button"
            onClick={() => setEntranceNonce((nonce) => nonce + 1)}
            className="focus-visible:ring-primary/40 text-primary min-h-11 rounded-lg px-2 text-xs font-medium focus-visible:ring-2 sm:min-h-9"
          >
            Retry
          </button>
        </div>
      ) : null}
      {picked && (picked.name || picked.code) && (
        <div
          className="bg-surface-bright pointer-events-none absolute z-10 max-w-60 rounded-lg px-3 py-2 shadow-md"
          style={tooltipPosition(picked, containerRef.current)}
          role="status"
        >
          {picked.name && <p className="text-on-surface text-sm leading-snug font-medium">{picked.name}</p>}
          {picked.code && <p className="text-on-surface-variant mt-0.5 font-mono text-xs">{picked.code}</p>}
        </div>
      )}
      {highlight && (
        <p className="sr-only" role="status">
          {highlight.kind === "route"
            ? highlight.method === "estimate"
              ? `Straight-line distance estimate: ${highlight.from} to ${highlight.to}, ${formatMeters(highlight.meters)}.`
              : `Route displayed on map: ${highlight.from} to ${highlight.to}, ${formatMeters(highlight.meters)}, ${formatMinutes(highlight.minutes)} walk.`
            : highlight.kind === "buildings"
              ? `Highlighted on map: ${highlight.buildings.map((b) => `${b.name} (${b.code})`).join(", ")}.`
              : `${highlight.places.length} places marked on map${highlight.near ? ` near ${highlight.near}` : ""}.`}
        </p>
      )}
    </div>
  );
}
