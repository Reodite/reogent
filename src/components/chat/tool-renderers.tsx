"use client";

// Tool-call rendering (task 3.2): every call gets a mono badge; known tools with
// healthy results also get a visualization from the `renderers` registry. Error
// results (`status: "error"`) render as badge only. Unknown tools fall back to
// the generic badge, so a new backend module needs only one renderer here.
import { useChatShell } from "@/src/components/chat/chat-shell-context";
import { Icon, type IconName } from "@/src/components/icons";
import {
  isToolError,
  type CourseDoc,
  type SearchCoursesResult,
  type ToolCall,
  type TuitionResult,
} from "@/src/lib/api-types";
import { formatCad, formatMeters, formatMinutes, summarizeToolInput } from "@/src/lib/format";
import { extractBuildingHighlight, extractPlacesHighlight, extractWalkingHighlight } from "@/src/lib/walking";
import { motion, useReducedMotion } from "motion/react";
import { useMemo } from "react";

export interface ToolCallRendererProps {
  call: ToolCall;
  /** True when this call belongs to the newest assistant response. */
  isLatest: boolean;
}

export type ToolCallRenderer = React.ComponentType<ToolCallRendererProps>;

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
  const summary = summarizeToolInput(call.input);
  return (
    <span
      className={`inline-flex max-w-full items-center gap-2 rounded-lg px-2 py-1 font-mono text-xs ${
        failed ? "bg-error-container/40 text-on-surface-variant" : "bg-secondary-container/15 text-on-surface-variant"
      }`}
      title={failed && isToolError(call.result) ? call.result.message : undefined}
    >
      <Icon name={failed ? "alert" : (TOOL_ICONS[call.name] ?? "route")} size={14} className="shrink-0" />
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
  const s = course.sections[0];
  if (!s) return null;
  const days = s.days.map((d) => d.toUpperCase()).join("·");
  const time = s.start_time && s.end_time ? `${s.start_time}–${s.end_time}` : null;
  return [s.term, days, time].filter(Boolean).join("  ");
}

function CourseCard({ course, detailed = false }: { course: CourseDoc; detailed?: boolean }) {
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
        <CourseCard key={course.code} course={course} />
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
  const label = t.per_credit_cad != null ? "per credit" : (t.unit ?? "flat");
  const amount = t.per_credit_cad ?? t.amount_cad ?? 0;
  return (
    <div className="bg-surface-container-low mt-2 flex items-center gap-3 rounded-lg p-3">
      <span className="bg-secondary-container text-on-secondary-container flex size-9 shrink-0 items-center justify-center rounded-lg">
        <Icon name="currencyDollar" size={18} />
      </span>
      <span className="min-w-0">
        <span className="text-on-surface block text-base font-medium">
          {formatCad(amount)} <span className="text-body-sm text-on-surface-variant font-normal">{label}</span>
        </span>
        <span className="text-muted block truncate text-xs">
          {t.program} · {t.student_type} · {t.cohort_year} cohort
        </span>
      </span>
    </div>
  );
}

// ---- walking_distance ----

// The chat panel publishes the merged highlight per response; renderers only
// restore their own card's view via "Show on map".
function WalkingDistanceRenderer({ call }: ToolCallRendererProps) {
  const { setHighlight, showOnMap } = useChatShell();
  const highlight = useMemo(() => extractWalkingHighlight(call), [call]);

  if (!highlight) return null;
  return (
    <div className="bg-surface-container-low mt-2 flex items-center gap-3 rounded-lg p-3">
      <span className="bg-secondary-container text-on-secondary-container flex size-9 shrink-0 items-center justify-center rounded-lg">
        <Icon name="walk" size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-on-surface block text-base font-medium">{formatMinutes(highlight.minutes)}</span>
        <span className="text-on-surface-variant block truncate text-xs">
          {formatMeters(highlight.meters)} · {highlight.from} → {highlight.to}
        </span>
      </span>
      <button
        type="button"
        aria-label={`Show route from ${highlight.from} to ${highlight.to} on map`}
        onClick={() => {
          setHighlight(highlight);
          showOnMap();
        }}
        className="border-primary text-primary hover:bg-accent-subtle focus-visible:ring-primary/40 min-h-[44px] shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-[color,background-color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95"
      >
        Show on map
      </button>
    </div>
  );
}

