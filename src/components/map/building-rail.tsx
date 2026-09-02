"use client";

import { Icon } from "@/src/components/icons";
import { Button } from "@/src/components/ui/button";
import { LoadingStatus, RetryAlert } from "@/src/components/ui/feedback";
import { SearchInput } from "@/src/components/ui/form-controls";
import { WorkspacePanel } from "@/src/components/ui/workspace";
import type { BuildingDetails, BuildingSummary, OfficialBuildingPhoto, RouteResponse } from "@/src/lib/api-types";
import { searchBuildings } from "@/src/lib/building-catalog";
import { formatMeters, formatMinutes } from "@/src/lib/format";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type BuildingDetailsState =
  { status: "idle" } | { status: "loading" } | { status: "ready"; data: BuildingDetails } | { status: "error" };

export type BuildingRouteState =
  | { status: "idle" }
  | { status: "loading"; from: BuildingSummary; to: BuildingSummary }
  | { status: "network" | "estimate"; from: BuildingSummary; to: BuildingSummary; route: RouteResponse }
  | { status: "error"; from: BuildingSummary; to: BuildingSummary };

export interface BuildingRailProps {
  mode: "discover" | "details" | "directions";
  query: string;
  originQuery: string;
  catalog: BuildingSummary[];
  popular: BuildingSummary[];
  favorites: ReadonlySet<string>;
  favoriteStatus: "idle" | "loading" | "saving" | "error";
  authenticated: boolean;
  selected: BuildingSummary | null;
  details: BuildingDetailsState;
  route: BuildingRouteState;
  shareStatus: "idle" | "shared" | "copied" | "copy" | "error";
  selectionError: string | null;
  onQueryChange: (query: string) => void;
  onOriginQueryChange: (query: string) => void;
  onSelect: (building: BuildingSummary) => void;
  onBack: () => void;
  onDirections: () => void;
  onRoute: (origin: BuildingSummary) => void;
  onRetryRoute: () => void;
  onRetryDetails: () => void;
  onToggleFavorite: (code: string) => void;
  onShare: () => void;
  onCopyLink: () => void;
  onOpenGoogleMaps: () => void;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{8}$/.test(value)) return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("en-CA", { dateStyle: "medium" }) : value;
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-1.5 text-sm">
      <dt className="text-on-surface-variant">{label}</dt>
      <dd className="text-on-surface max-w-40 text-right">{value}</dd>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-border-subtle border-t pt-3 first:border-t-0 first:pt-0">
      <h3 className="text-on-surface mb-2 text-sm font-medium">{title}</h3>
      {children}
    </section>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="focus-visible:ring-primary/40 text-primary inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-medium underline underline-offset-2 focus-visible:ring-2 sm:min-h-9"
    >
      {children}
      <Icon name="externalLink" size={14} />
    </a>
  );
}

function OfficialPhotoCard({ photo }: { photo: OfficialBuildingPhoto }) {
  const [failed, setFailed] = useState(false);
  return (
    <figure className="bg-surface-container min-w-full snap-start overflow-hidden rounded-lg">
      {!failed ? (
        // biome-ignore lint/performance/noImgElement: the API returns validated official image endpoints.
        <img
          src={photo.url}
          alt={photo.alt}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-36 w-full object-cover"
        />
      ) : null}
      <figcaption className="px-3 py-2 text-xs">
        {failed ? <span className="text-muted mr-2">Photo unavailable.</span> : null}
        <ExternalLink href={photo.sourceUrl}>{photo.sourceName}</ExternalLink>
      </figcaption>
    </figure>
  );
}

