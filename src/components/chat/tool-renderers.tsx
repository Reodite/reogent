"use client";

// Tool-call rendering: internal tool calls show a compact badge only; the
// dedicated show_widget tool renders a rich data widget as the answer.
import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { GradeDistributionChart } from "@/src/components/course-lookup/grade-distribution-chart";
import { Icon } from "@/src/components/icons";
import { Button } from "@/src/components/ui/button";
import { Disclosure } from "@/src/components/ui/disclosure";
import { ErrorBoundary } from "@/src/components/ui/error-boundary";
import { Heading } from "@/src/components/ui/heading";
import { InfoChip } from "@/src/components/ui/info-chip";
import {
  ToolResultCard,
  ToolResultFailure,
  ToolResultList,
  toolResultRowClasses,
  ToolResultRowContent,
} from "@/src/components/ui/tool-result-card";
import {
  isToolError,
  type BuildingDetails,
  type CourseDoc,
  type SearchCoursesResult,
  type ToolCall,
  type TuitionResult,
} from "@/src/lib/api-types";
import { describeToolCall, formatCad, formatMeters, formatMinutes } from "@/src/lib/format";
import { toolCallToCanvasView } from "@/src/lib/walking";
import { motion, useReducedMotion } from "motion/react";
import { useId, useMemo, useState } from "react";

interface ToolCallRendererProps {
  call: ToolCall;
}

type ToolCallRenderer = React.ComponentType<ToolCallRendererProps>;

const MotionButton = motion.create(Button);

function ToolBadge({
  call,
  mapped = false,
  active = false,
  reduce = false,
  onToggle,
}: {
  call: ToolCall;
  mapped?: boolean;
  active?: boolean;
  /** `useReducedMotion` returns null while the preference is unknown; treated as false. */
  reduce?: boolean | null;
  onToggle?: () => void;
}) {
  const failed = isToolError(call.result);
  const loading = call.result === undefined;
  const description = describeToolCall(call.name, call.input);
  const label = failed ? description.replace(/^Searched( for)? /, "Failed to find ") : description;
  const animation = {
    initial: reduce ? false : { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0 },
    transition: reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 500, damping: 30 },
  } as const;
  const content = (
    <>
      <Icon name={failed ? "alert" : "search"} size={14} className={`shrink-0 ${loading ? "animate-pulse" : ""}`} />
      <span className="truncate leading-4">{label}</span>
      {failed && <span className="sr-only">(failed)</span>}
    </>
  );

  if (mapped) {
    return (
      <MotionButton
        {...animation}
        variant="outline"
        size="pill"
        aria-pressed={active}
        data-widget={call.name}
        data-active={active || undefined}
        onClick={onToggle}
        className={`max-w-full overflow-hidden font-mono ${active ? "bg-accent-subtle ring-primary ring-2" : ""}`}
      >
        {content}
      </MotionButton>
    );
  }

  return (
    <motion.span
      {...animation}
      data-widget={call.name}
      className={`inline-flex w-fit max-w-full items-center gap-1.5 overflow-hidden rounded-full border px-2.5 py-1 font-mono text-xs ${
        failed ? "border-error/20 bg-error/10 text-error" : "border-primary/20 bg-primary/10 text-primary"
      }`}
    >
      {content}
    </motion.span>
  );
}

// ---- Widget renderers ----

function isCourseDoc(value: unknown): value is CourseDoc {
  return (
    typeof value === "object" && value !== null && typeof (value as CourseDoc).code === "string" && "sections" in value
  );
}

function sectionLine(course: CourseDoc): string | null {
  if (!Array.isArray(course.sections)) return null;
  const s = course.sections[0];
  if (!s) return null;
  const days = Array.isArray(s.days) ? s.days.map((d) => d.toUpperCase()).join("·") : "";
  const time = s.start_time && s.end_time ? `${s.start_time}–${s.end_time}` : null;
  return [s.term, days, time].filter(Boolean).join("  ");
}

