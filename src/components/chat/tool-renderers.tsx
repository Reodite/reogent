"use client";

// Tool-call rendering: internal tool calls show a compact badge only; the
// dedicated show_widget tool renders a rich data widget as the answer.
import { useChatShell } from "@/src/components/chat/chat-shell-context";
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
  const label = failed ? description.replace(/^Searched for /, "Failed to find ") : description;
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
  const { setWorkspaceView } = useChatShell();
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
  const { setWorkspaceView, setActiveChannel } = useChatShell();
  const outer = call.result as { type?: string; result?: unknown } | undefined;
  const data = outer?.result;

  switch (outer?.type) {
    case "course": {
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
    case "course_detail":
      if (!isCourseDoc(data)) return null;
      return <CourseCard course={data} detailed />;
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
                <span className="text-on-surface-variant text-[0.6875rem] font-medium tracking-wider uppercase">
                  {month}
                </span>
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
    case "course": {
      const list = (data as Partial<SearchCoursesResult> | undefined)?.courses;
      return Array.isArray(list) && list.length > 0;
    }
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
  const { workspaceView, setWorkspaceView, activateCanvasView, setUserDismissedPane, setAnswerSheetOpen } =
    useChatShell();
  const view = useMemo(() => toolCallToCanvasView(call), [call]);
  const mapped = view !== null;
  const active = mapped && workspaceView !== null && canvasViewsEqual(view, workspaceView);
  const Renderer = renderers[call.name];
  const widget = Renderer !== undefined;
  const loaded = !isToolError(call.result) && call.result !== undefined;

  const toggle = () => {
    if (active) {
      setUserDismissedPane(true);
      setWorkspaceView(null);
      setAnswerSheetOpen(false);
    } else {
      setUserDismissedPane(false);
      activateCanvasView(call);
    }
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