export function BuildingDetailContent({ details }: { details: BuildingDetails }) {
  const { building } = details;
  const unavailable = Object.entries(details.sourceStatus).filter(([, source]) => source.state === "unavailable");

  return (
    <div className="flex flex-col gap-4">
      {details.photos.length > 0 ? (
        <section aria-label="Building photos" className="flex snap-x [scrollbar-gutter:stable] gap-2 overflow-x-auto">
          {details.photos.map((photo) => (
            <OfficialPhotoCard key={photo.sourceUrl} photo={photo} />
          ))}
        </section>
      ) : null}

      {(building.shortName || details.addresses.length > 0 || building.postalCode) && (
        <DetailSection title="Address">
          <dl className="divide-border-subtle divide-y">
            {building.shortName ? <Fact label="Short name" value={building.shortName} /> : null}
            {details.addresses.map((address) => (
              <Fact
                key={`${address.fullAddress}-${address.siteName ?? ""}-${address.pointType ?? ""}-${address.primary}`}
                label={address.primary ? "Primary address" : address.mailing ? "Mailing address" : "Address"}
                value={address.fullAddress}
              />
            ))}
            {building.postalCode ? <Fact label="Postal code" value={building.postalCode} /> : null}
          </dl>
        </DetailSection>
      )}

      {details.rooms.length > 0 ? (
        <DetailSection title={`Rooms & spaces (${details.rooms.length})`}>
          <ul className="flex flex-col gap-2">
            {details.rooms.map((room) => (
              <li key={`${room.name}-${room.roomNumber ?? ""}`} className="bg-surface-container-low rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-on-surface truncate text-sm font-medium">{room.name}</p>
                    <p className="text-on-surface-variant mt-0.5 text-xs">
                      {[
                        room.spaceType,
                        room.floor != null ? `Floor ${room.floor}` : null,
                        room.capacity != null ? `${room.capacity} seats` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {[room.layout, room.furniture].filter(Boolean).length > 0 ? (
                      <p className="text-muted mt-1 text-xs">
                        {[room.layout, room.furniture].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  {room.link ? <ExternalLink href={room.link}>Details</ExternalLink> : null}
                </div>
              </li>
            ))}
          </ul>
        </DetailSection>
      ) : null}

      {details.availability?.rooms.length ? (
        <DetailSection title={`Bookable rooms (${details.availability.rooms.length})`}>
          <p className="text-muted mb-2 text-xs">
            {details.availability.freshness === "unknown"
              ? "Snapshot time unavailable"
              : `${details.availability.freshness === "historical" ? "Historical snapshot" : "Snapshot"} · ${formatDate(details.availability.as_of)}`}
          </p>
          <ul className="flex flex-col gap-2">
            {details.availability.rooms.map((room) => (
              <li
                key={room.title}
                className="bg-surface-container-low flex items-start justify-between gap-2 rounded-lg p-3"
              >
                <div>
                  <p className="text-on-surface text-sm font-medium">{room.title}</p>
                  <p className="text-on-surface-variant mt-0.5 text-xs">
                    {room.freeNow
                      ? `Free until ${room.freeUntil ?? "the next booking"}`
                      : room.nextFree
                        ? `Next free at ${room.nextFree}`
                        : "No free interval in this snapshot"}
                    {room.capacity != null ? ` · ${room.capacity} people` : ""}
                  </p>
                </div>
                {room.url ? <ExternalLink href={room.url}>Book</ExternalLink> : null}
              </li>
            ))}
          </ul>
        </DetailSection>
      ) : null}

      {details.pois.length > 0 ? (
        <DetailSection title={`Food & services (${details.pois.length})`}>
          <ul className="flex flex-col gap-2">
            {details.pois.map((poi) => (
              <li key={poi.name} className="bg-surface-container-low rounded-lg p-3">
                <p className="text-on-surface text-sm font-medium">{poi.name}</p>
                <p className="text-on-surface-variant mt-0.5 text-xs">
                  {[poi.service_type?.replace(/_/g, " "), poi.hours, poi.contact].filter(Boolean).join(" · ")}
                </p>
                <p className="text-muted mt-1 text-xs">
                  {poi.association === "official-address" ? "Official address match" : "Located inside footprint"}
                </p>
                {poi.url ? <ExternalLink href={poi.url}>Website</ExternalLink> : null}
              </li>
            ))}
          </ul>
        </DetailSection>
      ) : null}

      {details.entrances.length > 0 ? (
        <DetailSection title={`Entrances (${details.entrances.length})`}>
          <ul className="divide-border-subtle divide-y">
            {details.entrances.map((entrance, index) => (
              <li key={entrance.id} className="flex items-center gap-2 py-2 text-sm">
                <Icon name="door" size={16} className="text-on-surface-variant" />
                <span className="text-on-surface flex-1">{entrance.entranceType ?? `Entrance ${index + 1}`}</span>
                {entrance.doorCount != null ? (
                  <span className="text-muted text-xs">{entrance.doorCount} doors</span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="text-muted mt-2 text-xs">Accessibility details are unavailable in the source metadata.</p>
        </DetailSection>
      ) : null}

      <DetailSection title="Sources">
        <ul className="flex flex-col gap-1.5">
          {Object.values(details.sourceStatus).map((source) => (
            <li key={source.provenance.sourceName} className="flex items-start justify-between gap-2 text-xs">
              <span className="text-on-surface-variant">{source.provenance.sourceName}</span>
              <span className={source.state === "ready" ? "text-muted" : "text-error"}>
                {source.state === "ready"
                  ? formatDate(source.provenance.refreshedAt) || "Date unavailable"
                  : "Unavailable"}
              </span>
            </li>
          ))}
        </ul>
      </DetailSection>

      {unavailable.length > 0 ? (
        <p className="text-error text-xs">Some source sections are unavailable. Retry details to check again.</p>
      ) : null}
    </div>
  );
}

function BuildingRow({
  building,
  saved,
  id,
  selected,
  onSelect,
}: {
  building: BuildingSummary;
  saved: boolean;
  id?: string;
  selected?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      id={id}
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className="focus-visible:ring-primary/40 hover:bg-surface-container-high flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left focus-visible:ring-2"
    >
      <span className="bg-surface-container text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
        <Icon name={saved ? "bookmarkFill" : "building1"} size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-on-surface block truncate text-sm font-medium">{building.name}</span>
        <span className="text-muted block truncate text-xs">
          <span className="font-mono">{building.code}</span>
          {building.address ? ` · ${building.address}` : ""}
        </span>
      </span>
    </button>
  );
}

function BuildingList({
  label,
  buildings,
  favorites,
  onSelect,
}: {
  label: string;
  buildings: BuildingSummary[];
  favorites: ReadonlySet<string>;
  onSelect: (building: BuildingSummary) => void;
}) {
  if (buildings.length === 0) return null;
  return (
    <section aria-label={label}>
      <h3 className="text-muted px-2 pb-1.5 text-xs font-medium">{label}</h3>
      <div role="listbox" aria-label={label} className="flex flex-col gap-1">
        {buildings.map((building) => (
          <BuildingRow
            key={building.code}
            building={building}
            saved={favorites.has(building.code)}
            onSelect={() => onSelect(building)}
          />
        ))}
      </div>
    </section>
  );
}

export function BuildingRail(props: BuildingRailProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const discoveryScrollRef = useRef(0);
  const listboxId = useId();
  const searchQuery = props.mode === "directions" ? props.originQuery : props.query;
  const results = useMemo(() => searchBuildings(props.catalog, searchQuery), [props.catalog, searchQuery]);
  const saved = useMemo(() => {
    const byCode = new Map(props.catalog.map((building) => [building.code, building]));
    return [...props.favorites].flatMap((code) => {
      const building = byCode.get(code);
      return building ? [building] : [];
    });
  }, [props.catalog, props.favorites]);

  useEffect(() => {
    if (props.mode !== "discover") return;
    const frame = requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = discoveryScrollRef.current;
    });
    return () => cancelAnimationFrame(frame);
  }, [props.mode]);

  function selectResult(building: BuildingSummary) {
    if (props.mode === "directions") props.onRoute(building);
    else {
      discoveryScrollRef.current = listRef.current?.scrollTop ?? 0;
      props.onSelect(building);
    }
  }

  useEffect(() => {
    if (!searchQuery || results.length === 0) return;
    document
      .getElementById(`building-result-${results[Math.min(activeIndex, results.length - 1)].code}`)
      ?.scrollIntoView?.({
        block: "nearest",
      });
  }, [activeIndex, results, searchQuery]);

  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      setActiveIndex(0);
      if (props.mode === "directions") props.onOriginQueryChange("");
      else props.onQueryChange("");
      return;
    }
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      selectResult(results[Math.min(activeIndex, results.length - 1)]);
    }
  }

  const title = props.mode === "directions" ? "Directions" : props.mode === "details" ? "Building details" : "Explore";

  return (
    <WorkspacePanel title={title} bodyMode="contained" padding="none">
      {props.mode === "details" && props.selected ? (
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-border-subtle shrink-0 border-b px-3 py-3">
            <Button variant="ghost" size="compact" onClick={props.onBack}>
              <Icon name="left" size={15} />
              All buildings
            </Button>
            <div className="mt-3">
              <h2 className="text-on-surface text-base leading-snug font-medium">{props.selected.name}</h2>
              <p className="text-on-surface-variant mt-1 text-xs">
                <span className="font-mono">{props.selected.code}</span>
                {props.selected.address ? ` · ${props.selected.address}` : ""}
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="primary" size="compact" onClick={props.onDirections}>
                <Icon name="route" size={15} />
                Directions
              </Button>
              <Button
                variant="outline"
                size="compact"
                disabled={props.favoriteStatus === "saving"}
                onClick={() => {
                  if (props.selected) props.onToggleFavorite(props.selected.code);
                }}
              >
                <Icon name={props.favorites.has(props.selected.code) ? "bookmarkFill" : "bookmark"} size={15} />
                {props.authenticated
                  ? props.favorites.has(props.selected.code)
                    ? "Saved"
                    : "Save"
                  : "Sign in to save"}
              </Button>
              <Button variant="outline" size="compact" onClick={props.onShare}>
                <Icon name="share" size={15} />
                Share
              </Button>
              <Button variant="outline" size="compact" onClick={props.onOpenGoogleMaps}>
                <Icon name="externalLink" size={15} />
                Google Maps
              </Button>
            </div>
            {props.favoriteStatus === "error" && props.authenticated ? (
              <p className="text-error mt-2 text-xs" role="alert">
                Couldn't update saved buildings. Try the Save action again.
              </p>
            ) : null}
            {props.shareStatus !== "idle" ? (
              <p
                className={props.shareStatus === "error" ? "text-error mt-2 text-xs" : "text-muted mt-2 text-xs"}
                role="status"
              >
                {props.shareStatus === "shared"
                  ? "Shared"
                  : props.shareStatus === "copied"
                    ? "Link copied"
                    : props.shareStatus === "copy"
                      ? "Share dismissed. You can copy the link instead."
                      : "Couldn't copy the link"}
              </p>
            ) : null}
            {props.shareStatus === "copy" || props.shareStatus === "error" ? (
              <Button variant="ghost" size="compact" className="mt-2" onClick={props.onCopyLink}>
                <Icon name="share" size={15} />
                {props.shareStatus === "error" ? "Retry copy" : "Copy link"}
              </Button>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto px-3 py-4">
            {props.details.status === "loading" ? <LoadingStatus>Loading building details…</LoadingStatus> : null}
            {props.details.status === "error" ? (
              <RetryAlert onRetry={props.onRetryDetails}>Couldn't load building details.</RetryAlert>
            ) : null}
            {props.details.status === "ready" ? (
              <>
                <BuildingDetailContent details={props.details.data} />
                {Object.values(props.details.data.sourceStatus).some((source) => source.state === "unavailable") ? (
                  <Button variant="ghost" size="compact" className="mt-3" onClick={props.onRetryDetails}>
                    <Icon name="refresh2" size={15} />
                    Retry unavailable sections
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col">
          {props.mode === "directions" && props.selected ? (
            <div className="border-border-subtle shrink-0 border-b px-3 py-3">
              <Button variant="ghost" size="compact" onClick={props.onBack}>
                <Icon name="left" size={15} />
                {props.selected.name}
              </Button>
              <p className="text-on-surface mt-2 text-sm font-medium">Choose a starting building</p>
              <p className="text-muted mt-1 text-xs">Destination: {props.selected.name}</p>
            </div>
          ) : null}
          <div className="shrink-0 px-3 py-3">
            <SearchInput
              density="rail"
              value={searchQuery}
              onChange={(event) => {
                setActiveIndex(0);
                if (props.mode === "directions") props.onOriginQueryChange(event.target.value);
                else props.onQueryChange(event.target.value);
              }}
              onClear={() => {
                if (props.mode === "directions") props.onOriginQueryChange("");
                else props.onQueryChange("");
              }}
              onKeyDown={onSearchKeyDown}
              placeholder={props.mode === "directions" ? "Starting building" : "Search buildings"}
              role="combobox"
              aria-label={props.mode === "directions" ? "Starting building" : "Search buildings"}
              aria-autocomplete="list"
              aria-controls={listboxId}
              aria-expanded={Boolean(searchQuery && results.length > 0)}
              aria-activedescendant={
                searchQuery && results[activeIndex] ? `building-result-${results[activeIndex].code}` : undefined
              }
            />
          </div>
          <div ref={listRef} className="min-h-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto px-2 pb-3">
            {props.selectionError ? (
              <p
                role="alert"
                className="bg-error-container text-on-error-container mx-1 mb-3 rounded-lg px-3 py-2 text-xs"
              >
                {props.selectionError}
              </p>
            ) : null}
            {props.mode === "directions" && props.route.status !== "idle" ? (
              <div className="px-1 pb-3">
                {props.route.status === "loading" ? <LoadingStatus>Finding a walking route…</LoadingStatus> : null}
                {props.route.status === "error" ? (
                  <RetryAlert onRetry={props.onRetryRoute}>Couldn't calculate this route.</RetryAlert>
                ) : null}
                {props.route.status === "network" || props.route.status === "estimate" ? (
                  <div className="bg-surface-container-low rounded-lg p-3">
                    <p className="text-on-surface text-sm font-medium">
                      {formatMinutes(props.route.route.minutes)} · {formatMeters(props.route.route.meters)}
                    </p>
                    <p className="text-muted mt-1 text-xs">
                      {props.route.status === "estimate"
                        ? "Straight-line estimate; no walking path is drawn."
                        : "Campus walking network"}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
            {searchQuery ? (
              <>
                <div
                  id={listboxId}
                  role="listbox"
                  aria-label="Building search results"
                  className={results.length > 0 ? "flex flex-col gap-1" : "hidden"}
                >
                  {results.map((building, index) => (
                    <BuildingRow
                      key={building.code}
                      id={`building-result-${building.code}`}
                      building={building}
                      saved={props.favorites.has(building.code)}
                      selected={index === activeIndex}
                      onSelect={() => selectResult(building)}
                    />
                  ))}
                </div>
                {results.length === 0 ? (
                  <div className="px-3 py-8 text-center">
                    <p className="text-on-surface text-sm font-medium">No buildings found</p>
                    <p className="text-muted mt-1 text-xs">Try a building code, name, or address.</p>
                    <Button variant="ghost" size="compact" className="mt-3" onClick={() => props.onQueryChange("")}>
                      Clear search
                    </Button>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="flex flex-col gap-4">
                <div id={listboxId} role="listbox" aria-label="Building search results" className="hidden" />
                {props.favoriteStatus === "loading" ? <LoadingStatus>Loading saved buildings…</LoadingStatus> : null}
                {props.favoriteStatus === "error" && props.authenticated ? (
                  <p role="alert" className="text-error px-2 text-xs">
                    Saved buildings are unavailable. Search and curated places still work.
                  </p>
                ) : null}
                <BuildingList label="Saved" buildings={saved} favorites={props.favorites} onSelect={selectResult} />
                <BuildingList
                  label="Curated popular buildings"
                  buildings={props.popular}
                  favorites={props.favorites}
                  onSelect={selectResult}
                />
                <p className="text-muted px-2 text-xs">Curated starting points, not a measure of foot traffic.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </WorkspacePanel>
  );
}
