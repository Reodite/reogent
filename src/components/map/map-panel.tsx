"use client";

// Hosts a Tools-only building explorer and the AI map-only canvas over one map renderer.
import { useAppAuth } from "@/src/components/auth/app-auth";
import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { Icon } from "@/src/components/icons";
import { BuildingRail, type BuildingDetailsState, type BuildingRouteState } from "@/src/components/map/building-rail";
import { CampusMap, type MapControls, type MapStatus } from "@/src/components/map/campus-map";
import { useApi } from "@/src/components/providers";
import { useShellNavigation } from "@/src/components/shell/shell-navigation";
import { LoadingStatus, RetryState } from "@/src/components/ui/feedback";
import { WorkspaceCanvas, WorkspacePage, WorkspacePanel } from "@/src/components/ui/workspace";
import type { BuildingSummary } from "@/src/lib/api-types";
import {
  buildingsFromGeoJson,
  formatBuildingUrl,
  parseBuildingParam,
  popularBuildings,
} from "@/src/lib/building-catalog";
import { formatMeters, formatMinutes } from "@/src/lib/format";
import type { MapHighlight } from "@/src/lib/walking";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";

/** Primary label for a map highlight (title line). */
function highlightTitle(h: MapHighlight): string {
  if (h.kind === "route") return formatMinutes(h.minutes);
  if (h.kind === "buildings") {
    return h.buildings.length === 1 ? h.buildings[0].name : `${h.buildings.length} buildings`;
  }
  return `${h.places.length} place${h.places.length === 1 ? "" : "s"}${h.near ? ` near ${h.near}` : ""}`;
}

/** Secondary label for a map highlight (detail line). */
function highlightSubtitle(h: MapHighlight): string {
  if (h.kind === "route") {
    const label = h.method === "estimate" ? "Straight-line estimate" : "Walking route";
    return `${label} · ${formatMeters(h.meters)} · ${h.from} → ${h.to}`;
  }
  if (h.kind === "buildings") return h.buildings.map((b) => b.code).join(" · ");
  return h.near ? `near ${h.near}` : (h.places[0]?.name ?? "");
}

/** Text-only fallback description when the map fails to load. */
function highlightFallback(h: MapHighlight): string {
  if (h.kind === "route") {
    return h.method === "estimate"
      ? `Straight-line estimate: ${formatMeters(h.meters)} between ${h.from} and ${h.to}.`
      : `${formatMeters(h.meters)}, about ${formatMinutes(h.minutes)} walking from ${h.from} to ${h.to}.`;
  }
  if (h.kind === "buildings") return h.buildings.map((b) => `${b.name} (${b.code})`).join(", ");
  return h.places.map((p) => p.name).join(", ") + (h.near ? ` — near ${h.near}` : "");
}

function GlassButton({
  label,
  icon,
  onClick,
  pressed,
}: {
  label: string;
  icon: React.ComponentProps<typeof Icon>["name"];
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={`focus-visible:ring-primary/40 neu-panel flex size-11 items-center justify-center rounded-2xl transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1 sm:size-10 ${
        pressed ? "text-primary" : "text-on-surface-variant hover:text-primary"
      }`}
    >
      <Icon name={icon} size={20} />
    </button>
  );
}

