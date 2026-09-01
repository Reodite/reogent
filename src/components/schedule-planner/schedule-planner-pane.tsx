"use client";

import { CourseSearchField, useCourseAutocomplete } from "@/src/components/course-lookup/course-search";
import { Icon } from "@/src/components/icons";
import { useApi } from "@/src/components/providers";
import {
  ScheduleGrid,
  type ScheduleGridDragConfig,
  type ScheduleGridDragOption,
} from "@/src/components/schedule/schedule-grid";
import { ScheduleWorkspace, type ScheduleWorkspaceView } from "@/src/components/schedule/schedule-workspace";
import { ToastProvider } from "@/src/components/schedule/toast";
import { UploadDropzone } from "@/src/components/schedule/upload-dropzone";
import { useDialogFocus } from "@/src/components/schedule/use-dialog-focus";
import type { CourseDoc, CourseSection } from "@/src/lib/api-types";
import {
  conflictedIndices,
  normalizeDays,
  parseTime,
  sectionComponent,
  sectionGroup,
  type ScheduledSection,
  type SectionComponent,
} from "@/src/lib/schedule";
import { selectAutomaticSections } from "@/src/lib/schedule-planner";
import { resolvePlannerImport, type PlannerImportReview } from "@/src/lib/schedule-planner-import";
import { courseColor } from "@/src/lib/schedule/calendar/colors";
import { buildScheduleGrid, type ScheduleGridItem } from "@/src/lib/schedule/grid";
import { DAY_ORDER, type DayCode, type Schedule } from "@/src/lib/schedule/types";
import { minutesToFullLabel } from "@/src/lib/schedule/util/time";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  entryId,
  normalizeScheduleCode,
  useSchedule,
  type ScheduleEntry,
  type ScheduleImportMode,
  type ScheduleImportSelection,
} from "./schedule-store";
import { useScheduleSync } from "./use-schedule-sync";

const COMPONENT_ORDER: SectionComponent[] = ["lecture", "laboratory", "tutorial", "discussion", "other"];
const COMPONENT_LABELS: Record<SectionComponent, string> = {
  lecture: "Lecture",
  laboratory: "Laboratory",
  tutorial: "Tutorial",
  discussion: "Discussion",
  other: "Other",
};
const DAY_CODES = new Set<string>(DAY_ORDER);

function termLabel(term: string): string {
  const winter = term.match(/^(\d{4}-\d{2}) Winter Term ([12])$/);
  if (winter) return `${winter[1]} · Term ${winter[2]}`;
  return term;
}

function sortTerms(terms: Iterable<string>): string[] {
  return [...new Set(terms)].filter(Boolean).sort((a, b) => {
    const ay = a.slice(0, 7);
    const by = b.slice(0, 7);
    return ay === by ? a.localeCompare(b) : by.localeCompare(ay);
  });
}

function groupSections(sections: CourseSection[]): Map<string, CourseSection[]> {
  const groups = new Map<string, CourseSection[]>();
  for (const section of sections) {
    const kind = sectionGroup(section.section);
    const group = groups.get(kind) ?? [];
    group.push(section);
    groups.set(kind, group);
  }
  for (const group of groups.values()) group.sort((a, b) => a.section.localeCompare(b.section));
  return groups;
}

function orderedSectionGroups(groups: Map<string, CourseSection[]>): string[] {
  return [...groups.keys()].sort((a, b) => {
    const aIndex = COMPONENT_ORDER.indexOf(a.startsWith("other:") ? "other" : (a as SectionComponent));
    const bIndex = COMPONENT_ORDER.indexOf(b.startsWith("other:") ? "other" : (b as SectionComponent));
    return aIndex - bIndex || a.localeCompare(b);
  });
}

function sectionGroupLabel(group: string): string {
  if (group.startsWith("other:")) return `Other · ${group.slice(6)}`;
  return COMPONENT_LABELS[group as SectionComponent];
}

