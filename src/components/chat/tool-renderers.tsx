"use client";

// Tool-call rendering: internal tool calls show a compact badge only; the
// dedicated show_widget tool renders a rich data widget as the answer.
import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { GradeDistributionChart } from "@/src/components/course-lookup/grade-distribution-chart";
import { Icon } from "@/src/components/icons";
import type { CanvasView } from "@/src/components/shell/pane-registry";
import { ErrorBoundary } from "@/src/components/ui/error-boundary";
import { ToolResultCard } from "@/src/components/ui/tool-result-card";
import {
  isToolError,
  type CourseDoc,
  type SearchCoursesResult,
  type ToolCall,
  type TuitionResult,
} from "@/src/lib/api-types";
import { describeToolCall, formatCad, formatMeters, formatMinutes } from "@/src/lib/format";
import { toolCallToCanvasView } from "@/src/lib/walking";
import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";

interface ToolCallRendererProps {
  call: ToolCall;
}

type ToolCallRenderer = React.ComponentType<ToolCallRendererProps>;

// ---- Badges (internal tool calls) ----

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
  reduce?: boolean;
  onToggle?: () => void;
}) {
  const failed = isToolError(call.result);
  const loading = call.result === undefined;
  const description = describeToolCall(call.name, call.input);
  const label = failed ? description.replace(/^Searched( for)? /, "Failed to find ") : description;
  return (
    <motion.span
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 30 }}
      role={mapped ? "button" : undefined}
      tabIndex={mapped ? 0 : undefined}
      aria-pressed={mapped ? active : undefined}
      data-widget={call.name}
      data-active={active || undefined}
      onClick={mapped ? onToggle : undefined}
      onKeyDown={
        mapped
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggle?.();
              }
            }
          : undefined
      }
      className={`inline-flex w-fit max-w-full items-center gap-1.5 overflow-hidden rounded-full border px-2.5 py-1 font-mono text-xs ${
        failed ? "border-error/20 bg-error/10 text-error" : "border-primary/20 bg-primary/10 text-primary"
      } ${mapped ? "hover:bg-primary/15 focus-visible:ring-primary/40 cursor-pointer transition-colors duration-150 outline-none focus-visible:ring-2" : ""} ${
        mapped && active ? "bg-primary/15 ring-primary ring-2" : ""
      }`}
    >
      <Icon name={failed ? "alert" : "search"} size={14} className={`shrink-0 ${loading ? "animate-pulse" : ""}`} />
      <span className="truncate leading-none">{label}</span>
      {failed && <span className="sr-only">(failed)</span>}
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
  const { setWorkspaceView, setUserDismissedPane, setAnswerSheetOpen, setRightPaneCollapsed } = useChatShell();
  const times = sectionLine(course);
  return (
    <article className="bg-surface-container-low rounded-lg p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-body-sm text-primary font-mono font-medium">{course.code.replace("_V", "")}</span>
        {course.credits !== null && (
          <span className="bg-surface-container text-on-surface-variant shrink-0 rounded-full px-2 py-0.5 text-xs">
            {course.credits} cr
          </span>
        )}
      </div>
      <h4 className="text-on-surface mt-0.5 line-clamp-2 text-sm font-medium">{course.title}</h4>
      {detailed && course.description && (
        <p className="text-body-sm text-on-surface-variant mt-1.5 line-clamp-3 leading-relaxed">{course.description}</p>
      )}
      {times && <p className="text-on-surface-variant mt-1.5 font-mono text-xs">{times}</p>}
      <p className="text-muted mt-1 line-clamp-2 text-xs">
        {course.prerequisite ? `Prereq: ${course.prerequisite}` : "No prerequisites"}
        {detailed && course.corequisite ? ` · Coreq: ${course.corequisite}` : ""}
      </p>
      {course.prerequisite && (
        <button
          data-action="open-prereq-tree"
          data-code={course.code}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setUserDismissedPane(false);
            setAnswerSheetOpen(true);
            setRightPaneCollapsed(false);
            setWorkspaceView({ paneId: "prereq-tree", state: { root: course.code, selections: {} } });
          }}
          className="text-primary border-primary hover:bg-accent-subtle focus-visible:ring-primary/40 mt-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 active:scale-95"
        >
          <Icon name="tree" size={12} /> Prereq Tree
        </button>
      )}
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
  const {
    workspaceView,
    setWorkspaceView,
    setActiveChannel,
    setUserDismissedPane,
    setAnswerSheetOpen,
    setRightPaneCollapsed,
  } = useChatShell();
  const outer = call.result as { type?: string; result?: unknown } | undefined;
  const data = outer?.result;

  switch (outer?.type) {
    case "courses": {
      const courses = Array.isArray((data as Partial<SearchCoursesResult>)?.courses)
        ? (data as SearchCoursesResult).courses.filter(isCourseDoc)
        : [];
      if (courses.length === 0) return null;
      const shown = courses.slice(0, 4);
      return (
        <div className="bg-surface-container-low flex flex-col overflow-hidden rounded-lg">
          <div className="flex flex-col">
            {shown.map((course) => (
              <button
                key={`${course.code}-${course.title}`}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setUserDismissedPane(false);
                  setAnswerSheetOpen(true);
                  setRightPaneCollapsed(false);
                  setWorkspaceView({ paneId: "course-lookup", state: { code: course.code } });
                }}
                className="hover:bg-surface-container-high focus-visible:ring-primary/40 flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-2"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-primary font-mono text-xs font-medium">{course.code.replace("_V", "")}</span>
                    {course.credits !== null && (
                      <span className="bg-surface-container text-on-surface-variant rounded-full px-2 py-0.5 text-xs">
                        {course.credits} cr
                      </span>
                    )}
                  </div>
                  <span className="text-body-sm text-on-surface-variant truncate">{course.title}</span>
                </div>
                <Icon name="right" size={16} className="text-muted shrink-0" />
              </button>
            ))}
          </div>
          {courses.length > shown.length && (
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="border-border text-primary hover:bg-surface-container-high flex min-h-[44px] items-center justify-center gap-1 border-t px-3 py-2 text-xs transition-colors"
            >
              <Icon name="add" size={14} />
              Show more related courses
            </button>
          )}
        </div>
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
      return (
        <ToolResultCard icon="currencyDollar">
          <span className="text-on-surface block text-base font-medium">
            {formatCad(amount)} <span className="text-body-sm text-on-surface-variant font-normal">{label}</span>
          </span>
          <span className="text-muted block truncate text-xs">
            {data.program || "—"} · {data.student_type || "—"} · {data.cohort_year || "—"} cohort
          </span>
        </ToolResultCard>
      );
    }
    case "route": {
      const r = data as { from?: string; to?: string; meters?: number; minutes?: number } | undefined;
      if (typeof r?.meters !== "number" || !r.from || !r.to) return null;
      return (
        <ToolResultCard icon="walk">
          <span className="text-on-surface block text-base font-medium">{formatMinutes(r.minutes)}</span>
          <span className="text-on-surface-variant block truncate text-xs">
            {formatMeters(r.meters)} · {r.from} → {r.to}
          </span>
        </ToolResultCard>
      );
    }
    case "building": {
      const b = data as { code?: string; name?: string; lat?: number; lon?: number } | undefined;
      if (!b?.code) return null;
      return (
        <ToolResultCard icon="map">
          <span className="text-on-surface block truncate text-base font-medium">{b.name ?? b.code}</span>
          <span className="text-muted block truncate font-mono text-xs">{b.code}</span>
        </ToolResultCard>
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
        <ToolResultCard icon="location">
          <span className="text-on-surface block text-base font-medium">
            {p.places.length} place{p.places.length === 1 ? "" : "s"}
            {p.near_building ? ` near ${p.near_building}` : ""}
          </span>
          <span className="text-muted block truncate text-xs">
            {preview}
            {p.places.length > 3 ? "…" : ""}
          </span>
        </ToolResultCard>
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
              <h3 className="text-on-surface text-sm font-medium">{e.title}</h3>
              {e.text && <p className="text-muted mt-0.5 line-clamp-2 text-xs">{e.text}</p>}
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
          <div className="mt-0.5 flex gap-2">
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                setActiveChannel("calendar", {
                  cursor: startDate
                    ? `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}`
                    : new Date().toISOString().slice(0, 7),
                  kinds: ["academic", "holiday"],
                });
              }}
              className="bg-primary text-on-primary h-9 min-h-[44px] flex-1 rounded-xl px-4 text-sm font-medium transition-all hover:brightness-105 active:brightness-95"
            >
              Add to Calendar
            </button>
            <button
              type="button"
              onClick={(ev) => {
                ev.stopPropagation();
                setActiveChannel("map", {});
              }}
              className="bg-surface text-on-surface border-border-subtle hover:bg-surface-container-high flex size-9 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border transition-colors"
              aria-label="Show on map"
            >
              <Icon name="map" size={18} />
            </button>
          </div>
        </div>
      );
    }
    case "study_spaces": {
      const bookable = (data as { kind?: string; rooms?: unknown[] } | undefined)?.rooms;
      if (Array.isArray(bookable) && bookable.length > 0) {
        const shown = bookable.slice(0, 5);
        return (
          <div className="bg-surface-container-low flex flex-col overflow-hidden rounded-lg">
            {shown.map((r, i) => {
              const room = r as {
                room?: string;
                title?: string;
                location?: string;
                capacity?: number;
                eid?: number;
                building_code?: string;
              };
              return (
                <button
                  key={room.eid ?? i}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setUserDismissedPane(false);
                    if (workspaceView !== null) {
                      setAnswerSheetOpen(true);
                      setRightPaneCollapsed(false);
                    }
                  }}
                  className="hover:bg-surface-container-high focus-visible:ring-primary/40 border-border-subtle flex items-center justify-between gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 focus-visible:ring-2 focus-visible:ring-offset-1"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-on-surface truncate text-sm font-medium">{room.room ?? room.title}</span>
                    <span className="text-muted truncate text-xs">{room.location ?? "—"}</span>
                  </div>
                  {room.capacity != null && (
                    <span className="bg-surface-container text-on-surface-variant shrink-0 rounded-full px-2 py-0.5 text-xs">
                      {room.capacity} seats
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      }
      const spaces = (data as { spaces?: unknown[] } | undefined)?.spaces;
      if (!Array.isArray(spaces) || spaces.length === 0) return null;
      const shown = (spaces as StudySpace[]).slice(0, 5);
      return (
        <div className="bg-surface-container-low flex flex-col overflow-hidden rounded-lg">
          {shown.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setUserDismissedPane(false);
                if (workspaceView !== null) {
                  setAnswerSheetOpen(true);
                  setRightPaneCollapsed(false);
                }
              }}
              className="hover:bg-surface-container-high focus-visible:ring-primary/40 border-border-subtle flex items-center justify-between gap-3 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 focus-visible:ring-2 focus-visible:ring-offset-1"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-on-surface truncate text-sm font-medium">{s.name ?? s.title}</span>
                <span className="text-muted truncate text-xs">
                  {[s.building_name ?? s.building_code, s.space_type].filter(Boolean).join(" · ")}
                </span>
              </div>
              {s.capacity != null && (
                <span className="bg-surface-container text-on-surface-variant shrink-0 rounded-full px-2 py-0.5 text-xs">
                  {s.capacity} seats
                </span>
              )}
            </button>
          ))}
          {spaces.length > shown.length && (
            <div className="text-muted px-3 py-2 text-xs">+{spaces.length - shown.length} more</div>
          )}
        </div>
      );
    }
    case "free_rooms": {
      const rooms = (data as { rooms?: unknown[]; as_of?: string | null } | undefined)?.rooms;
      const asOf = (data as { as_of?: string | null } | undefined)?.as_of;
      if (!Array.isArray(rooms) || rooms.length === 0) return null;
      const shown = (rooms as FreeRoom[]).slice(0, 5);
      return (
        <div className="bg-surface-container-low flex flex-col overflow-hidden rounded-lg">
          {shown.map((r) => (
            <div
              key={`${r.room}-${r.start}`}
              className="border-border-subtle flex items-center justify-between gap-3 border-b px-3 py-2.5 last:border-b-0"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-on-surface truncate text-sm font-medium">{r.room}</span>
                <span className="text-muted truncate text-xs">{r.location ?? "—"}</span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {r.capacity != null && <span className="text-on-surface-variant text-xs">{r.capacity} seats</span>}
                {typeof r.minutes === "number" && (
                  <span className="bg-secondary-container text-on-secondary-container rounded-full px-2 py-0.5 text-xs">
                    free {formatMinutes(r.minutes)}
                  </span>
                )}
              </div>
            </div>
          ))}
          {asOf && <div className="text-muted px-3 py-2 text-xs">as of {new Date(asOf).toLocaleString()}</div>}
        </div>
      );
    }
    case "grades": {
      const dist = (data as { grade_distribution?: GradeDistributionShape } | undefined)?.grade_distribution;
      const summary = (data as { grade_summary?: GradeSummaryShape } | undefined)?.grade_summary;
      if (!dist || !summary) return null;
      return (
        <div className="bg-surface-container-low flex flex-col gap-3 rounded-lg p-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-on-surface block text-sm font-medium">
              {(data as Partial<{ code: string }>).code ?? "Grade distribution"}
            </span>
            <span className="text-muted text-xs">
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
        <div className="bg-surface-container-low flex flex-col overflow-hidden rounded-lg">
          {near && <div className="text-muted border-border-subtle border-b px-3 py-2 text-xs">near {near}</div>}
          {shown.map((lot) => (
            <div
              key={lot.id}
              className="border-border-subtle flex items-center justify-between gap-3 border-b px-3 py-2.5 last:border-b-0"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-on-surface truncate text-sm font-medium">{lot.name}</span>
                {lot.rate && <span className="text-muted truncate text-xs">{lot.rate}</span>}
              </div>
              {lot.ev_charging && (
                <span className="bg-secondary-container text-on-secondary-container shrink-0 rounded-full px-2 py-0.5 text-xs">
                  EV
                </span>
              )}
            </div>
          ))}
        </div>
      );
    }
    case "program": {
      const programs = (data as { programs?: unknown[] } | undefined)?.programs;
      if (!Array.isArray(programs) || programs.length === 0) return null;
      const shown = (programs as ProgramDoc[]).slice(0, 5);
      return (
        <div className="bg-surface-container-low flex flex-col overflow-hidden rounded-lg">
          {shown.map((p) => (
            <a
              key={p.id}
              href={p.url || undefined}
              target={p.url ? "_blank" : undefined}
              rel={p.url ? "noreferrer" : undefined}
              onClick={(e) => e.stopPropagation()}
              className="border-border-subtle hover:bg-surface-container-high flex flex-col gap-0.5 border-b px-3 py-2.5 transition-colors last:border-b-0"
            >
              <span className="text-on-surface truncate text-sm font-medium">{p.name}</span>
              {Array.isArray(p.degrees) && p.degrees.length > 0 && (
                <span className="text-muted truncate text-xs">{p.degrees.join(", ")}</span>
              )}
            </a>
          ))}
          {programs.length > shown.length && (
            <div className="text-muted px-3 py-2 text-xs">+{programs.length - shown.length} more</div>
          )}
        </div>
      );
    }
    case "key_dates": {
      const dates = (data as { dates?: unknown[] } | undefined)?.dates;
      if (!Array.isArray(dates) || dates.length === 0) return null;
      const shown = (dates as KeyDate[]).slice(0, 6);
      return (
        <div className="bg-surface-container-low flex flex-col overflow-hidden rounded-lg">
          {shown.map((d, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: static append-only list
              key={`${d.name}-${i}`}
              className="border-border-subtle flex items-center justify-between gap-3 border-b px-3 py-2.5 last:border-b-0"
            >
              <span className="text-on-surface min-w-0 truncate text-sm">{d.name}</span>
              <span className="text-muted shrink-0 font-mono text-xs">{d.date_text ?? d.start ?? "—"}</span>
            </div>
          ))}
          {dates.length > shown.length && (
            <div className="text-muted px-3 py-2 text-xs">+{dates.length - shown.length} more</div>
          )}
        </div>
      );
    }
    default:
      return null;
  }
}

