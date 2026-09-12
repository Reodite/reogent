"use client";

// Shows building details with room and service carousels. Linked cards resolve
// preview images through `/api/preview`; other cards use stored photos and
// preserve the image slot on load failure.
import { Icon } from "@/src/components/icons";
import { useApi } from "@/src/components/providers";
import { Button } from "@/src/components/ui/button";
import { RetryState } from "@/src/components/ui/feedback";
import { Heading } from "@/src/components/ui/heading";
import { Skeleton, SkeletonGroup, SkeletonText } from "@/src/components/ui/skeleton";
import type { BuildingDetails, BuildingSummary } from "@/src/lib/api-types";
import { useEffect, useRef, useState } from "react";

export type SelectedBuilding = Pick<BuildingSummary, "code" | "name" | "usage" | "floors" | "address" | "centroid">;

function Carousel({ label, children }: { label: string; children: React.ReactNode[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const scrollBy = (dir: -1 | 1) =>
    scroller.current?.scrollBy({ left: dir * scroller.current.clientWidth, behavior: "smooth" });
  return (
    <section className="flex items-center gap-1" aria-roledescription="carousel" aria-label={label}>
      <button
        type="button"
        aria-label={`Previous ${label}`}
        onClick={() => scrollBy(-1)}
        className="focus-visible:ring-primary/40 bg-surface-container text-on-surface-variant hover:text-primary flex size-8 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1"
      >
        <Icon name="left" size={14} />
      </button>
      <div
        ref={scroller}
        className="flex min-w-0 flex-1 snap-x snap-mandatory [scrollbar-width:none] gap-2 overflow-x-auto [overscroll-behavior-x:contain] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      <button
        type="button"
        aria-label={`Next ${label}`}
        onClick={() => scrollBy(1)}
        className="focus-visible:ring-primary/40 bg-surface-container text-on-surface-variant hover:text-primary flex size-8 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1"
      >
        <Icon name="right" size={14} />
      </button>
    </section>
  );
}

const preview = (href: string) => `/api/preview?url=${encodeURIComponent(href)}`;

function DetailCard({
  src,
  href,
  title,
  sub,
  meta,
}: {
  /** Image URL, already chosen by the caller (direct photo or preview proxy). */
  src?: string | null;
  href?: string | null;
  title: string;
  sub?: string | null;
  meta?: string | null;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const body = (
    <>
      <div className="bg-surface-container relative h-32 shrink-0 overflow-hidden">
        <span
          className="text-on-surface-variant absolute inset-0 flex items-center justify-center opacity-35"
          aria-hidden="true"
        >
          <Icon name="camera" size={24} />
        </span>
        {src && !failed && (
          // biome-ignore lint/performance/noImgElement: images come from arbitrary external hosts — next/image would need a remotePattern per host
          <img
            src={src}
            alt=""
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            className={`bg-surface-bright relative h-full w-full object-contain transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
          />
        )}
      </div>
      <div className="flex flex-col gap-1 px-2.5 py-2">
        <span className="text-on-surface flex items-center gap-1.5 text-sm font-medium">
          <span className="truncate">{title}</span>
        </span>
        {sub && <span className="text-on-surface-variant text-xs">{sub}</span>}
        {meta && <span className="text-muted truncate text-xs">{meta}</span>}
      </div>
    </>
  );
  const cardClass =
    "flex w-full shrink-0 snap-start snap-always flex-col overflow-hidden rounded-lg bg-surface-container-low";
  return href ? (
    <a className={cardClass} href={href} target="_blank" rel="noreferrer">
      {body}
    </a>
  ) : (
    <div className={cardClass}>{body}</div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="ui-content-enter border-border-subtle border-t pt-3 first:border-t-0 first:pt-0">
      <Heading as="h3" size="subsection" className="mb-2">
        {title}
      </Heading>
      {children}
    </section>
  );
}

export function BuildingPopup({ building, onClose }: { building: SelectedBuilding; onClose: () => void }) {
  const api = useApi();
  const [details, setDetails] = useState<BuildingDetails | null>(null);
  const [failed, setFailed] = useState(false);
  const [fetchNonce, setFetchNonce] = useState(0);
  const popupRef = useRef<HTMLElement>(null);

  useEffect(() => {
    void fetchNonce;
    const controller = new AbortController();
    setDetails(null);
    setFailed(false);
    api
      .getBuildingDetails(building.code, controller.signal)
      .then((d) => {
        if (!controller.signal.aborted) setDetails(d);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => {
      controller.abort();
    };
  }, [api, building.code, fetchNonce]);

  // Moves focus to Close and lets Escape dismiss the non-modal inspector.
  useEffect(() => {
    const el = popupRef.current;
    if (!el) return;
    const closeBtn = el.querySelector<HTMLElement>('[aria-label="Close building details"]');
    closeBtn?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    el.addEventListener("keydown", onKeyDown);
    return () => el.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <aside
      ref={popupRef}
      role="dialog"
      aria-modal="false"
      aria-label={`${building.name} details`}
      className="ui-popover-enter neu-panel absolute top-3 bottom-6 left-3 z-20 flex w-80 max-w-[calc(100%-5rem)] flex-col overflow-hidden rounded-2xl"
    >
      <div className="border-border-subtle flex items-start gap-2.5 border-b px-3.5 py-3">
        <span className="bg-secondary-container text-on-secondary-container mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md">
          <Icon name="building1" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <Heading as="h2" size="section" className="truncate">
            {building.name}
          </Heading>
          <p className="text-on-surface-variant mt-1 truncate font-mono text-xs">
            {[building.code, building.usage].filter(Boolean).join(" · ")}
          </p>
          {(building.floors || building.address) && (
            <p className="text-muted mt-1 truncate text-xs">
              {[building.floors && `${building.floors} floors`, building.address].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <Button onClick={onClose} aria-label="Close building details" variant="ghost" size="icon">
          <Icon name="close" size={16} />
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto [overscroll-behavior-y:contain] px-3.5 py-3">
        {!details && !failed && (
          <SkeletonGroup
            label="Loading building details"
            className="border-border-subtle border-t pt-3 first:border-t-0 first:pt-0"
          >
            <Skeleton className="mb-2 h-5 w-28" />
            <div className="flex items-center gap-1">
              <Skeleton className="size-11 rounded-full" />
              <div className="bg-surface-container-low min-w-0 flex-1 overflow-hidden rounded-lg">
                <Skeleton className="h-32 w-full rounded-none" />
                <div className="px-2.5 py-2">
                  <SkeletonText lines={3} />
                </div>
              </div>
              <Skeleton className="size-11 rounded-full" />
            </div>
          </SkeletonGroup>
        )}
        {failed ? (
          <RetryState
            className="ui-notice-enter"
            message="Couldn't load details for this building."
            onRetry={() => setFetchNonce((nonce) => nonce + 1)}
            retryLabel="Retry"
            align="start"
            compact
          />
        ) : null}
        {details && (
          <>
            {details.rooms.length > 0 && (
              <Section title={`Rooms (${details.rooms.length})`}>
                <Carousel label="rooms">
                  {details.rooms.map((room) => (
                    <DetailCard
                      key={room.name}
                      // room pages carry fresh photos; the stored thumbnail is a stale signed URL
                      src={room.link ? preview(room.link) : room.photo}
                      href={room.link}
                      title={room.name}
                      sub={`${room.capacity ?? "?"} seats · floor ${room.floor ?? "?"}`}
                      meta={[room.layout, room.furniture].filter(Boolean).join(" · ")}
                    />
                  ))}
                </Carousel>
              </Section>
            )}
            {details.pois.length > 0 && (
              <Section title={`Food & services (${details.pois.length})`}>
                <Carousel label="services">
                  {details.pois.map((poi) => (
                    <DetailCard
                      key={poi.name}
                      src={poi.url ? preview(poi.url) : poi.photo}
                      href={poi.url}
                      title={poi.name}
                      sub={poi.service_type?.replace(/_/g, " ")}
                      meta={poi.hours || poi.contact}
                    />
                  ))}
                </Carousel>
              </Section>
            )}
            {details.rooms.length === 0 && details.pois.length === 0 && (
              <p className="ui-content-enter text-on-surface-variant text-sm">
                No room or service listings for this building.
              </p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
