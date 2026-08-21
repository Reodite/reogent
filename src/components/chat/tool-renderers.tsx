"use client";

// Tool-call rendering: internal tool calls show a compact badge only; the
// dedicated show_widget tool renders a rich data widget as the answer.
import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { Icon, type IconName } from "@/src/components/icons";
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
import { formatCad, formatMeters, formatMinutes, summarizeToolInput } from "@/src/lib/format";
import { toolCallToCanvasView } from "@/src/lib/walking";
import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";

interface ToolCallRendererProps {
  call: ToolCall;
}

type ToolCallRenderer = React.ComponentType<ToolCallRendererProps>;

const TOOL_ICONS: Record<string, IconName> = {
  search_courses: "search",
  get_course: "book2",
  get_tuition: "currencyDollar",
  walking_distance: "location",
  find_building: "map",
  find_places: "location",
  show_widget: "route",
};

// ---- Badges (internal tool calls) ----

function ToolBadge({ call }: { call: ToolCall }) {
  const failed = isToolError(call.result);
  const loading = call.result === undefined;
  const summary = summarizeToolInput(call.input);
  return (
    <span
      className={`inline-flex max-w-full items-center gap-2 overflow-hidden rounded-lg px-2 py-1 font-mono text-xs ${
        failed ? "bg-error-container/40 text-on-surface-variant" : "bg-secondary-container/15 text-on-surface-variant"
      }`}
      title={failed && isToolError(call.result) ? call.result.message : undefined}
    >
      {loading ? (
        <span
          role="status"
          aria-label="Loading"
          className="border-primary size-3 shrink-0 animate-spin rounded-full border-2 border-t-transparent"
        />
      ) : (
        <Icon name={failed ? "alert" : (TOOL_ICONS[call.name] ?? "route")} size={14} className="shrink-0" />
      )}
      <span className="truncate leading-none">
        {call.name}
        {summary ? `(${summary})` : "()"}
      </span>
      {failed && <span className="sr-only">(failed)</span>}
    </span>
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

/** The show_widget tool returns { type, result } where `result` mirrors the
 *  internal tool it delegated to. Each case renders the matching widget. */
function ShowWidgetRenderer({ call }: ToolCallRendererProps) {
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
        <div className="flex flex-col gap-2">
          {shown.map((course) => (
            <CourseCard key={`${course.code}-${course.title}`} course={course} />
          ))}
          {courses.length > shown.length && (
            <p className="text-muted text-xs">+ {courses.length - shown.length} more matches</p>
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

/**
 * One tool call in the activity stack. Internal tools render their compact
 * badge only; the show_widget tool renders its data widget as the answer. A
 * mapped widget is clickable and loads its canvas view on click/Enter.
 */
export function ResponseWidget({ call }: { call: ToolCall }) {
  const reduce = useReducedMotion();
  const { workspaceView, activateCanvasView } = useChatShell();
  const view = useMemo(() => toolCallToCanvasView(call), [call]);
  const mapped = view !== null;
  const active = mapped && workspaceView !== null && canvasViewsEqual(view, workspaceView);
  const Renderer = renderers[call.name];
  const widget = Renderer !== undefined;
  const loaded = !isToolError(call.result) && call.result !== undefined;

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
      onClick={mapped ? () => activateCanvasView(call) : undefined}
      onKeyDown={
        mapped
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                activateCanvasView(call);
              }
            }
          : undefined
      }
      className={
        mapped
          ? `hover:bg-surface-container-high focus-visible:ring-primary/40 cursor-pointer rounded-lg transition-colors duration-150 outline-none focus-visible:ring-2 ${
              active ? "bg-accent-subtle ring-primary ring-2" : ""
            }`
          : widget
            ? ""
            : "rounded-lg"
      }
    >
      {!widget && <ToolBadge call={call} />}
      {widget && loaded ? (
        <ErrorBoundary>
          <Renderer call={call} />
        </ErrorBoundary>
      ) : null}
    </motion.div>
  );
}