// ---- Registry ----

export const renderers: Record<string, ToolCallRenderer> = {
  show_widget: ShowWidgetRenderer,
};

/** True when a tool call's canvas view matches the current workspace view. The
 *  mapped states are small serializable objects, so structural stringify is the
 *  cheap correct equality for flat {highlight}/{code}/{root,selections}/{cursor,kinds}. */
function canvasViewsEqual(a: CanvasView, b: CanvasView): boolean {
  if (a.paneId !== b.paneId) return false;
  return JSON.stringify(a.state) === JSON.stringify(b.state);
}

/** True when a widget tool call's renderer would produce non-null output.
 *  Mirrors the null-return conditions inside ShowWidgetRenderer so message.tsx
 *  can decide whether to suppress markdown without duplicating render logic. */
export function widgetHasContent(call: ToolCall): boolean {
  if (isToolError(call.result) || call.result === undefined) return false;
  const outer = call.result as { type?: string; result?: unknown } | undefined;
  const data = outer?.result;
  switch (outer?.type) {
    case "courses": {
      const list = (data as Partial<SearchCoursesResult> | undefined)?.courses;
      return Array.isArray(list) && list.length > 0;
    }
    case "course":
    case "course_detail":
      return isCourseDoc(data);
    case "tuition":
      return isTuitionResult(data);
    case "route": {
      const r = data as { meters?: number; from?: string; to?: string } | undefined;
      return typeof r?.meters === "number" && !!r.from && !!r.to;
    }
    case "building": {
      const b = data as { code?: string } | undefined;
      return !!b?.code;
    }
    case "places": {
      const p = data as { places?: unknown[] } | undefined;
      return Array.isArray(p?.places) && p.places.length > 0;
    }
    case "event": {
      const events = (data as { events?: unknown[] } | undefined)?.events;
      return Array.isArray(events) && events.length > 0;
    }
    case "study_spaces": {
      const d = data as { kind?: string; spaces?: unknown[]; rooms?: unknown[] } | undefined;
      if (d?.kind === "bookable") return Array.isArray(d.rooms) && d.rooms.length > 0;
      return Array.isArray(d?.spaces) && d.spaces.length > 0;
    }
    case "grades": {
      const d = data as { grade_distribution?: { buckets?: Record<string, number> } } | undefined;
      return !!d?.grade_distribution && Object.values(d.grade_distribution.buckets ?? {}).some((v) => v > 0);
    }
    case "grade_distribution": {
      const d = data as
        { buckets?: Record<string, number>; bucket_distribution?: { buckets?: Record<string, number> } } | undefined;
      const b = d?.buckets ?? d?.bucket_distribution?.buckets;
      return !!b && Object.values(b).some((v) => v > 0);
    }
    case "parking": {
      const lots = (data as { parking?: unknown[] } | undefined)?.parking;
      return Array.isArray(lots) && lots.length > 0;
    }
    case "program": {
      const programs = (data as { programs?: unknown[] } | undefined)?.programs;
      return Array.isArray(programs) && programs.length > 0;
    }
    case "key_dates": {
      const dates = (data as { dates?: unknown[] } | undefined)?.dates;
      return Array.isArray(dates) && dates.length > 0;
    }
    default:
      return false;
  }
}