function RouteInfoCard({ highlight }: { highlight: MapHighlight | null }) {
  const reduce = useReducedMotion();
  const key = highlight
    ? highlight.kind === "route"
      ? `${highlight.from}-${highlight.to}`
      : highlight.kind === "buildings"
        ? highlight.buildings.map((b) => b.code).join(",")
        : highlight.places.map((p) => p.name).join(",")
    : "";

  return (
    <AnimatePresence mode="wait">
      {highlight && (
        <motion.div
          key={key}
          initial={reduce ? false : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="neu-panel flex items-center gap-2.5 rounded-2xl px-3 py-2"
        >
          <span className="bg-secondary-container text-on-secondary-container flex size-8 items-center justify-center rounded-md">
            <Icon name={highlight.kind === "route" ? "walk" : "location"} size={18} />
          </span>
          <span className="min-w-0">
            <span className="text-on-surface block truncate text-base leading-tight font-medium">
              {highlightTitle(highlight)}
            </span>
            <span className="text-on-surface-variant block truncate text-xs">{highlightSubtitle(highlight)}</span>
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MapFallback({ highlight, onRetry }: { highlight: MapHighlight | null; onRetry?: () => void }) {
  if (!onRetry) return null;
  return (
    <RetryState
      icon="wifiOff"
      title="Map unavailable"
      message={
        highlight ? "The map couldn't load. Route details remain available below." : "The campus map couldn't load."
      }
      onRetry={onRetry}
      retryLabel="Retry"
      className="bg-surface-container-low h-full justify-center px-6"
    >
      {highlight ? <p className="text-on-surface max-w-60 text-sm">{highlightFallback(highlight)}</p> : null}
    </RetryState>
  );
}

interface MapSurfaceProps {
  hideOverlayControls?: boolean;
  highlight?: MapHighlight | null;
  selectedBuilding?: BuildingSummary | null;
  onBuildingSelect?: (building: BuildingSummary | null) => void;
  showBuildingPopup?: boolean;
  controlsRef?: React.RefObject<MapControls | null>;
}

function MapSurface({
  hideOverlayControls,
  highlight: highlightOverride,
  selectedBuilding,
  onBuildingSelect,
  showBuildingPopup,
  controlsRef,
}: MapSurfaceProps) {
  const shell = useChatShell();
  const highlight = highlightOverride === undefined ? shell.highlight : highlightOverride;
  const focusNonce = shell.focusNonce;
  const [showRoutes, setShowRoutes] = useState(false);
  const [status, setStatus] = useState<MapStatus>("loading");
  const [mapKey, setMapKey] = useState(0);
  const internalControls = useRef<MapControls | null>(null);
  const controls = controlsRef ?? internalControls;

  // Timeout: if map stays loading for 15s, treat as error
  useEffect(() => {
    if (status !== "loading") return;
    const timer = setTimeout(() => setStatus("error"), 15_000);
    return () => clearTimeout(timer);
  }, [status]);

  function retryMap() {
    setStatus("loading");
    setMapKey((k) => k + 1);
  }

  return (
    <div className="relative h-full w-full" aria-busy={status === "loading"} data-map-status={status}>
      {status === "error" ? (
        <MapFallback highlight={highlight} onRetry={retryMap} />
      ) : (
        <>
          <CampusMap
            key={mapKey}
            highlight={highlight}
            focusNonce={focusNonce}
            showRoutes={showRoutes}
            selectedBuilding={selectedBuilding}
            onBuildingSelect={onBuildingSelect}
            showBuildingPopup={showBuildingPopup}
            onStatus={setStatus}
            controls={controls}
          />
          {status === "loading" && (
            <div className="bg-surface-container-low absolute inset-0 animate-pulse" aria-hidden="true" />
          )}

          {/* Route info — floating top-left (hidden in mobile sheet where header shows it) */}
          {!hideOverlayControls && (
            <div className="canvas-left-inset absolute top-3 left-3 z-10 max-w-[75%]">
              <RouteInfoCard highlight={highlight} />
            </div>
          )}

          {/* Layer + view controls — floating top-right */}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
            <GlassButton
              label={showRoutes ? "Hide walking paths" : "Show walking paths"}
              icon="layer"
              pressed={showRoutes}
              onClick={() => setShowRoutes((v) => !v)}
            />
            <GlassButton label="Reset view" icon="aiming" onClick={() => controls.current?.resetView()} />
          </div>

          {/* Zoom — floating bottom-right */}
          <div className="neu-panel absolute right-3 bottom-6 z-10 flex flex-col overflow-hidden rounded-xl">
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => controls.current?.zoomIn()}
              className="focus-visible:ring-primary/40 text-on-surface-variant hover:text-primary flex size-11 items-center justify-center transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1 sm:size-10"
            >
              <Icon name="add" size={20} />
            </button>
            <span className="bg-border-subtle/60 mx-2 block h-px" aria-hidden="true" />
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => controls.current?.zoomOut()}
              className="focus-visible:ring-primary/40 text-on-surface-variant hover:text-primary flex size-11 items-center justify-center transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1 sm:size-10"
            >
              <Icon name="minimize" size={20} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function writeBuildingParam(building: BuildingSummary | null): void {
  const url = new URL(window.location.href);
  if (building) url.searchParams.set("building", building.code);
  else url.searchParams.delete("building");
  window.history.pushState(null, "", url);
}

function CampusMapExplorer() {
  const api = useApi();
  const auth = useAppAuth();
  const navigation = useShellNavigation();
  const searchParams = useSearchParams();
  const shell = useChatShell();
  const [catalog, setCatalog] = useState<BuildingSummary[]>([]);
  const [catalogStatus, setCatalogStatus] = useState<"loading" | "ready" | "error">("loading");
  const [catalogNonce, setCatalogNonce] = useState(0);
  const [query, setQuery] = useState("");
  const [originQuery, setOriginQuery] = useState("");
  const [selectedCode, setSelectedCode] = useState<string | null>(() => searchParams.get("building"));
  const [railMode, setRailMode] = useState<"discover" | "details" | "directions">(
    selectedCode ? "details" : "discover",
  );
  const [view, setView] = useState<"main" | "rail">("main");
  const [details, setDetails] = useState<BuildingDetailsState>({ status: "idle" });
  const [detailsNonce, setDetailsNonce] = useState(0);
  const [favoriteCodes, setFavoriteCodes] = useState<string[]>([]);
  const [favoriteStatus, setFavoriteStatus] = useState<"idle" | "loading" | "saving" | "error">("idle");
  const [route, setRoute] = useState<BuildingRouteState>({ status: "idle" });
  const [routeHighlight, setRouteHighlight] = useState<MapHighlight | null>(null);
  const [shareStatus, setShareStatus] = useState<"idle" | "shared" | "copied" | "error">("idle");
  const controls = useRef<MapControls | null>(null);
  const routeController = useRef<AbortController | null>(null);
  const authenticated = auth.status === "signedIn" && !auth.isGuest;
  const selected = useMemo(() => parseBuildingParam(selectedCode, catalog), [catalog, selectedCode]);
  const favoriteSet = useMemo(() => new Set(favoriteCodes), [favoriteCodes]);
  const curated = useMemo(() => popularBuildings(catalog), [catalog]);
  const selectionError =
    catalogStatus === "ready" && selectedCode && !selected
      ? `Building “${selectedCode}” is not in the current catalog.`
      : null;
  const mapHighlight = useMemo<MapHighlight | null>(() => {
    if (routeHighlight) return routeHighlight;
    if (!selected) return shell.highlight;
    return {
      kind: "buildings",
      buildings: [
        {
          code: selected.code,
          name: selected.name,
          lon: selected.centroid[0],
          lat: selected.centroid[1],
        },
      ],
    };
  }, [routeHighlight, selected, shell.highlight]);

  useEffect(() => {
    void catalogNonce;
    let cancelled = false;
    setCatalogStatus("loading");
    api
      .getGeo("buildings")
      .then((collection) => {
        if (cancelled) return;
        const next = buildingsFromGeoJson(collection);
        setCatalog(next);
        setCatalogStatus(next.length > 0 ? "ready" : "error");
      })
      .catch(() => {
        if (!cancelled) setCatalogStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [api, catalogNonce]);

  useEffect(() => {
    const code = searchParams.get("building");
    setSelectedCode(code);
    setRailMode(code ? "details" : "discover");
  }, [searchParams]);

  useEffect(() => {
    if (!selected) {
      setDetails({ status: "idle" });
      return;
    }
    void detailsNonce;
    const controller = new AbortController();
    setDetails({ status: "loading" });
    api
      .getBuildingDetails(selected.code, controller.signal)
      .then((data) => setDetails({ status: "ready", data }))
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setDetails({ status: "error" });
      });
    return () => controller.abort();
  }, [api, detailsNonce, selected]);

  useEffect(() => {
    if (!authenticated) {
      setFavoriteCodes([]);
      setFavoriteStatus("idle");
      return;
    }
    let cancelled = false;
    setFavoriteStatus("loading");
    api
      .getBuildingFavorites()
      .then(({ codes }) => {
        if (cancelled) return;
        setFavoriteCodes(codes);
        setFavoriteStatus("idle");
      })
      .catch(() => {
        if (!cancelled) setFavoriteStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [api, authenticated]);

  useEffect(() => {
    if (view !== "main") return;
    const frame = requestAnimationFrame(() => controls.current?.resize());
    return () => cancelAnimationFrame(frame);
  }, [view]);

  const selectBuilding = useCallback((building: BuildingSummary | null) => {
    routeController.current?.abort();
    setRoute({ status: "idle" });
    setRouteHighlight(null);
    setShareStatus("idle");
    setSelectedCode(building?.code ?? null);
    setRailMode(building ? "details" : "discover");
    if (building) setView("rail");
    writeBuildingParam(building);
  }, []);

  const runRoute = useCallback(
    (origin: BuildingSummary) => {
      if (!selected) return;
      routeController.current?.abort();
      const controller = new AbortController();
      routeController.current = controller;
      setRoute({ status: "loading", from: origin, to: selected });
      api
        .getRoute(origin.code, selected.code, controller.signal)
        .then((result) => {
          const status = result.method === "network" ? "network" : "estimate";
          setRoute({ status, from: origin, to: selected, route: result });
          setRouteHighlight({
            kind: "route",
            from: result.from,
            to: result.to,
            meters: result.meters,
            minutes: result.minutes,
            method: result.method,
            ...(result.method === "network" ? { path: result.polyline } : {}),
          });
          if (status === "network") setView("main");
        })
        .catch((error) => {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setRoute({ status: "error", from: origin, to: selected });
          }
        });
    },
    [api, selected],
  );

  async function toggleFavorite(code: string) {
    if (!authenticated) {
      setFavoriteStatus("error");
      return;
    }
    const previous = favoriteCodes;
    const saved = !favoriteSet.has(code);
    setFavoriteCodes(
      saved ? [code, ...previous.filter((item) => item !== code)] : previous.filter((item) => item !== code),
    );
    setFavoriteStatus("saving");
    try {
      const response = await api.setBuildingFavorite(code, saved);
      setFavoriteCodes(response.codes);
      setFavoriteStatus("idle");
    } catch {
      setFavoriteCodes(previous);
      setFavoriteStatus("error");
    }
  }

  async function shareBuilding() {
    if (!selected) return;
    const url = formatBuildingUrl(new URL(window.location.href), selected.code).href;
    setShareStatus("idle");
    if (navigator.share) {
      try {
        await navigator.share({ title: selected.name, url });
        setShareStatus("shared");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareStatus("copied");
    } catch {
      setShareStatus("error");
    }
  }

  function openGoogleMaps() {
    if (!selected) return;
    const url = new URL("https://www.google.com/maps/search/");
    url.searchParams.set("api", "1");
    url.searchParams.set("query", `${selected.centroid[1]},${selected.centroid[0]}`);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const rail =
    catalogStatus === "loading" ? (
      <WorkspacePanel title="Explore">
        <LoadingStatus>Loading building catalog…</LoadingStatus>
      </WorkspacePanel>
    ) : catalogStatus === "error" ? (
      <WorkspacePanel title="Explore">
        <RetryState
          title="Building catalog unavailable"
          message="The map can stay open while you retry building search."
          onRetry={() => setCatalogNonce((nonce) => nonce + 1)}
          compact
          align="start"
        />
      </WorkspacePanel>
    ) : (
      <BuildingRail
        mode={selected ? railMode : "discover"}
        query={query}
        originQuery={originQuery}
        catalog={catalog}
        popular={curated}
        favorites={favoriteSet}
        favoriteStatus={favoriteStatus}
        authenticated={authenticated}
        selected={selected}
        details={details}
        route={route}
        shareStatus={shareStatus}
        selectionError={selectionError}
        onQueryChange={setQuery}
        onOriginQueryChange={setOriginQuery}
        onSelect={selectBuilding}
        onBack={() => {
          if (railMode === "directions") {
            setRailMode("details");
            setOriginQuery("");
            setRoute({ status: "idle" });
            setRouteHighlight(null);
          } else {
            selectBuilding(null);
          }
        }}
        onShowMap={() => setView("main")}
        onDirections={() => {
          setRailMode("directions");
          setOriginQuery("");
          setRoute({ status: "idle" });
          setRouteHighlight(null);
        }}
        onRoute={runRoute}
        onRetryRoute={() => {
          if (route.status !== "idle") runRoute(route.from);
        }}
        onRetryDetails={() => setDetailsNonce((nonce) => nonce + 1)}
        onToggleFavorite={(code) => {
          if (authenticated) void toggleFavorite(code);
          else navigation.push("/login");
        }}
        onShare={shareBuilding}
        onOpenGoogleMaps={openGoogleMaps}
      />
    );

  return (
    <WorkspacePage
      composition="split"
      title="Campus map"
      description="Find buildings, inspect rooms and services, and plan a campus walk."
      rail={rail}
      view={view}
      onViewChange={setView}
      mainLabel="Map"
      railLabel="Explore"
    >
      <WorkspaceCanvas overflow="hidden">
        <MapSurface
          highlight={mapHighlight}
          selectedBuilding={selected}
          onBuildingSelect={selectBuilding}
          showBuildingPopup={false}
          controlsRef={controls}
        />
      </WorkspaceCanvas>
    </WorkspacePage>
  );
}

function MapExplorerLoading() {
  return (
    <WorkspacePage composition="canvas" title="Campus map" description="Find buildings, rooms, and walking routes.">
      <WorkspaceCanvas overflow="hidden">
        <div className="bg-surface-container-low h-full animate-pulse" role="status" aria-label="Loading campus map" />
      </WorkspaceCanvas>
    </WorkspacePage>
  );
}

/** Renders the Tools explorer or the AI map-only surface from the current shell host. */
export function MapArea() {
  const { mode } = useChatShell();
  if (mode !== "tools") {
    return (
      <div className="relative h-full w-full">
        <MapSurface />
      </div>
    );
  }

  return (
    <Suspense fallback={<MapExplorerLoading />}>
      <CampusMapExplorer />
    </Suspense>
  );
}
