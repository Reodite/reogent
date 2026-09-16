"use client";

import { Icon } from "@/src/components/icons";
import { Button } from "@/src/components/ui/button";
import { Heading } from "@/src/components/ui/heading";
import { InfoChip } from "@/src/components/ui/info-chip";
import { Skeleton, SkeletonFields, SkeletonGroup, SkeletonText } from "@/src/components/ui/skeleton";
import type { CourseDoc, CourseSection } from "@/src/lib/api-types";
import { normalizeDays, sectionGroup, type SectionComponent } from "@/src/lib/schedule";
import { courseColor } from "@/src/lib/schedule/calendar/colors";
import { useEffect, useRef, useState } from "react";
import { entryId, type ScheduleEntry } from "./schedule-store";

const KNOWN_GROUPS: SectionComponent[] = ["lecture", "laboratory", "tutorial", "discussion"];
const GROUP_LABELS: Record<SectionComponent, string> = {
  lecture: "Lecture",
  laboratory: "Laboratory",
  tutorial: "Tutorial",
  discussion: "Discussion",
  other: "Other",
};

/** Focus request created after adding a course or activating one timetable block. */
export interface PlannerCourseFocusRequest {
  group?: string;
  token: number;
}

interface PlannerCourseModuleProps {
  code: string;
  title: string;
  doc?: CourseDoc;
  catalogError?: boolean;
  onRetry?: () => void;
  term: string;
  entries: ScheduleEntry[];
  conflictingIds: Set<string>;
  conflictLabels?: Map<string, string[]>;
  focusRequest?: PlannerCourseFocusRequest;
  onSelectSection: (current: ScheduleEntry | undefined, next: CourseSection | null) => void;
  onRemove: () => void;
  onFocusHandled: () => void;
}

function groupSections(sections: CourseSection[]): Map<string, CourseSection[]> {
  const groups = new Map<string, CourseSection[]>();
  for (const section of sections) {
    const key = sectionGroup(section.section);
    const group = groups.get(key) ?? [];
    group.push(section);
    groups.set(key, group);
  }
  for (const group of groups.values()) group.sort((a, b) => a.section.localeCompare(b.section));
  return groups;
}

/** Returns the visible component label for known and unrecognized section groups. */
export function sectionGroupLabel(group: string): string {
  if (group.startsWith("other:")) return `${group.slice(6)} sections`;
  return GROUP_LABELS[group as SectionComponent];
}

/** Formats the selected meeting without repeating course identity. */
export function sectionMeetingLabel(section: {
  days: string[];
  start_time: string | null;
  end_time: string | null;
}): string {
  const days = normalizeDays(section.days);
  if (days.length === 0 || !section.start_time || !section.end_time) return "Meeting time TBA";
  return `${days.join("/")} · ${section.start_time}–${section.end_time}`;
}