// ---- find_building ----

function FindBuildingRenderer({ call }: ToolCallRendererProps) {
  const { setHighlight, showOnMap } = useChatShell();
  const highlight = useMemo(() => extractBuildingHighlight(call), [call]);

  if (!highlight) return null;
  const building = highlight.buildings[0];
  return (
    <div className="bg-surface-container-low mt-2 flex items-center gap-3 rounded-lg p-3">
      <span className="bg-secondary-container text-on-secondary-container flex size-9 shrink-0 items-center justify-center rounded-lg">
        <Icon name="map" size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-on-surface block truncate text-base font-medium">{building.name}</span>
        <span className="text-muted block truncate font-mono text-xs">{building.code}</span>
      </span>
      <button
        type="button"
        aria-label={`Show ${building.name} on map`}
        onClick={() => {
          setHighlight(highlight);
          showOnMap();
        }}
        className="border-primary text-primary hover:bg-accent-subtle focus-visible:ring-primary/40 min-h-[44px] shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-[color,background-color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95"
      >
        Show on map
      </button>
    </div>
  );
}

// ---- find_places ----

function FindPlacesRenderer({ call }: ToolCallRendererProps) {
  const { setHighlight, showOnMap } = useChatShell();
  const highlight = useMemo(() => extractPlacesHighlight(call), [call]);

  if (!highlight) return null;
  const preview = highlight.places
    .slice(0, 3)
    .map((p) => p.name)
    .join(", ");
  return (
    <div className="bg-surface-container-low mt-2 flex items-center gap-3 rounded-lg p-3">
      <span className="bg-secondary-container text-on-secondary-container flex size-9 shrink-0 items-center justify-center rounded-lg">
        <Icon name="location" size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-on-surface block text-base font-medium">
          {highlight.places.length} place{highlight.places.length === 1 ? "" : "s"}
          {highlight.near ? ` near ${highlight.near}` : ""}
        </span>
        <span className="text-muted block truncate text-xs">
          {preview}
          {highlight.places.length > 3 ? "…" : ""}
        </span>
      </span>
      <button
        type="button"
        aria-label={`Show ${highlight.places.length} place${highlight.places.length === 1 ? "" : "s"} on map`}
        onClick={() => {
          setHighlight(highlight);
          showOnMap();
        }}
        className="border-primary text-primary hover:bg-accent-subtle focus-visible:ring-primary/40 min-h-[44px] shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-[color,background-color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95"
      >
        Show on map
      </button>
    </div>
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

/** Stable keys for an ordered, append-only call list: name + occurrence count. */
function callKeys(calls: ToolCall[]): string[] {
  const seen = new Map<string, number>();
  return calls.map((call) => {
    const n = (seen.get(call.name) ?? 0) + 1;
    seen.set(call.name, n);
    return `${call.name}#${n}`;
  });
}

export function ToolCallsView({ calls, isLatest }: { calls: ToolCall[]; isLatest: boolean }) {
  const reduced = useReducedMotion();
  if (calls.length === 0) return null;
  const keys = callKeys(calls);
  return (
    <div>
      <div className="mt-3 flex flex-wrap gap-2">
        {calls.map((call, i) => (
          <motion.span
            key={keys[i]}
            initial={reduced ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
          >
            <ToolBadge call={call} />
          </motion.span>
        ))}
      </div>
      {calls.map((call, i) => {
        if (isToolError(call.result)) return null;
        const Renderer = renderers[call.name];
        if (!Renderer) return null;
        return <Renderer key={`render-${keys[i]}`} call={call} isLatest={isLatest} />;
      })}
    </div>
  );
}