function sectionOption(section: CourseSection): string {
  const days = normalizeDays(section.days);
  const when =
    section.start_time && section.end_time
      ? `${days.length ? days.join("/") : "TBA"} · ${section.start_time}–${section.end_time}`
      : "Time TBA";
  const instructor = section.instructor ? ` · ${section.instructor}` : "";
  const status = section.status ? ` · ${section.status}` : "";
  return `${section.section} · ${when}${instructor}${status}`;
}

function toScheduled(entries: ScheduleEntry[]): ScheduledSection[] {
  return entries.map((entry) => ({
    code: normalizeScheduleCode(entry.code),
    title: entry.snapshot.title,
    section: entry.section,
    term: entry.term,
    days: normalizeDays(entry.snapshot.days),
    startMinutes: parseTime(entry.snapshot.start_time),
    endMinutes: parseTime(entry.snapshot.end_time),
    instructor: entry.snapshot.instructor ?? undefined,
  }));
}

/** Maps planner snapshots into the route-independent items consumed by the shared week grid. */
export function plannerGridItems(entries: ScheduleEntry[]): ScheduleGridItem[] {
  const scheduled = toScheduled(entries);
  const conflicts = conflictedIndices(scheduled);
  return entries.map((entry, index) => ({
    id: entryId(entry),
    courseKey: normalizeScheduleCode(entry.code),
    code: normalizeScheduleCode(entry.code),
    title: entry.snapshot.title,
    section: entry.section,
    component: sectionComponent(entry.section),
    days: normalizeDays(entry.snapshot.days).filter((day): day is DayCode => DAY_CODES.has(day)),
    startMin: parseTime(entry.snapshot.start_time),
    endMin: parseTime(entry.snapshot.end_time),
    meta: entry.snapshot.instructor ?? undefined,
    conflict: conflicts.has(index),
  }));
}

/** Builds alternate section slots for one selected planner component. */
export function plannerDragOptions(
  entries: ScheduleEntry[],
  docs: Map<string, CourseDoc>,
  blockId: string,
): ScheduleGridDragOption[] {
  const currentIndex = entries.findIndex((entry) => entryId(entry) === blockId);
  const current = entries[currentIndex];
  if (!current) return [];
  const code = normalizeScheduleCode(current.code);
  const doc = docs.get(code);
  if (!doc) return [];
  const group = sectionGroup(current.section);

  return doc.sections.flatMap((section) => {
    if (
      section.term !== current.term ||
      section.section === current.section ||
      sectionGroup(section.section) !== group
    ) {
      return [];
    }
    const days = normalizeDays(section.days).filter((day): day is DayCode => DAY_CODES.has(day));
    const startMin = parseTime(section.start_time);
    const endMin = parseTime(section.end_time);
    if (days.length === 0 || startMin < 0 || endMin <= startMin) return [];
    const candidate: ScheduleEntry = {
      code,
      section: section.section,
      term: current.term,
      snapshot: {
        title: doc.title,
        instructor: section.instructor ?? null,
        days,
        start_time: section.start_time,
        end_time: section.end_time,
        status: section.status ?? null,
      },
    };
    const resulting = entries.with(currentIndex, candidate);
    const conflict = conflictedIndices(toScheduled(resulting)).has(currentIndex);
    const id = entryId(candidate);
    return [
      {
        id,
        label: `${sectionOption(section)}${conflict ? " · creates a conflict" : ""}`,
        item: {
          id,
          courseKey: code,
          code,
          title: doc.title,
          section: section.section,
          component: sectionComponent(section.section),
          days,
          startMin,
          endMin,
          meta: section.status,
          conflict,
        },
      },
    ];
  });
}

