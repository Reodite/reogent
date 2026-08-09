"use client";

// Map chrome: the neumorphic desktop/tablet card (collapsible to a rail, per the
// design sketches) and the mobile bottom sheet. Floating glass overlays carry
// the route info and map controls; a text fallback covers map failures.
import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { Icon } from "@/src/components/icons";
import { CampusMap, type MapControls, type MapStatus } from "@/src/components/map/campus-map";
import { formatMeters, formatMinutes } from "@/src/lib/format";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);
  return mounted ? matches : false;
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
      className={`neu-panel flex size-10 items-center justify-center rounded-2xl transition-colors duration-150 ${
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
  // Stable key that changes when highlight data changes
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
              {highlight.kind === "route"
                ? formatMinutes(highlight.minutes)
                : highlight.kind === "buildings"
                  ? highlight.buildings.length === 1
                    ? highlight.buildings[0].name
                    : `${highlight.buildings.length} buildings`
                  : `${highlight.places.length} place${highlight.places.length === 1 ? "" : "s"}`}
            </span>
            <span className="text-on-surface-variant block truncate text-xs">
              {highlight.kind === "route"
                ? `${formatMeters(highlight.meters)} · ${highlight.from} → ${highlight.to}`
                : highlight.kind === "buildings"
                  ? highlight.buildings.map((b) => b.code).join(" · ")
                  : highlight.near
                    ? `near ${highlight.near}`
                    : highlight.places[0]?.name}
            </span>
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MapFallback({ onRetry }: { onRetry?: () => void }) {
  const { highlight } = useChatShell();
  return (
    <div
      role="status"
      className="bg-surface-container-low flex h-full flex-col items-center justify-center gap-2 px-6 text-center"
    >
      <Icon name="wifiOff" size={32} className="text-muted" />
      <p className="text-body-sm text-on-surface-variant">Map couldn&apos;t load. Route details are shown below.</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="neu-button bg-surface text-on-surface mt-2 flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium"
        >
          <Icon name="refresh2" size={14} />
          Retry
        </button>
      )}
      {highlight?.kind === "route" && (
        <p className="text-on-surface max-w-60 text-sm">
          {formatMeters(highlight.meters)}, about {formatMinutes(highlight.minutes)} walking from {highlight.from} to{" "}
          {highlight.to}.
        </p>
      )}
      {highlight?.kind === "buildings" && (
        <p className="text-on-surface max-w-60 text-sm">
          {highlight.buildings.map((b) => `${b.name} (${b.code})`).join(", ")}
        </p>
      )}
      {highlight?.kind === "places" && (
        <p className="text-on-surface max-w-60 text-sm">
          {highlight.places.map((p) => p.name).join(", ")}
          {highlight.near ? ` — near ${highlight.near}` : ""}
        </p>
      )}
    </div>
  );
}

function MapSurface({ onCollapse, hideOverlayControls }: { onCollapse: () => void; hideOverlayControls?: boolean }) {
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
    <div className="relative h-full w-full" aria-busy={status === "loading"}>
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
            <div className="absolute top-3 left-3 z-10 max-w-[75%]">
              <RouteInfoCard />
            </div>
          )}

          {/* Layer + view controls — floating top-right */}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
            {!hideOverlayControls && <GlassButton label="Collapse map" icon="right" onClick={onCollapse} />}
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
              className="text-on-surface-variant hover:text-primary flex size-10 items-center justify-center transition-colors duration-150"
            >
              <Icon name="add" size={20} />
            </button>
            <span className="bg-border-subtle/60 mx-2 block h-px" aria-hidden="true" />
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => controls.current?.zoomOut()}
              className="text-on-surface-variant hover:text-primary flex size-10 items-center justify-center transition-colors duration-150"
            >
              <Icon name="minimize" size={20} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Desktop/tablet: a persistent tool slot that collapses into a passive rail. */
export function MapPanel() {
  const { mapOpen, setMapOpen, highlight } = useChatShell();
  const isMobile = useMediaQuery("(max-width: 639px)");

  // A fresh route is the moment the map earns attention — reopen the tab.
  useEffect(() => {
    if (highlight) setMapOpen(true);
  }, [highlight, setMapOpen]);

  if (isMobile) return null;

  return (
    <div className="map-panel-root relative h-full min-h-0 w-full overflow-hidden">
      <section
        inert={!mapOpen}
        aria-hidden={!mapOpen}
        aria-label="Campus map"
        className="map-surface-layer neu-panel absolute inset-0 flex min-w-0 overflow-hidden rounded-2xl"
      >
        <MapSurface onCollapse={() => setMapOpen(false)} />
      </section>

      <aside
        inert={mapOpen}
        aria-hidden={mapOpen}
        aria-label="Collapsed campus map"
        className="map-tab-layer neu-panel text-on-surface-variant absolute inset-y-0 right-0 flex w-[3.75rem] cursor-default flex-col items-center rounded-2xl py-3"
      >
        <button
          type="button"
          onClick={() => setMapOpen(true)}
          tabIndex={mapOpen ? -1 : 0}
          aria-label="Expand campus map"
          aria-expanded={mapOpen}
          title="Expand campus map"
          className="neu-panel text-primary hover:text-on-surface flex size-9 items-center justify-center rounded-xl transition-colors duration-150"
        >
          <Icon name="fullscreen" size={17} />
        </button>
        <span className="my-auto text-xs font-medium tracking-[0.06em] select-none [writing-mode:vertical-rl]">
          Campus map
        </span>
      </aside>
    </div>
  );
}

/** Mobile: 80vh bottom sheet with drag-to-dismiss. */
export function MapBottomSheet() {
  const { mobileMapOpen, setMobileMapOpen, highlight } = useChatShell();
  const isMobile = useMediaQuery("(max-width: 639px)");
  const sheetRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ startY: number; delta: number } | null>(null);

  useEffect(() => {
    if (!mobileMapOpen) return;
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const sheet = sheetRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMapOpen(false);
      // Focus trap: cycle Tab within the sheet
      if (event.key === "Tab" && sheet) {
        const focusable = sheet.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileMapOpen, setMobileMapOpen]);

  if (!isMobile) return null;

  function onPointerDown(event: React.PointerEvent) {
    drag.current = { startY: event.clientY, delta: 0 };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    // Suppress CSS transition during drag for responsive feel
    if (sheetRef.current) sheetRef.current.style.transitionProperty = "none";
  }

  function onPointerMove(event: React.PointerEvent) {
    if (!drag.current || !sheetRef.current) return;
    drag.current.delta = Math.max(0, event.clientY - drag.current.startY);
    sheetRef.current.style.transform = `translateY(${drag.current.delta}px)`;
  }

  function onPointerUp() {
    const sheet = sheetRef.current;
    const state = drag.current;
    drag.current = null;
    if (!sheet || !state) return;
    sheet.style.transitionProperty = "";
    sheet.style.transform = "";
    if (state.delta > sheet.offsetHeight * 0.2) setMobileMapOpen(false);
  }

  function onPointerCancel() {
    drag.current = null;
    if (sheetRef.current) {
      sheetRef.current.style.transitionProperty = "";
      sheetRef.current.style.transform = "";
    }
  }

  return (
    <div inert={!mobileMapOpen} className={mobileMapOpen ? "" : "pointer-events-none"}>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close map"
        onClick={() => setMobileMapOpen(false)}
        className={`bg-scrim fixed inset-0 z-40 transition-opacity duration-300 ${
          mobileMapOpen ? "opacity-100" : "opacity-0"
        }`}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label="Campus map"
        className={`neu-panel bg-surface fixed inset-x-0 bottom-0 z-50 flex h-[80dvh] flex-col overflow-hidden rounded-t-2xl pb-[env(safe-area-inset-bottom)] transition-transform duration-300 [transition-timing-function:var(--neu-ease)] ${
          mobileMapOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div
          className="flex shrink-0 cursor-grab touch-none flex-col items-center gap-2 px-4 pt-3 pb-3"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        >
          <span className="bg-outline/40 h-1.5 w-10 rounded-full" aria-hidden="true" />
          <div className="flex w-full items-center justify-between">
            <span className="min-w-0">
              <span className="text-on-surface block truncate text-base font-medium">
                {highlight
                  ? highlight.kind === "route"
                    ? `${highlight.from} → ${highlight.to}`
                    : highlight.kind === "buildings"
                      ? highlight.buildings.length === 1
                        ? highlight.buildings[0].name
                        : `${highlight.buildings.length} buildings`
                      : `${highlight.places.length} place${highlight.places.length === 1 ? "" : "s"}${highlight.near ? ` near ${highlight.near}` : ""}`
                  : "Campus map"}
              </span>
              {highlight?.kind === "route" && (
                <span className="text-on-surface-variant block text-sm">
                  {formatMeters(highlight.meters)} · {formatMinutes(highlight.minutes)} walk
                </span>
              )}
            </span>
            <button
              ref={closeRef}
              type="button"
              onClick={() => setMobileMapOpen(false)}
              aria-label="Close map"
              className="text-on-surface-variant hover:bg-surface-container-high flex size-11 shrink-0 items-center justify-center rounded-lg transition-colors duration-150"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          {mobileMapOpen && <MapSurface onCollapse={() => setMobileMapOpen(false)} hideOverlayControls />}
        </div>
      </div>
    </div>
  );
}