function PlannerSectionRow({
  group,
  options,
  current,
  conflict,
  conflictLabels,
  inputRef,
  idPrefix,
  onSelect,
  catalogStatus,
}: {
  group: string;
  catalogStatus: "loading" | "error" | "ready";
  options: CourseSection[];
  current?: ScheduleEntry;
  conflict: boolean;
  conflictLabels: string[];
  inputRef: (node: HTMLSelectElement | null) => void;
  idPrefix: string;
  onSelect: (next: CourseSection | null) => void;
}) {
  const liveCurrent = options.find((section) => section.section === current?.section);
  const summary = liveCurrent ?? current?.snapshot;
  const fieldId = `${idPrefix}-${group.replace(/[^a-z0-9]+/gi, "-")}`;
  const unavailable = catalogStatus === "ready" && !!current && !liveCurrent;
  const status = current?.snapshot.status;
  const warning = conflict
    ? conflictLabels.length > 0
      ? `Overlaps ${conflictLabels.join(", ")}.`
      : "Overlaps another selected section."
    : unavailable
      ? "This saved section is no longer listed in the catalog."
      : status && !/open|active|available/i.test(status)
        ? `Catalog status: ${status}.`
        : null;

  return (
    <div className="border-border-subtle border-t px-3 py-2.5">
      <div className="flex items-center gap-2">
        <label
          className="text-on-surface min-w-0 flex-1 text-xs font-medium"
          htmlFor={catalogStatus === "loading" ? undefined : fieldId}
        >
          {sectionGroupLabel(group)}
        </label>
        {catalogStatus === "loading" ? (
          <SkeletonGroup label={`Loading ${sectionGroupLabel(group).toLowerCase()} section options`}>
            <Skeleton className="h-11 w-28 rounded-md sm:h-9" />
          </SkeletonGroup>
        ) : (
          <select
            disabled={catalogStatus !== "ready"}
            ref={inputRef}
            id={fieldId}
            value={current?.section ?? ""}
            aria-describedby={warning ? `${fieldId}-warning` : undefined}
            onChange={(event) => onSelect(options.find((section) => section.section === event.target.value) ?? null)}
            className={`border-border bg-surface text-on-surface focus-visible:ring-primary/40 min-h-11 max-w-[11rem] min-w-0 rounded-md border px-2 text-xs focus-visible:ring-2 focus-visible:ring-offset-1 sm:min-h-9 ${
              conflict ? "ring-error/60 ring-2" : ""
            }`}
          >
            <option value="">Choose section</option>
            {current && !liveCurrent ? <option value={current.section}>{current.section}</option> : null}
            {options.map((section) => (
              <option key={section.section} value={section.section}>
                {section.section}
              </option>
            ))}
          </select>
        )}
      </div>
      {summary ? (
        <div className="text-muted mt-1 text-xs leading-4">
          <p>{sectionMeetingLabel(summary)}</p>
          {current?.snapshot.instructor ? <p className="mt-1">{current.snapshot.instructor}</p> : null}
        </div>
      ) : (
        <p className="text-muted mt-1 text-xs leading-4">Not selected</p>
      )}
      {warning ? (
        <p id={`${fieldId}-warning`} className={`mt-1 text-xs ${conflict ? "text-error" : "text-tertiary"}`}>
          {warning}
        </p>
      ) : null}
    </div>
  );
}