function CourseDetailsDialog({
  code,
  doc,
  term,
  entries,
  conflictingIds,
  onClose,
}: {
  code: string;
  doc?: CourseDoc;
  term: string;
  entries: ScheduleEntry[];
  conflictingIds: Set<string>;
  onClose: () => void;
}) {
  const addEntry = useSchedule((state) => state.addEntry);
  const removeEntry = useSchedule((state) => state.removeEntry);
  const removeCourse = useSchedule((state) => state.removeCourse);
  const dialogRef = useDialogFocus<HTMLDivElement>();
  const selected = entries.filter((entry) => normalizeScheduleCode(entry.code) === code && entry.term === term);
  const sections = doc?.sections.filter((section) => section.term === term) ?? [];
  const groups = groupSections(sections);
  const title = doc?.title ?? selected[0]?.snapshot.title ?? "Course details";
  const courseHasConflict = selected.some((entry) => conflictingIds.has(entryId(entry)));

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Dismiss course details"
        tabIndex={-1}
        onClick={onClose}
        className="bg-on-surface/20 absolute inset-0 cursor-default"
      />
      <div
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="schedule-course-dialog-title"
        className="neu-panel bg-surface relative flex max-h-[min(44rem,calc(100dvh-1.5rem))] w-full max-w-lg flex-col overflow-hidden rounded-2xl"
      >
        <header className="border-border-subtle flex shrink-0 items-start gap-3 border-b p-4 sm:p-5">
          <span className="mt-1 size-3 shrink-0 rounded-full" style={{ backgroundColor: courseColor(code) }} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="schedule-course-dialog-title" className="font-mono text-base font-medium">
                {code}
              </h2>
              {courseHasConflict ? (
                <span className="bg-error-container/70 text-on-error-container inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs">
                  <Icon name="alert" className="size-3.5" /> Conflict
                </span>
              ) : null}
            </div>
            <p className="text-on-surface-variant mt-1 text-sm leading-relaxed">{title}</p>
          </div>
          <button
            type="button"
            data-dialog-initial-focus
            onClick={onClose}
            aria-label="Close course details"
            className="neu-button text-on-surface-variant grid size-10 shrink-0 place-items-center rounded-xl"
          >
            <Icon name="close" className="size-4" />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
          {sections.length > 0 ? (
            <div className="flex flex-col gap-4">
              <p className="text-muted text-sm leading-relaxed">
                Choose one section for each course component. Changes save to this term when you make them.
              </p>
              {orderedSectionGroups(groups).map((kind) => {
                const options = groups.get(kind);
                if (!options?.length) return null;
                const current = selected.find((entry) => sectionGroup(entry.section) === kind);
                const hasConflict = current ? conflictingIds.has(entryId(current)) : false;
                const label = sectionGroupLabel(kind);
                return (
                  <label key={kind} className="flex flex-col gap-1.5">
                    <span className="text-on-surface text-sm font-medium">{label}</span>
                    <select
                      aria-label={`${label} section`}
                      value={current?.section ?? ""}
                      onChange={(event) => {
                        const next = options.find((section) => section.section === event.target.value);
                        if (next && doc) addEntry(doc, next);
                        else if (current) removeEntry(current.code, current.section, current.term);
                      }}
                      className={`neu-inset bg-surface-container-low text-on-surface focus-visible:ring-primary/40 min-h-11 w-full rounded-lg px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-1 ${
                        hasConflict ? "ring-error/60 ring-2" : ""
                      }`}
                    >
                      <option value="">Choose {label.toLowerCase()}</option>
                      {options.map((section) => (
                        <option key={section.section} value={section.section}>
                          {sectionOption(section)}
                        </option>
                      ))}
                    </select>
                    {hasConflict ? (
                      <span className="text-error inline-flex items-center gap-1 text-xs">
                        <Icon name="alert" className="size-3.5" /> Conflicts with another selected section.
                      </span>
                    ) : null}
                    {current?.snapshot.status && !/open|active|available/i.test(current.snapshot.status) ? (
                      <span className="text-tertiary text-xs">Status: {current.snapshot.status}</span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="bg-surface-container-low rounded-xl p-4">
              <h3 className="text-sm font-medium">Section options unavailable</h3>
              <p className="text-muted mt-1 text-sm leading-relaxed">
                {selected.length > 0
                  ? "This saved section is no longer offered in this term. Its cached time remains on your schedule."
                  : "No sections are offered in this term."}
              </p>
            </div>
          )}
        </div>

        {selected.length > 0 ? (
          <footer className="border-border-subtle flex shrink-0 justify-end border-t p-4 sm:px-5">
            <button
              type="button"
              onClick={() => {
                removeCourse(code, term);
                onClose();
              }}
              className="neu-button text-error hover:bg-error/10 min-h-10 rounded-xl px-4 text-sm font-medium"
            >
              Remove course
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}

function CourseRailCard({
  code,
  title,
  sectionCount,
  conflict,
  status,
  removable,
  term,
  onOpen,
}: {
  code: string;
  title: string;
  sectionCount: number;
  conflict: boolean;
  status?: string;
  removable: boolean;
  term: string;
  onOpen: () => void;
}) {
  const removeCourse = useSchedule((state) => state.removeCourse);

  return (
    <article className="bg-surface-container-low flex items-start gap-2 rounded-xl p-2">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${code} course details`}
        className="hover:bg-surface-container focus-visible:ring-primary/40 flex min-h-14 min-w-0 flex-1 items-start gap-2 rounded-lg p-2 text-left focus-visible:ring-2"
      >
        <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: courseColor(code) }} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-mono text-sm font-medium">{code}</span>
            {conflict ? (
              <span className="bg-error-container/70 text-on-error-container inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-xs">
                <Icon name="alert" className="size-3" /> Conflict
              </span>
            ) : null}
          </span>
          <span className="text-muted mt-0.5 block truncate text-xs">{title}</span>
          <span className="text-on-surface-variant mt-1 block font-mono text-xs">
            {status ?? `${sectionCount} selected ${sectionCount === 1 ? "section" : "sections"}`}
          </span>
        </span>
      </button>
      {removable ? (
        <button
          type="button"
          onClick={() => removeCourse(code, term)}
          aria-label={`Remove ${code} from ${term}`}
          className="text-on-surface-variant hover:bg-error/10 hover:text-error focus-visible:ring-primary/40 grid size-10 shrink-0 place-items-center rounded-lg focus-visible:ring-2 focus-visible:ring-offset-1"
        >
          <Icon name="trash" className="size-4" />
        </button>
      ) : null}
    </article>
  );
}

function PlannerImportDialog({
  review,
  onApply,
  onClose,
}: {
  review: PlannerImportReview;
  onApply: (selections: ScheduleImportSelection[], mode: ScheduleImportMode) => void;
  onClose: () => void;
}) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const dialogRef = useDialogFocus<HTMLDivElement>();
  const unresolved = review.matches.filter((match) => match.status === "ambiguous" && !choices[match.source.id]);
  const selections = review.matches.flatMap((match): ScheduleImportSelection[] => {
    const section =
      match.status === "exact"
        ? match.candidates[0]
        : match.candidates.find((candidate) => candidate.section === choices[match.source.id]);
    return match.doc && section ? [{ doc: match.doc, section }] : [];
  });

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Cancel Workday import"
        tabIndex={-1}
        onClick={onClose}
        className="bg-on-surface/20 absolute inset-0 cursor-default"
      />
      <div
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="schedule-import-title"
        className="neu-panel bg-surface relative flex max-h-[min(48rem,calc(100dvh-1.5rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl"
      >
        <header className="border-border-subtle flex shrink-0 items-start gap-3 border-b p-4 sm:p-5">
          <div className="min-w-0 flex-1">
            <h2 id="schedule-import-title" className="text-on-surface text-base font-medium">
              Review Workday import
            </h2>
            <p className="text-muted mt-1 text-sm leading-relaxed">
              {review.sourceFileName ?? "Workday schedule"} matched {selections.length} of {review.matches.length}{" "}
              sections.
            </p>
          </div>
          <button
            type="button"
            data-dialog-initial-focus
            onClick={onClose}
            aria-label="Close Workday import review"
            className="neu-button text-on-surface-variant grid size-10 shrink-0 place-items-center rounded-xl"
          >
            <Icon name="close" className="size-4" />
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto p-4 sm:p-5">
          <div className="flex flex-col gap-2">
            {review.matches.map((match) => {
              const meeting = match.source.meetings[0];
              const meetingLabel = meeting
                ? `${meeting.days.join("/")} · ${minutesToFullLabel(meeting.startMin)}–${minutesToFullLabel(meeting.endMin)}`
                : "Time TBA";
              const code = normalizeScheduleCode(match.source.courseCode);
              return (
                <article key={match.source.id} className="bg-surface-container-low rounded-xl p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-mono text-sm font-medium">{code || match.source.title}</h3>
                      <p className="text-muted mt-0.5 truncate text-xs">{match.source.title}</p>
                      <p className="text-on-surface-variant mt-1 font-mono text-xs">{meetingLabel}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-xs font-medium ${
                        match.status === "exact"
                          ? "bg-accent-subtle text-on-surface-variant"
                          : match.status === "ambiguous"
                            ? "bg-tertiary-container text-on-tertiary-container"
                            : "bg-error-container/60 text-on-error-container"
                      }`}
                    >
                      {match.status === "exact"
                        ? "Matched"
                        : match.status === "ambiguous"
                          ? "Choose section"
                          : "Skipped"}
                    </span>
                  </div>
                  {match.status === "ambiguous" ? (
                    <label className="mt-3 flex flex-col gap-1.5">
                      <span className="text-on-surface text-xs font-medium">Catalog section</span>
                      <select
                        value={choices[match.source.id] ?? ""}
                        onChange={(event) =>
                          setChoices((current) => ({ ...current, [match.source.id]: event.target.value }))
                        }
                        className="neu-inset bg-surface text-on-surface focus-visible:ring-primary/40 min-h-11 rounded-lg px-3 text-sm focus-visible:ring-2"
                      >
                        <option value="">Choose the section from Workday</option>
                        {match.candidates.map((candidate) => (
                          <option key={candidate.section} value={candidate.section}>
                            {sectionOption(candidate)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {match.reason ? <p className="text-muted mt-2 text-xs leading-relaxed">{match.reason}</p> : null}
                  {match.candidates[0]?.status && !/open|active|available/i.test(match.candidates[0].status) ? (
                    <p className="text-tertiary mt-2 text-xs">Catalog status: {match.candidates[0].status}</p>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>

        <footer className="border-border-subtle shrink-0 border-t p-4 sm:px-5">
          {unresolved.length > 0 ? (
            <p className="text-tertiary mb-3 text-xs">
              Choose a section for {unresolved.length} ambiguous row(s) to continue.
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="neu-button min-h-10 rounded-xl px-4 text-sm">
              Cancel
            </button>
            <button
              type="button"
              disabled={selections.length === 0 || unresolved.length > 0}
              onClick={() => onApply(selections, "replace")}
              className="neu-button text-on-surface min-h-10 rounded-xl px-4 text-sm font-medium disabled:opacity-45"
            >
              Replace planner
            </button>
            <button
              type="button"
              disabled={selections.length === 0 || unresolved.length > 0}
              onClick={() => onApply(selections, "merge")}
              className="neu-primary-button bg-primary text-on-primary min-h-10 rounded-xl px-4 text-sm font-medium disabled:opacity-45"
            >
              Merge with planner
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/** Planner schedule surface with shared timetable rendering and local editing controls. */
export function SchedulePlannerPane() {
  return (
    <ToastProvider>
      <SchedulePlannerPaneInner />
    </ToastProvider>
  );
}

function SchedulePlannerPaneInner() {
  useScheduleSync();
  const api = useApi();
  const entries = useSchedule((state) => state.entries);
  const activeTerm = useSchedule((state) => state.activeTerm);
  const setActiveTerm = useSchedule((state) => state.setActiveTerm);
  const addEntry = useSchedule((state) => state.addEntry);
  const addCourseSections = useSchedule((state) => state.addCourseSections);
  const importSections = useSchedule((state) => state.importSections);
  const stale = useSchedule((state) => state.stale);
  const setStale = useSchedule((state) => state.setStale);
  const [query, setQuery] = useState("");
  const [docs, setDocs] = useState<Map<string, CourseDoc>>(new Map());
  const [catalogError, setCatalogError] = useState(false);
  const [mobileView, setMobileView] = useState<ScheduleWorkspaceView>("schedule");
  const [activeDay, setActiveDay] = useState<DayCode>("Mon");
  const [detailCode, setDetailCode] = useState<string | null>(null);
  const [importReview, setImportReview] = useState<PlannerImportReview | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const lastAutoRecord = useRef<CourseDoc | null>(null);

  const resolveSingle = useCallback((code: string) => api.getCourse(code), [api]);
  const { list, status, error, rejected, record, lookup } = useCourseAutocomplete(query, { resolveSingle });

  async function prepareImport(schedule: Schedule) {
    setImportLoading(true);
    try {
      setImportReview(await resolvePlannerImport(schedule, api.getCourse));
    } finally {
      setImportLoading(false);
    }
  }

  function applyImport(selections: ScheduleImportSelection[], mode: ScheduleImportMode) {
    importSections(selections, mode);
    setDocs((current) => {
      const next = new Map(current);
      for (const { doc } of selections) next.set(normalizeScheduleCode(doc.code), doc);
      return next;
    });
    setImportReview(null);
    setMobileView("schedule");
  }

  useEffect(() => {
    if (!record || lastAutoRecord.current === record) return;
    lastAutoRecord.current = record;
    const code = normalizeScheduleCode(record.code);
    setDocs((current) => new Map(current).set(code, record));
    const offeredTerms = sortTerms(record.sections.flatMap((section) => (section.term ? [section.term] : [])));
    const term = offeredTerms.includes(activeTerm) ? activeTerm : offeredTerms[0];
    if (!term || entries.some((entry) => normalizeScheduleCode(entry.code) === code && entry.term === term)) return;
    const selection = selectAutomaticSections(
      record,
      term,
      toScheduled(entries.filter((entry) => entry.term === term)),
    );
    addCourseSections(record, selection.sections);
  }, [activeTerm, addCourseSections, entries, record]);

  const storedCodeKey = useMemo(
    () => [...new Set(entries.map((entry) => normalizeScheduleCode(entry.code)))].sort().join("\u0000"),
    [entries],
  );

  useEffect(() => {
    if (!storedCodeKey) return;
    const codes = storedCodeKey.split("\u0000");
    let cancelled = false;
    Promise.allSettled(codes.map((code) => api.getCourse(code))).then((results) => {
      if (cancelled) return;
      setDocs((current) => {
        const next = new Map(current);
        results.forEach((result, index) => {
          if (result.status === "fulfilled") next.set(codes[index], result.value);
        });
        return next;
      });
      setCatalogError(results.some((result) => result.status === "rejected"));
    });
    return () => {
      cancelled = true;
    };
  }, [api, storedCodeKey]);

  const allTerms = useMemo(() => {
    const terms = entries.map((entry) => entry.term);
    const pickedCourseCodes = new Set(entries.map((entry) => normalizeScheduleCode(entry.code)));
    for (const code of pickedCourseCodes) terms.push(...(docs.get(code)?.terms ?? []));
    if (record) terms.push(...record.terms);
    return sortTerms(terms);
  }, [docs, entries, record]);

  useEffect(() => {
    if (allTerms.length === 0) return;
    if (!activeTerm || !allTerms.includes(activeTerm)) setActiveTerm(allTerms[0]);
  }, [activeTerm, allTerms, setActiveTerm]);

  const visibleEntries = useMemo(() => entries.filter((entry) => entry.term === activeTerm), [activeTerm, entries]);
  const gridItems = useMemo(() => plannerGridItems(visibleEntries), [visibleEntries]);
  const gridModel = useMemo(() => buildScheduleGrid(gridItems), [gridItems]);
  const pickedCodes = new Set(visibleEntries.map((entry) => normalizeScheduleCode(entry.code)));
  const shownCodes = new Set(pickedCodes);
  if (record?.sections.some((section) => section.term === activeTerm)) {
    shownCodes.add(normalizeScheduleCode(record.code));
  }
  const conflictingIds = new Set(gridItems.filter((item) => item.conflict).map((item) => item.id));
  const conflictCount = conflictingIds.size;
  const credits = [...pickedCodes].reduce((sum, code) => sum + (docs.get(code)?.credits ?? 0), 0);
  const dragConfig = useMemo<ScheduleGridDragConfig>(
    () => ({
      getOptions: (blockId) => plannerDragOptions(visibleEntries, docs, blockId),
      onDrop: (blockId, optionId) => {
        const current = visibleEntries.find((entry) => entryId(entry) === blockId);
        if (!current) return;
        const doc = docs.get(normalizeScheduleCode(current.code));
        const section = doc?.sections.find(
          (candidate) =>
            candidate.term === current.term &&
            entryId({ code: current.code, section: candidate.section, term: current.term }) === optionId,
        );
        if (doc && section) addEntry(doc, section);
      },
    }),
    [addEntry, docs, visibleEntries],
  );

  const notice =
    stale || catalogError ? (
      <div className="border-tertiary/20 bg-tertiary-container/40 text-on-tertiary-container flex shrink-0 items-start gap-2 rounded-xl border px-3 py-2 text-xs">
        <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
        <span className="flex-1">
          {catalogError
            ? "Some course details could not be refreshed. Cached times remain visible."
            : "The catalog changed since your last visit. Review highlighted course details before registering."}
        </span>
        <button
          type="button"
          onClick={() => {
            setStale(false);
            setCatalogError(false);
          }}
          aria-label="Dismiss notice"
          className="focus-visible:ring-primary/40 rounded-md p-1 focus-visible:ring-2"
        >
          <Icon name="close" className="size-3.5" />
        </button>
      </div>
    ) : undefined;

  const termToolbar = (
    <div className="flex min-w-max items-center justify-between gap-4">
      <div role="tablist" aria-label="Academic term" className="flex gap-1">
        {allTerms.length === 0 ? (
          <span className="text-muted px-2 py-1.5 text-xs">Terms appear after you find a course.</span>
        ) : (
          allTerms.map((term) => (
            <button
              key={term}
              type="button"
              role="tab"
              aria-selected={term === activeTerm}
              onClick={() => setActiveTerm(term)}
              className={`focus-visible:ring-primary/40 shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 ${
                term === activeTerm
                  ? "neu-inset bg-surface-container text-on-surface"
                  : "text-on-surface-variant hover:bg-surface-container-low"
              }`}
            >
              {termLabel(term)}
            </button>
          ))
        )}
      </div>
      {visibleEntries.length > 0 ? (
        <div className="text-muted flex shrink-0 items-center gap-2 text-xs">
          <span>{pickedCodes.size} courses</span>
          {credits > 0 ? <span>· {credits} credits</span> : null}
          {conflictCount > 0 ? (
            <span
              role="status"
              aria-label={`${conflictCount} conflicting ${conflictCount === 1 ? "section" : "sections"}`}
              className="bg-error-container/60 text-on-error-container inline-flex items-center gap-1 rounded-full px-2 py-1"
            >
              <Icon name="alert" className="size-3.5" />
              {conflictCount} conflicting {conflictCount === 1 ? "section" : "sections"}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const controls = (
    <div className="flex min-h-full flex-col gap-4 p-4">
      <section>
        <h2 className="mb-2 text-sm font-medium">Find a course</h2>
        <CourseSearchField
          value={query}
          onChange={setQuery}
          onSelect={setQuery}
          onRetry={() => lookup(query)}
          status={status}
          list={list}
          error={error}
          rejected={rejected}
          placeholder="CPSC 110, MATH 200, linear algebra"
          ariaLabel="Find a course to schedule"
        />
      </section>

      <section className="border-border-subtle border-t pt-4">
        <h2 className="text-on-surface text-sm font-medium">Import from Workday</h2>
        <p className="text-muted mt-1 mb-2 text-xs leading-relaxed">
          Add your registered sections from a Workday Excel export.
        </p>
        {importLoading ? (
          <div role="status" className="bg-surface-container-low text-muted rounded-xl px-3 py-4 text-sm">
            Matching Workday sections to the catalog…
          </div>
        ) : (
          <UploadDropzone onParsed={(schedule) => void prepareImport(schedule)} />
        )}
      </section>

      <section className="border-border-subtle border-t pt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Courses in this term</h2>
          {visibleEntries.length > 0 ? (
            <span className="text-muted font-mono text-xs">{visibleEntries.length} sections</span>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          {[...shownCodes].map((code) => {
            const doc = docs.get(code);
            const selected = visibleEntries.filter((entry) => normalizeScheduleCode(entry.code) === code);
            const unavailable = !!doc && doc.sections.every((section) => section.term !== activeTerm);
            return (
              <CourseRailCard
                key={code}
                code={code}
                title={doc?.title ?? selected[0]?.snapshot.title ?? "Loading course details…"}
                sectionCount={selected.length}
                conflict={selected.some((entry) => conflictingIds.has(entryId(entry)))}
                status={!doc ? "Loading section options…" : unavailable ? "Saved section unavailable" : undefined}
                removable={selected.length > 0}
                term={activeTerm}
                onOpen={() => setDetailCode(code)}
              />
            );
          })}
          {shownCodes.size === 0 && !record ? (
            <p className="text-muted py-4 text-sm leading-relaxed">
              Choose a search result to see its available sections.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );

  return (
    <>
      <ScheduleWorkspace
        title="Course schedule"
        description="Build a conflict-aware week, one course component at a time."
        toolbar={termToolbar}
        notice={notice}
        controlsLabel="Courses"
        controls={controls}
        mobileView={mobileView}
        onMobileViewChange={setMobileView}
      >
        <ScheduleGrid
          model={gridModel}
          activeDay={activeDay}
          onActiveDayChange={setActiveDay}
          onBlockActivate={(id) => {
            const item = gridItems.find((candidate) => candidate.id === id);
            if (item) setDetailCode(item.code);
          }}
          ariaLabel="Weekly course schedule"
          drag={dragConfig}
          empty={{
            title: "Build your first timetable",
            description: "Search for a course, then choose its lecture, lab, or tutorial.",
            actionLabel: "Browse courses",
            onAction: () => setMobileView("controls"),
          }}
        />
      </ScheduleWorkspace>

      {importReview ? (
        <PlannerImportDialog review={importReview} onApply={applyImport} onClose={() => setImportReview(null)} />
      ) : null}

      {detailCode ? (
        <CourseDetailsDialog
          code={detailCode}
          doc={docs.get(detailCode)}
          term={activeTerm}
          entries={visibleEntries}
          conflictingIds={conflictingIds}
          onClose={() => setDetailCode(null)}
        />
      ) : null}
    </>
  );
}
