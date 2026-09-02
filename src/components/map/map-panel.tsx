"use client";

// Desktop/tablet collapsible map card, mobile bottom sheet, floating controls,
// and text fallback for map load failures.
import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { Icon } from "@/src/components/icons";
import { CampusMap, type MapControls, type MapStatus } from "@/src/components/map/campus-map";
import { RetryState } from "@/src/components/ui/feedback";
import { WorkspaceCanvas, WorkspacePage } from "@/src/components/ui/workspace";
import { formatMeters, formatMinutes } from "@/src/lib/format";
import type { MapHighlight } from "@/src/lib/walking";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

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

function RouteInfoCard() {
  const { highlight } = useChatShell();
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

function MapFallback({ onRetry }: { onRetry?: () => void }) {
  const { highlight } = useChatShell();
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

function MapSurface({ hideOverlayControls }: { hideOverlayControls?: boolean }) {
  const { highlight, focusNonce } = useChatShell();
  const [showRoutes, setShowRoutes] = useState(false);
  const [status, setStatus] = useState<MapStatus>("loading");
  const [mapKey, setMapKey] = useState(0);
  const controls = useRef<MapControls | null>(null);

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
        <MapFallback onRetry={retryMap} />
      ) : (
        <>
          <CampusMap
            key={mapKey}
            highlight={highlight}
            focusNonce={focusNonce}
            showRoutes={showRoutes}
            onStatus={setStatus}
            controls={controls}
          />
          {status === "loading" && (
            <div className="bg-surface-container-low absolute inset-0 animate-pulse" aria-hidden="true" />
          )}

          {/* Route info — floating top-left (hidden in mobile sheet where header shows it) */}
          {!hideOverlayControls && (
            <div className="canvas-left-inset absolute top-3 left-3 z-10 max-w-[75%]">
              <RouteInfoCard />
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

/** Registry-facing map pane. Shutdown of the active widget routes through the
 * shell's workspaceView + the Answer Canvas header collapse button. */
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
    <WorkspacePage composition="canvas" title="Campus map" description="Explore buildings, routes, and campus places.">
      <WorkspaceCanvas overflow="hidden">
        <MapSurface />
      </WorkspaceCanvas>
    </WorkspacePage>
  );
}