/** Inline course and section controls used by the planner rail. */
export function PlannerCourseModule({
  code,
  title,
  doc,
  catalogError = false,
  onRetry,
  term,
  entries,
  conflictingIds,
  conflictLabels = new Map(),
  focusRequest,
  onSelectSection,
  onRemove,
  onFocusHandled,
}: PlannerCourseModuleProps) {
  const rootRef = useRef<HTMLElement>(null);
  const selectorRefs = useRef(new Map<string, HTMLSelectElement>());
  const [additionalOpen, setAdditionalOpen] = useState(false);
  const sections = doc?.sections.filter((section) => section.term === term) ?? [];
  const groups = groupSections(sections);
  const selectedByGroup = new Map(entries.map((entry) => [sectionGroup(entry.section), entry]));
  for (const entry of entries) {
    const group = sectionGroup(entry.section);
    if (!groups.has(group)) groups.set(group, []);
  }

  const known = KNOWN_GROUPS.filter((group) => groups.has(group));
  const additional = [...groups.keys()].filter((group) => group.startsWith("other:")).sort();
  const unselectedAdditional = additional.filter((group) => !selectedByGroup.has(group)).length;
  const forceAdditionalOpen = additional.some((group) => selectedByGroup.has(group));
  const hasCourseConflict = entries.some((entry) => conflictingIds.has(entryId(entry)));
  const idPrefix = `planner-${code}-${term}`.replace(/[^a-z0-9]+/gi, "-").toLowerCase();

  useEffect(() => {
    if (!focusRequest) return;
    rootRef.current?.scrollIntoView({ block: "nearest" });
    const target = focusRequest.group ? selectorRefs.current.get(focusRequest.group) : null;
    (target ?? rootRef.current)?.focus();
    onFocusHandled();
  }, [focusRequest, onFocusHandled]);

  return (
    <article
      ref={rootRef}
      tabIndex={-1}
      data-planner-course={code}
      className="border-border bg-surface rounded-lg border"
    >
      <header className="flex min-h-11 items-start gap-2 px-3 py-2.5">
        <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: courseColor(code) }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Heading as="h3" size="subsection" className="truncate">
              {code}
            </Heading>
            {hasCourseConflict ? (
              <InfoChip tone="error" className="shrink-0">
                Conflict
              </InfoChip>
            ) : null}
          </div>
          <p className="text-muted truncate text-xs leading-4">{title}</p>
        </div>
        <Button
          variant="ghost"
          size="denseIcon"
          onClick={onRemove}
          aria-label={`Remove ${code} from ${term}`}
          className="enabled:hover:bg-error/10 enabled:hover:text-error"
        >
          <Icon name="trash" className="size-4" />
        </Button>
      </header>

      {known.map((group) => {
        const current = selectedByGroup.get(group);
        return (
          <PlannerSectionRow
            key={group}
            catalogStatus={doc ? "ready" : catalogError ? "error" : "loading"}
            group={group}
            options={groups.get(group) ?? []}
            current={current}
            conflict={!!current && conflictingIds.has(entryId(current))}
            conflictLabels={current ? (conflictLabels.get(entryId(current)) ?? []) : []}
            idPrefix={idPrefix}
            inputRef={(node) => {
              if (node) selectorRefs.current.set(group, node);
              else selectorRefs.current.delete(group);
            }}
            onSelect={(next) => onSelectSection(current, next)}
          />
        );
      })}

      {additional.length > 0 ? (
        <details
          open={additionalOpen || forceAdditionalOpen}
          onToggle={(event) => setAdditionalOpen(event.currentTarget.open)}
          className="group/additional border-border-subtle border-t"
        >
          <summary className="text-on-surface hover:bg-surface-container focus-visible:ring-primary/40 flex min-h-11 list-none items-center justify-between gap-2 rounded-b-[calc(var(--radius-lg)-1px)] px-3 text-xs font-medium group-open/additional:rounded-b-none focus-visible:ring-2">
            <span>Additional component types</span>
            <span className="text-muted font-normal">
              {unselectedAdditional > 0 ? `${unselectedAdditional} not selected automatically` : "Configured"}
            </span>
          </summary>
          {additional.map((group) => {
            const current = selectedByGroup.get(group);
            return (
              <PlannerSectionRow
                key={group}
                catalogStatus={doc ? "ready" : catalogError ? "error" : "loading"}
                group={group}
                options={groups.get(group) ?? []}
                current={current}
                conflict={!!current && conflictingIds.has(entryId(current))}
                conflictLabels={current ? (conflictLabels.get(entryId(current)) ?? []) : []}
                idPrefix={idPrefix}
                inputRef={(node) => {
                  if (node) selectorRefs.current.set(group, node);
                  else selectorRefs.current.delete(group);
                }}
                onSelect={(next) => onSelectSection(current, next)}
              />
            );
          })}
        </details>
      ) : null}

      {!doc && catalogError ? (
        <div className="border-border-subtle border-t px-3 py-2.5">
          <p className="text-muted text-xs leading-4">Section options unavailable. Saved meetings remain visible.</p>
          {onRetry ? (
            <Button size="compact" onClick={onRetry} className="mt-2">
              Retry section options
            </Button>
          ) : null}
        </div>
      ) : !doc && groups.size === 0 ? (
        <div className="border-border-subtle border-t px-3 py-2.5">
          <SkeletonFields label={`Loading ${code} section options`} fields={1} />
        </div>
      ) : null}
      {doc && groups.size === 0 ? (
        <p className="border-border-subtle text-tertiary border-t px-3 py-2.5 text-xs leading-4">
          No sections are listed for this term. Cached meetings remain on the timetable.
        </p>
      ) : null}
    </article>
  );
}

export function PlannerCoursesSkeleton() {
  return (
    <SkeletonGroup label="Loading saved courses" className="flex flex-col gap-2">
      {[0, 1].map((course) => (
        <div key={course} className="border-border bg-surface overflow-hidden rounded-lg border">
          <div className="flex min-h-11 items-start gap-2 px-3 py-2.5">
            <Skeleton className="mt-1.5 size-2.5 rounded-full" />
            <SkeletonText lines={2} className="flex-1 py-1" />
            <Skeleton className="size-11 rounded-lg sm:size-8" />
          </div>
          <div className="border-border-subtle border-t px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-11 w-28 rounded-md sm:h-9" />
            </div>
            <Skeleton className="mt-1 h-4 w-2/3" />
          </div>
        </div>
      ))}
    </SkeletonGroup>
  );
}