function CourseCard({ course, detailed = false }: { course: CourseDoc; detailed?: boolean }) {
  const { setActiveChannel } = useChatShell();
  const times = sectionLine(course);
  return (
    <article className="bg-surface-container-low rounded-lg p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-body-sm text-primary font-mono font-medium">{course.code.replace("_V", "")}</span>
        {course.credits !== null ? <InfoChip className="shrink-0">{course.credits} cr</InfoChip> : null}
      </div>
      <Heading as="h4" size="subsection" className="mt-1 line-clamp-2">
        {course.title}
      </Heading>
      {detailed && course.description && (
        <p className="text-body-sm text-on-surface-variant mt-1 line-clamp-3 leading-relaxed">{course.description}</p>
      )}
      {times && <p className="text-on-surface-variant mt-1 font-mono text-xs">{times}</p>}
      <p className="text-muted mt-1 line-clamp-2 text-xs">
        {course.prerequisite ? `Prereq: ${course.prerequisite}` : "No prerequisites"}
        {detailed && course.corequisite ? ` · Coreq: ${course.corequisite}` : ""}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          data-action="open-course-details"
          data-code={course.code}
          variant="outline"
          size="pill"
          onClick={(event) => {
            event.stopPropagation();
            setActiveChannel("course-lookup", { code: course.code });
          }}
        >
          <Icon name="book2" size={12} /> Course details
        </Button>
        {course.prerequisite ? (
          <Button
            data-action="open-prereq-tree"
            data-code={course.code}
            variant="outline"
            size="pill"
            onClick={(event) => {
              event.stopPropagation();
              setActiveChannel("prereq-tree", { root: course.code, query: course.code, selections: {} });
            }}
          >
            <Icon name="tree" size={12} /> Prereq Tree
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function isTuitionResult(value: unknown): value is TuitionResult {
  return typeof value === "object" && value !== null && typeof (value as TuitionResult).amount_cad === "number";
}

// Minimal shapes for the widget renderers below. Each mirrors the fields the
// matching tool returns; only what the card displays is typed.
interface StudySpace {
  id: string;
  title: string;
  name: string | null;
  building_code: string | null;
  building_name: string | null;
  space_type: string | null;
  capacity: number | null;
}
interface FreeRoom {
  room: string;
  location: string | null;
  capacity: number | null;
  minutes: number | null;
  start: string;
}
interface GradeSummaryShape {
  avg: number;
  sample_sections: number;
}
interface GradeDistributionShape {
  buckets: Record<string, number>;
  total_enrolled: number;
}
interface ParkingLot {
  id: string;
  name: string;
  rate: string | null;
  ev_charging?: boolean;
}
interface ProgramDoc {
  id: number;
  name: string;
  url: string;
  degrees: string[];
}
interface KeyDate {
  name: string;
  date_text: string | null;
  start: string | null;
}

/** Parses a `yyyy-MM-dd HH:mm:ss` event timestamp as local time, or null. */
function parseDateOnly(value: string): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0"] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Formats a time range like "10:00 AM – 4:00 PM", or a single time. */
function formatEventTime(start: string | null | undefined, end: string | null | undefined): string {
  const startDate = start ? parseDateOnly(start) : null;
  const endDate = end ? parseDateOnly(end) : null;
  if (!startDate) return "Time TBA";
  const time = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return endDate ? `${time(startDate)} – ${time(endDate)}` : time(startDate);
}

/** The show_widget tool returns { type, result } where `result` mirrors the
 *  internal tool it delegated to. Each case renders the matching widget. */
function ShowWidgetRenderer({ call }: ToolCallRendererProps) {
  const { setActiveChannel } = useChatShell();
  const [coursesExpanded, setCoursesExpanded] = useState(false);
  const coursesId = useId();
  const outer = call.result as { type?: string; result?: unknown } | undefined;
  const data = outer?.result;

  switch (outer?.type) {
    case "courses": {
      const courses = Array.isArray((data as Partial<SearchCoursesResult>)?.courses)
        ? (data as SearchCoursesResult).courses.filter(isCourseDoc)
        : [];
      if (courses.length === 0) return null;
      const rows = courses.map((course) => (
        <button
          key={`${course.code}-${course.title}`}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setActiveChannel("course-lookup", { code: course.code });
          }}
          className={toolResultRowClasses(true)}
        >
          <ToolResultRowContent
            title={
              <span className="flex items-center gap-2">
                <span className="text-primary font-mono text-xs">{course.code.replace("_V", "")}</span>
                {course.credits !== null ? <InfoChip>{course.credits} cr</InfoChip> : null}
              </span>
            }
            description={course.title}
            trailing={<Icon name="right" size={16} className="text-muted shrink-0" />}
          />
        </button>
      ));
      return (
        <ToolResultList
          footer={
            courses.length > 4 ? (
              <Button
                variant="ghost"
                size="field"
                onClick={() => setCoursesExpanded((expanded) => !expanded)}
                aria-expanded={coursesExpanded}
                aria-controls={coursesId}
                className="w-full"
              >
                <Icon name={coursesExpanded ? "down" : "add"} size={14} />
                {coursesExpanded ? "Show fewer" : `Show all (${courses.length})`}
              </Button>
            ) : null
          }
        >
          {rows.slice(0, 4)}
          <Disclosure open={coursesExpanded} id={coursesId}>
            {rows.slice(4)}
          </Disclosure>
        </ToolResultList>
      );
    }
    case "course":
    case "course_detail": {
      if (!isCourseDoc(data)) return null;
      return <CourseCard course={data} detailed />;
    }
    case "tuition": {
      if (!isTuitionResult(data)) return null;
      const label = data.per_credit_cad != null ? "per credit" : data.unit || "flat";
      const amount = data.per_credit_cad ?? data.amount_cad ?? 0;
      const asOf = (data as Partial<{ rates_as_of: string }>).rates_as_of;
      return (
        <ToolResultCard
          icon="currencyDollar"
          title={
            <>
              <span className="font-mono tabular-nums">{formatCad(amount)}</span>{" "}
              <span className="text-body-sm text-on-surface-variant font-normal">{label}</span>
            </>
          }
          metadata={
            <>
              {data.program || "—"} · {data.student_type || "—"} · {data.cohort_year || "—"} cohort
              {asOf ? ` · snapshot ${asOf.slice(0, 10)}` : ""}
            </>
          }
        />
      );
    }
    case "route": {
      const r = data as
        { from?: string; to?: string; meters?: number; minutes?: number; method?: "network" | "estimate" } | undefined;
      if (typeof r?.meters !== "number" || !r.from || !r.to) return null;
      return (
        <ToolResultCard
          icon="walk"
          title={<span className="font-mono tabular-nums">{formatMinutes(r.minutes)}</span>}
          metadata={
            <>
              {r.method === "estimate" ? "Straight-line estimate · " : ""}
              <span className="font-mono">
                {formatMeters(r.meters)} · {r.from} → {r.to}
              </span>
            </>
          }
        />
      );
    }
    case "building": {
      const b = data as { code?: string; name?: string; lat?: number; lon?: number } | undefined;
      if (!b?.code) return null;
      return (
        <ToolResultCard icon="map" title={b.name ?? b.code} metadata={<span className="font-mono">{b.code}</span>} />
      );
    }
    case "building_detail": {
      const result = data as
        | {
            building?: { code?: string; name?: string; address?: string | null };
            room_count?: number;
            bookable_room_count?: number;
            pois?: unknown[];
            entrances?: unknown[];
            sourceStatus?: Partial<BuildingDetails["sourceStatus"]>;
          }
        | undefined;
      if (!result?.building?.code) return null;
      const counts = [
        result.sourceStatus?.rooms?.state === "unavailable"
          ? "Rooms unavailable"
          : typeof result.room_count === "number"
            ? `${result.room_count} rooms`
            : null,
        typeof result.bookable_room_count === "number" ? `${result.bookable_room_count} bookable` : null,
        result.sourceStatus?.pois?.state === "unavailable"
          ? "Services unavailable"
          : Array.isArray(result.pois)
            ? `${result.pois.length} services`
            : null,
        result.sourceStatus?.entrances?.state === "unavailable"
          ? "Entrances unavailable"
          : Array.isArray(result.entrances)
            ? `${result.entrances.length} entrances`
            : null,
      ].filter(Boolean);
      return (
        <ToolResultCard
          icon="building1"
          title={result.building.name ?? result.building.code}
          metadata={
            <>
              <span className="font-mono">{result.building.code}</span>
              {result.building.address ? ` · ${result.building.address}` : ""}
            </>
          }
          detail={counts.length > 0 ? counts.join(" · ") : null}
        />
      );
    }
    case "building_entrances": {
      const result = data as
        | {
            building?: { code?: string; name?: string };
            entrances?: unknown[];
            sourceStatus?: Partial<BuildingDetails["sourceStatus"]>;
          }
        | undefined;
      if (!result?.building?.code || !Array.isArray(result.entrances)) return null;
      return (
        <ToolResultCard
          icon="door"
          title={result.building.name ?? result.building.code}
          metadata={
            result.sourceStatus?.entrances?.state === "unavailable"
              ? "Entrances unavailable"
              : `${result.entrances.length} verified entrance${result.entrances.length === 1 ? "" : "s"}`
          }
          detail="Accessibility details unavailable in source metadata"
        />
      );
    }
    case "building_spaces": {
      const result = data as
        | {
            building?: { code?: string; name?: string };
            rooms?: unknown[];
            room_count?: number;
            rooms_truncated?: boolean;
            sourceStatus?: Partial<BuildingDetails["sourceStatus"]>;
            bookable_room_count?: number;
            availability?: { rooms?: unknown[]; as_of?: string | null; freshness?: string } | null;
          }
        | undefined;
      if (!result?.building?.code || !Array.isArray(result.rooms)) return null;
      const roomCount = typeof result.room_count === "number" ? result.room_count : result.rooms.length;
      const bookable =
        typeof result.bookable_room_count === "number"
          ? result.bookable_room_count
          : Array.isArray(result.availability?.rooms)
            ? result.availability.rooms.length
            : null;
      return (
        <ToolResultCard
          icon="school"
          title={result.building.name ?? result.building.code}
          metadata={[
            result.sourceStatus?.rooms?.state === "unavailable"
              ? "Learning spaces unavailable"
              : `${roomCount} learning space${roomCount === 1 ? "" : "s"}`,
            bookable !== null ? `${bookable} bookable room${bookable === 1 ? "" : "s"}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          detail={
            result.availability?.as_of
              ? `${result.availability.freshness === "historical" ? "Historical snapshot" : "Snapshot"} · ${result.availability.as_of.slice(0, 10)}`
              : null
          }
        />
      );
    }
    case "places": {
      const p = data as
        | {
            near_building?: string;
            places?: { name?: string; lat?: number; lon?: number; service_type?: string | null }[];
          }
        | undefined;
      if (!Array.isArray(p?.places) || p.places.length === 0) return null;
      const preview = p.places
        .slice(0, 3)
        .map((pl) => pl.name)
        .filter(Boolean)
        .join(", ");
      return (
        <ToolResultCard
          icon="location"
          title={`${p.places.length} place${p.places.length === 1 ? "" : "s"}${p.near_building ? ` near ${p.near_building}` : ""}`}
          metadata={`${preview}${p.places.length > 3 ? "…" : ""}`}
        />
      );
    }
    case "event": {
      const events = (data as { events?: unknown[] } | undefined)?.events;
      if (!Array.isArray(events) || events.length === 0) return null;
      const e = events[0] as {
        title?: string;
        text?: string;
        start_date?: string | null;
        end_date?: string | null;
        all_day?: boolean;
        venue?: string | null;
        venue_address?: string | null;
        categories?: string[];
      };
      if (!e.title) return null;
      const startDate = e.start_date ? parseDateOnly(e.start_date) : null;
      const month = startDate ? startDate.toLocaleString("en-US", { month: "short" }) : "";
      const day = startDate ? startDate.getDate() : "";
      const timeLabel = e.all_day ? "All day" : formatEventTime(e.start_date, e.end_date);
      const venue = [e.venue, e.venue_address].filter(Boolean).join(", ");
      return (
        <div className="bg-surface-container-low flex max-w-sm flex-col gap-3 rounded-lg p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Heading as="h3" size="subsection">
                {e.title}
              </Heading>
              {e.text && <p className="text-muted mt-1 line-clamp-2 text-xs">{e.text}</p>}
            </div>
            {startDate && (
              <div className="bg-surface-container flex size-11 shrink-0 flex-col items-center justify-center rounded-md">
                <span className="text-on-surface-variant text-xs font-medium tracking-wider uppercase">{month}</span>
                <span className="text-on-surface font-mono text-sm leading-none font-medium">{day}</span>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="text-body-sm text-on-surface-variant flex items-center gap-1.5">
              <Icon name="calendar" size={16} className="text-muted shrink-0" />
              <span>{timeLabel}</span>
            </div>
            {venue && (
              <div className="text-body-sm text-on-surface-variant flex items-center gap-1.5">
                <Icon name="location" size={16} className="text-muted shrink-0" />
                <span className="truncate">{venue}</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="field"
              wrap
              onClick={(event) => {
                event.stopPropagation();
                setActiveChannel("calendar", {
                  cursor: startDate
                    ? `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}`
                    : new Date().toISOString().slice(0, 7),
                  kinds: ["academic", "holiday"],
                });
              }}
              className="h-auto min-h-11 max-w-full min-w-0 flex-1 py-2"
            >
              Add to Calendar
            </Button>
            <Button
              size="fieldIcon"
              onClick={(event) => {
                event.stopPropagation();
                setActiveChannel("map", {});
              }}
              aria-label="Show on map"
            >
              <Icon name="map" size={18} />
            </Button>
          </div>
        </div>
      );
    }
    case "study_spaces": {
      const bookable = (data as { kind?: string; rooms?: unknown[] } | undefined)?.rooms;
      if (Array.isArray(bookable) && bookable.length > 0) {
        const shown = bookable.slice(0, 5);
        return (
          <ToolResultList>
            {shown.map((result, index) => {
              const room = result as {
                room?: string;
                title?: string;
                location?: string;
                capacity?: number;
                eid?: number;
                building_code?: string;
              };
              return (
                <div key={room.eid ?? index} className={toolResultRowClasses()}>
                  <ToolResultRowContent
                    title={room.room ?? room.title}
                    description={room.location ?? "—"}
                    trailing={
                      room.capacity != null ? <InfoChip className="shrink-0">{room.capacity} seats</InfoChip> : null
                    }
                  />
                </div>
              );
            })}
          </ToolResultList>
        );
      }
      const spaces = (data as { spaces?: unknown[] } | undefined)?.spaces;
      if (!Array.isArray(spaces) || spaces.length === 0) return null;
      const shown = (spaces as StudySpace[]).slice(0, 5);
      return (
        <ToolResultList footer={spaces.length > shown.length ? `+${spaces.length - shown.length} more` : null}>
          {shown.map((space) => (
            <div key={space.id} className={toolResultRowClasses()}>
              <ToolResultRowContent
                title={space.name ?? space.title}
                description={[space.building_name ?? space.building_code, space.space_type].filter(Boolean).join(" · ")}
                trailing={
                  space.capacity != null ? <InfoChip className="shrink-0">{space.capacity} seats</InfoChip> : null
                }
              />
            </div>
          ))}
        </ToolResultList>
      );
    }
    case "free_rooms": {
      const rooms = (data as { rooms?: unknown[]; as_of?: string | null } | undefined)?.rooms;
      const asOf = (data as { as_of?: string | null } | undefined)?.as_of;
      if (!Array.isArray(rooms) || rooms.length === 0) return null;
      const shown = (rooms as FreeRoom[]).slice(0, 5);
      return (
        <ToolResultList footer={asOf ? `as of ${new Date(asOf).toLocaleString()}` : null}>
          {shown.map((room) => (
            <div key={`${room.room}-${room.start}`} className={toolResultRowClasses()}>
              <ToolResultRowContent
                title={room.room}
                description={room.location ?? "—"}
                metadata={
                  <>
                    {room.capacity != null ? <InfoChip>{room.capacity} seats</InfoChip> : null}
                    {typeof room.minutes === "number" ? <InfoChip>free {formatMinutes(room.minutes)}</InfoChip> : null}
                  </>
                }
              />
            </div>
          ))}
        </ToolResultList>
      );
    }
    case "grades": {
      const dist = (data as { grade_distribution?: GradeDistributionShape } | undefined)?.grade_distribution;
      const summary = (data as { grade_summary?: GradeSummaryShape } | undefined)?.grade_summary;
      if (!dist || !summary) return null;
      const session = (data as Partial<{ session: string }>).session;
      return (
        <div className="bg-surface-container-low flex flex-col gap-3 rounded-lg p-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-on-surface block text-sm font-medium">
              {(data as Partial<{ code: string }>).code ?? "Grade distribution"}
            </span>
            <span className="text-muted text-xs">
              {session ? `${session} · ` : "pooled · "}
              {summary.sample_sections} section{summary.sample_sections === 1 ? "" : "s"} · {summary.avg} avg
            </span>
          </div>
          <GradeDistributionChart buckets={dist.buckets} />
        </div>
      );
    }
    case "grade_distribution": {
      const buckets = (data as { buckets?: Record<string, number> } | undefined)?.buckets;
      const bd = (data as { bucket_distribution?: { buckets?: Record<string, number> } } | undefined)
        ?.bucket_distribution;
      const resolved = buckets ?? bd?.buckets;
      if (!resolved || Object.values(resolved).every((v) => v === 0)) return null;
      const highlight = (data as { highlight_bucket?: string } | undefined)?.highlight_bucket;
      const code = (data as Partial<{ code: string }>).code ?? "Grade distribution";
      const session = (data as Partial<{ session: string }>).session;
      return (
        <div className="bg-surface-container-low flex flex-col gap-3 rounded-lg p-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-on-surface block text-sm font-medium">{code}</span>
            {session && <span className="text-muted text-xs">{session}</span>}
          </div>
          <GradeDistributionChart buckets={resolved} highlightBucket={highlight} />
        </div>
      );
    }
    case "parking": {
      const lots = (data as { parking?: unknown[]; near_building?: string } | undefined)?.parking;
      const near = (data as { near_building?: string } | undefined)?.near_building;
      if (!Array.isArray(lots) || lots.length === 0) return null;
      const shown = (lots as ParkingLot[]).slice(0, 5);
      return (
        <ToolResultList header={near ? `near ${near}` : null}>
          {shown.map((lot) => (
            <div key={lot.id} className={toolResultRowClasses()}>
              <ToolResultRowContent
                title={lot.name}
                description={lot.rate}
                trailing={lot.ev_charging ? <InfoChip className="shrink-0">EV</InfoChip> : null}
              />
            </div>
          ))}
        </ToolResultList>
      );
    }
    case "program": {
      const programs = (data as { programs?: unknown[] } | undefined)?.programs;
      if (!Array.isArray(programs) || programs.length === 0) return null;
      const shown = (programs as ProgramDoc[]).slice(0, 5);
      return (
        <ToolResultList footer={programs.length > shown.length ? `+${programs.length - shown.length} more` : null}>
          {shown.map((program) => {
            const content = (
              <ToolResultRowContent
                key={program.id}
                title={program.name}
                description={Array.isArray(program.degrees) ? program.degrees.join(", ") : undefined}
              />
            );
            return program.url ? (
              <a
                key={program.id}
                href={program.url}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
                className={toolResultRowClasses(true)}
              >
                {content}
              </a>
            ) : (
              <div key={program.id} className={toolResultRowClasses()}>
                {content}
              </div>
            );
          })}
        </ToolResultList>
      );
    }
    case "key_dates": {
      const dates = (data as { dates?: unknown[] } | undefined)?.dates;
      if (!Array.isArray(dates) || dates.length === 0) return null;
      const shown = (dates as KeyDate[]).slice(0, 6);
      return (
        <ToolResultList footer={dates.length > shown.length ? `+${dates.length - shown.length} more` : null}>
          {shown.map((date, index) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static append-only list
              key={`${date.name}-${index}`}
              className={toolResultRowClasses()}
            >
              <ToolResultRowContent
                title={date.name}
                metadata={<span className="font-mono">{date.date_text ?? date.start ?? "—"}</span>}
              />
            </div>
          ))}
        </ToolResultList>
      );
    }
    default:
      return null;
  }
}

export const renderers: Record<string, ToolCallRenderer> = {
  show_widget: ShowWidgetRenderer,
};

function richWidgetOwnsActivation(call: ToolCall): boolean {
  if (call.name !== "show_widget") return false;
  const type = (call.result as { type?: string } | undefined)?.type;
  return type === "courses" || type === "course" || type === "course_detail";
}

/**
 * Renders one tool call. Simple mapped widgets own one canvas action; compound
 * widgets leave interaction to their explicit child controls.
 */
export function ResponseWidget({ call, callKey }: { call: ToolCall; callKey?: string }) {
  const reduce = useReducedMotion();
  const { activeCallKey, activateCanvasView, setUserDismissedPane, setRightPaneCollapsed, setAnswerSheetOpen } =
    useChatShell();
  const view = useMemo(() => toolCallToCanvasView(call), [call]);
  const mapped = view !== null;
  const interactive = mapped && !richWidgetOwnsActivation(call);
  const active = mapped && callKey !== undefined && activeCallKey === callKey;
  const Renderer = renderers[call.name];
  const widget = Renderer !== undefined;
  const loaded = !isToolError(call.result) && call.result !== undefined;

  const toggle = () => {
    setUserDismissedPane(false);
    setAnswerSheetOpen(true);
    setRightPaneCollapsed(false);
    activateCanvasView(call, callKey);
  };

  if (!widget) return <ToolBadge call={call} mapped={mapped} active={active} reduce={reduce} onToggle={toggle} />;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 30 }}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? active : undefined}
      data-widget={call.name}
      data-active={active || undefined}
      onClick={interactive ? toggle : undefined}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggle();
              }
            }
          : undefined
      }
      className={
        interactive
          ? `hover:bg-surface-container-high focus-visible:ring-primary/40 min-h-11 rounded-lg transition-[background-color,box-shadow] duration-150 outline-none focus-visible:ring-2 ${
              active ? "bg-accent-subtle ring-primary ring-2" : "hover:ring-primary/40 hover:ring-1"
            }`
          : active
            ? "bg-accent-subtle ring-primary rounded-lg ring-2"
            : "rounded-lg"
      }
    >
      {loaded ? (
        <div className="ui-content-enter">
          <ErrorBoundary fallback={<ToolResultFailure name={call.name} result={call.result} />}>
            <Renderer call={call} />
          </ErrorBoundary>
        </div>
      ) : null}
    </motion.div>
  );
}
