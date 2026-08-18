"use client";

// Tool-call rendering (task 3.2): every call gets a mono badge; known tools with
// healthy results also get a visualization from the `renderers` registry. Error
// results (`status: "error"`) render as badge only. Unknown tools fall back to
// the generic badge, so a new backend module needs only one renderer here.
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
import {
  extractBuildingHighlight,
  extractPlacesHighlight,
  extractWalkingHighlight,
  toolCallToCanvasView,
} from "@/src/lib/walking";
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
};

// ---- Badges ----

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
      <span className="truncate">
        {call.name}
        {summary ? `(${summary})` : "()"}
      </span>
      {failed && <span className="sr-only">(failed)</span>}
    </span>
  );
}

// ---- search_courses / get_course ----

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

function SearchCoursesRenderer({ call }: ToolCallRendererProps) {
  const result = call.result as Partial<SearchCoursesResult> | undefined;
  const courses = Array.isArray(result?.courses) ? result.courses.filter(isCourseDoc) : [];
  if (courses.length === 0) return null;
  const shown = courses.slice(0, 4);
  return (
    <div className="mt-2 flex flex-col gap-2">
      {shown.map((course) => (
        <CourseCard key={`${course.code}-${course.title}`} course={course} />
      ))}
      {courses.length > shown.length && (
        <p className="text-muted text-xs">+ {courses.length - shown.length} more matches</p>
      )}
    </div>
  );
}

function GetCourseRenderer({ call }: ToolCallRendererProps) {
  if (!isCourseDoc(call.result)) return null;
  return (
    <div className="mt-2">
      <CourseCard course={call.result} detailed />
    </div>
  );
}

// ---- get_tuition ----

function isTuitionResult(value: unknown): value is TuitionResult {
  return typeof value === "object" && value !== null && typeof (value as TuitionResult).amount_cad === "number";
}

function TuitionRenderer({ call }: ToolCallRendererProps) {
  if (!isTuitionResult(call.result)) return null;
  const t = call.result;
  const label = t.per_credit_cad != null ? "per credit" : t.unit || "flat";
  const amount = t.per_credit_cad ?? t.amount_cad ?? 0;
  return (
    <ToolResultCard icon="currencyDollar">
      <span className="text-on-surface block text-base font-medium">
        {formatCad(amount)} <span className="text-body-sm text-on-surface-variant font-normal">{label}</span>
      </span>
      <span className="text-muted block truncate text-xs">
        {t.program || "—"} · {t.student_type || "—"} · {t.cohort_year || "—"} cohort
      </span>
    </ToolResultCard>
  );
}

// ---- walking_distance ----

// The widget envelope activates the map for these tools; the renderer supplies
// the summary visual only.
function WalkingDistanceRenderer({ call }: ToolCallRendererProps) {
  const highlight = useMemo(() => extractWalkingHighlight(call), [call]);

  if (!highlight) return null;
  return (
    <ToolResultCard icon="walk">
      <span className="text-on-surface block text-base font-medium">{formatMinutes(highlight.minutes)}</span>
      <span className="text-on-surface-variant block truncate text-xs">
        {formatMeters(highlight.meters)} · {highlight.from} → {highlight.to}
      </span>
    </ToolResultCard>
  );
}

// ---- find_building ----

function FindBuildingRenderer({ call }: ToolCallRendererProps) {
  const highlight = useMemo(() => extractBuildingHighlight(call), [call]);

  if (!highlight || highlight.buildings.length === 0) return null;
  const building = highlight.buildings[0];
  return (
    <ToolResultCard icon="map">
      <span className="text-on-surface block truncate text-base font-medium">{building.name}</span>
      <span className="text-muted block truncate font-mono text-xs">{building.code}</span>
    </ToolResultCard>
  );
}

// ---- find_places ----

function FindPlacesRenderer({ call }: ToolCallRendererProps) {
  const highlight = useMemo(() => extractPlacesHighlight(call), [call]);

  if (!highlight || highlight.places.length === 0) return null;
  const preview = highlight.places
    .slice(0, 3)
    .map((p) => p.name)
    .join(", ");
  return (
    <ToolResultCard icon="location">
      <span className="text-on-surface block text-base font-medium">
        {highlight.places.length} place{highlight.places.length === 1 ? "" : "s"}
        {highlight.near ? ` near ${highlight.near}` : ""}
      </span>
      <span className="text-muted block truncate text-xs">
        {preview}
        {highlight.places.length > 3 ? "…" : ""}
      </span>
    </ToolResultCard>
  );
}

// ---- Registry ----

export const renderers: Record<string, ToolCallRenderer> = {
  search_courses: SearchCoursesRenderer,
  get_course: GetCourseRenderer,
  get_tuition: TuitionRenderer,
  walking_distance: WalkingDistanceRenderer,
  find_building: FindBuildingRenderer,
  find_places: FindPlacesRenderer,
};

/** True when a tool call's canvas view matches the current workspace view. The
 *  mapped states are small serializable objects, so structural stringify is the
 *  cheap correct equality for flat {highlight}/{code}/{root,selections}/{cursor,kinds}. */
function canvasViewsEqual(a: CanvasView, b: CanvasView): boolean {
  if (a.paneId !== b.paneId) return false;
  return JSON.stringify(a.state) === JSON.stringify(b.state);
}

/**
 * One tool call as a clickable summary card. A mapped tool loads its canvas
 * view into the Answer Canvas on click and on Enter/Space, and shows the active
 * ring while its view matches `workspaceView`. Unmapped tools (and error
 * results) render a static, non-focusable summary badge.
 */
export function ResponseWidget({ call }: { call: ToolCall }) {
  const reduce = useReducedMotion();
  const { workspaceView, activateCanvasView } = useChatShell();
  const view = useMemo(() => toolCallToCanvasView(call), [call]);
  const mapped = view !== null;
  const active = mapped && workspaceView !== null && canvasViewsEqual(view, workspaceView);
  const Renderer = renderers[call.name];
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
          ? `hover:bg-surface-container-high focus-visible:ring-primary/40 mt-3 cursor-pointer rounded-lg transition-colors duration-150 outline-none focus-visible:ring-2 ${
              active ? "bg-accent-subtle ring-primary ring-2" : ""
            }`
          : "mt-3 rounded-lg"
      }
    >
      <ToolBadge call={call} />
      {Renderer && loaded ? (
        <ErrorBoundary>
          <Renderer call={call} />
        </ErrorBoundary>
      ) : null}
    </motion.div>
  );
}

/** Stable keys for an ordered, append-only call list: name + occurrence count. */
function callKeys(calls: ToolCall[]): string[] {
  const seen = new Map<string, number>();
  return calls.map((call) => {
    const n = (seen.get(call.name) ?? 0) + 1;
    seen.set(call.name, n);
    return `${call.name}#${n}`;
  });
}

export function ToolCallsView({ calls }: { calls: ToolCall[] }) {
  if (calls.length === 0) return null;
  const keys = callKeys(calls);
  return (
    <>
      {calls.map((call, i) => (
        <ResponseWidget key={keys[i]} call={call} />
      ))}
    </>
  );
}