/**
 * One tool call in the activity stack. Internal tools render their compact
 * badge only; the show_widget tool renders its data widget as the answer. A
 * mapped widget is clickable and loads its canvas view on click/Enter.
 */
export function ResponseWidget({ call }: { call: ToolCall }) {
  const reduce = useReducedMotion();
  const { workspaceView, activateCanvasView, setUserDismissedPane, setRightPaneCollapsed } = useChatShell();
  const view = useMemo(() => toolCallToCanvasView(call), [call]);
  const mapped = view !== null;
  const active = mapped && workspaceView !== null && canvasViewsEqual(view, workspaceView);
  const Renderer = renderers[call.name];
  const widget = Renderer !== undefined;
  const loaded = !isToolError(call.result) && call.result !== undefined;

  const toggle = () => {
    setUserDismissedPane(false);
    setRightPaneCollapsed(false);
    activateCanvasView(call);
  };

  if (!widget) return <ToolBadge call={call} mapped={mapped} active={active} reduce={reduce} onToggle={toggle} />;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 500, damping: 30 }}
      role={mapped ? "button" : undefined}
      tabIndex={mapped ? 0 : undefined}
      aria-pressed={mapped ? active : undefined}
      data-widget={call.name}
      data-active={active || undefined}
      onClick={mapped ? toggle : undefined}
      onKeyDown={
        mapped
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggle();
              }
            }
          : undefined
      }
      className={
        mapped
          ? `hover:bg-surface-container-high focus-visible:ring-primary/40 min-h-[44px] cursor-pointer rounded-lg transition-colors duration-150 outline-none focus-visible:ring-2 ${
              active ? "bg-accent-subtle ring-primary ring-2" : ""
            }`
          : "rounded-lg"
      }
    >
      {loaded ? (
        <ErrorBoundary>
          <Renderer call={call} />
        </ErrorBoundary>
      ) : null}
    </motion.div>
  );
}
