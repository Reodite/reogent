"use client";

import { CourseSearchField, useCourseAutocomplete } from "@/src/components/course-lookup/course-search";
import { Icon } from "@/src/components/icons";
import { useApi } from "@/src/components/providers";
import type { CourseDoc, CourseSection } from "@/src/lib/api-types";
import {
  conflictedIndices,
  normalizeDays,
  parseTime,
  sectionComponent,
  type ScheduledSection,
  type SectionComponent,
} from "@/src/lib/schedule";
import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeScheduleCode, useSchedule, type ScheduleEntry } from "./schedule-store";
import { courseColor, TimetableGrid } from "./timetable-grid";
import { useScheduleSync } from "./use-schedule-sync";

const COMPONENT_ORDER: SectionComponent[] = ["lecture", "laboratory", "tutorial", "discussion", "other"];
const COMPONENT_LABELS: Record<SectionComponent, string> = {
  lecture: "Lecture",
  laboratory: "Laboratory",
  tutorial: "Tutorial",
  discussion: "Discussion",
  other: "Other",
};

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

function groupSections(sections: CourseSection[]): Map<SectionComponent, CourseSection[]> {
  const groups = new Map<SectionComponent, CourseSection[]>();
  for (const section of sections) {
    const kind = sectionComponent(section.section);
    const group = groups.get(kind) ?? [];
    group.push(section);
    groups.set(kind, group);
  }
  for (const group of groups.values()) group.sort((a, b) => a.section.localeCompare(b.section));
  return groups;
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
  return entries.map((e) => ({
    code: e.code,
    title: e.snapshot.title,
    section: e.section,
    term: e.term,
    days: normalizeDays(e.snapshot.days),
    startMinutes: parseTime(e.snapshot.start_time),
    endMinutes: parseTime(e.snapshot.end_time),
    instructor: e.snapshot.instructor ?? undefined,
  }));
}

function SectionPicker({ doc, term, conflictingIds }: { doc: CourseDoc; term: string; conflictingIds: Set<string> }) {
  const entries = useSchedule((s) => s.entries);
  const addEntry = useSchedule((s) => s.addEntry);
  const removeEntry = useSchedule((s) => s.removeEntry);
  const removeCourse = useSchedule((s) => s.removeCourse);
  const code = normalizeScheduleCode(doc.code);
  const sections = useMemo(() => doc.sections.filter((s) => s.term === term), [doc.sections, term]);
  const groups = useMemo(() => groupSections(sections), [sections]);
  const selected = entries.filter((e) => normalizeScheduleCode(e.code) === code && e.term === term);
  const courseHasConflict = selected.some((entry) =>
    conflictingIds.has(`${entry.code}::${entry.section}::${entry.term}`),
  );

  if (sections.length === 0) {
    return (
      <article className="bg-surface-container-low rounded-lg p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-mono text-sm font-medium">{code}</h3>
            <p className="text-on-surface-variant mt-1 text-xs">
              {selected.length > 0
                ? "This saved section is no longer offered in this term."
                : "No sections are offered in this term."}
            </p>
          </div>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => removeCourse(code, term)}
              aria-label={`Remove ${code} from ${term}`}
              className="text-on-surface-variant hover:bg-error/10 hover:text-error focus-visible:ring-primary/40 grid size-9 shrink-0 place-items-center rounded-lg focus-visible:ring-2 focus-visible:ring-offset-1"
            >
              <Icon name="trash" className="size-4" />
            </button>
          )}
        </div>
      </article>
    );
  }

  return (
    <article className="bg-surface-container-low rounded-xl p-3">
      <div className="mb-3 flex items-start gap-2">
        <span className={`mt-1 size-2 shrink-0 rounded-full ${courseColor(code).split(" ")[0]}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate font-mono text-sm font-medium">{code}</h3>
            {courseHasConflict && (
              <span className="bg-error-container/70 text-on-error-container inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs">
                <Icon name="alert" className="size-3" /> Conflict
              </span>
            )}
          </div>
          <p className="text-muted truncate text-xs">{doc.title}</p>
        </div>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => removeCourse(code, term)}
            aria-label={`Remove ${code} from ${term}`}
            className="text-on-surface-variant hover:bg-error/10 hover:text-error focus-visible:ring-primary/40 grid size-9 shrink-0 place-items-center rounded-lg focus-visible:ring-2 focus-visible:ring-offset-1"
          >
            <Icon name="trash" className="size-4" />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2.5">
        {COMPONENT_ORDER.map((kind) => {
          const options = groups.get(kind);
          if (!options?.length) return null;
          const current = selected.find((e) => sectionComponent(e.section) === kind);
          const hasConflict = current
            ? conflictingIds.has(`${current.code}::${current.section}::${current.term}`)
            : false;
          return (
            <label key={kind} className="flex flex-col gap-1">
              <span className="text-on-surface-variant text-xs font-medium">{COMPONENT_LABELS[kind]}</span>
              <select
                value={current?.section ?? ""}
                onChange={(event) => {
                  const next = options.find((s) => s.section === event.target.value);
                  if (next) addEntry(doc, next);
                  else if (current) removeEntry(current.code, current.section, current.term);
                }}
                className={`neu-inset bg-surface text-on-surface focus-visible:ring-primary/40 h-10 w-full rounded-lg px-2.5 text-xs focus-visible:ring-2 focus-visible:ring-offset-1 ${
                  hasConflict ? "ring-error/60 ring-2" : ""
                }`}
              >
                <option value="">Choose {COMPONENT_LABELS[kind].toLowerCase()}</option>
                {options.map((section) => (
                  <option key={section.section} value={section.section}>
                    {sectionOption(section)}
                  </option>
                ))}
              </select>
              {hasConflict && (
                <span className="text-error inline-flex items-center gap-1 text-xs">
                  <Icon name="alert" className="size-3.5" /> Conflicts with another selected section.
                </span>
              )}
              {current?.snapshot.status && !/open|active|available/i.test(current.snapshot.status) && (
                <span className="text-tertiary text-xs">Status: {current.snapshot.status}</span>
              )}
            </label>
          );
        })}
      </div>
    </article>
  );
}

function EmptyGrid() {
  return (
    <div className="grid h-full min-h-[28rem] w-full place-items-center p-8 text-center">
      <div className="max-w-sm">
        <span className="bg-surface-container-low text-primary mx-auto mb-4 grid size-11 place-items-center rounded-xl">
          <Icon name="calendar" className="size-5" />
        </span>
        <h3 className="text-base font-medium">Build your first timetable</h3>
        <p className="text-muted mt-1.5 text-sm leading-relaxed">
          Search for a course, then choose its lecture, lab, or tutorial. Times land on the weekly grid as you pick.
        </p>
      </div>
    </div>
  );
}

export function SchedulePlannerPane() {
  useScheduleSync();
  const api = useApi();
  const entries = useSchedule((s) => s.entries);
  const activeTerm = useSchedule((s) => s.activeTerm);
  const setActiveTerm = useSchedule((s) => s.setActiveTerm);
  const removeCourse = useSchedule((s) => s.removeCourse);
  const stale = useSchedule((s) => s.stale);
  const setStale = useSchedule((s) => s.setStale);
  const [query, setQuery] = useState("");
  const [docs, setDocs] = useState<Map<string, CourseDoc>>(new Map());
  const [catalogError, setCatalogError] = useState(false);
  const [mobileView, setMobileView] = useState<"courses" | "timetable">("courses");

  const resolveSingle = useCallback((code: string) => api.getCourse(code), [api]);
  const { list, status, error, rejected, record, lookup } = useCourseAutocomplete(query, { resolveSingle });

  useEffect(() => {
    if (!record) return;
    setDocs((current) => new Map(current).set(normalizeScheduleCode(record.code), record));
  }, [record]);

  const storedCodeKey = useMemo(
    () => [...new Set(entries.map((e) => normalizeScheduleCode(e.code)))].sort().join("\u0000"),
    [entries],
  );

  // Load full section lists for saved picks. Snapshots paint the grid first;
  // these records restore the section dropdowns after a reload.
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
    const terms = entries.map((e) => e.term);
    const pickedCourseCodes = new Set(entries.map((e) => normalizeScheduleCode(e.code)));
    for (const code of pickedCourseCodes) terms.push(...(docs.get(code)?.terms ?? []));
    if (record) terms.push(...record.terms);
    return sortTerms(terms);
  }, [docs, entries, record]);

  useEffect(() => {
    if (allTerms.length === 0) return;
    if (!activeTerm || !allTerms.includes(activeTerm)) setActiveTerm(allTerms[0]);
  }, [activeTerm, allTerms, setActiveTerm]);

  const visibleEntries = entries.filter((e) => e.term === activeTerm);
  const pickedCodes = new Set(visibleEntries.map((e) => normalizeScheduleCode(e.code)));
  const shownCodes = new Set(pickedCodes);
  if (record?.sections.some((s) => s.term === activeTerm)) shownCodes.add(normalizeScheduleCode(record.code));
  const shownDocs = [...shownCodes].map((code) => docs.get(code)).filter((doc): doc is CourseDoc => !!doc);
  const conflicts = conflictedIndices(toScheduled(visibleEntries));
  const conflictingIds = new Set(
    [...conflicts].map((index) => {
      const entry = visibleEntries[index];
      return `${entry.code}::${entry.section}::${entry.term}`;
    }),
  );
  const credits = [...pickedCodes].reduce((sum, code) => sum + (docs.get(code)?.credits ?? 0), 0);

  return (
    <div data-mobile-view={mobileView} className="schedule-planner flex h-full min-h-[34rem] flex-col overflow-hidden">
      <div className="border-border-subtle flex shrink-0 items-center gap-2 border-b px-3 pb-3">
        <div role="tablist" aria-label="Academic term" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
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
                    ? "bg-accent-subtle text-primary"
                    : "text-on-surface-variant hover:bg-surface-container-low"
                }`}
              >
                {termLabel(term)}
              </button>
            ))
          )}
        </div>
        {visibleEntries.length > 0 && (
          <div className="text-muted flex shrink-0 items-center gap-2 text-xs">
            <span className="schedule-wide-meta">{pickedCodes.size} courses</span>
            {credits > 0 && <span className="schedule-wide-meta">· {credits} credits</span>}
            {conflicts.size > 0 && (
              <span
                role="status"
                aria-label={`${conflicts.size} conflicting ${conflicts.size === 1 ? "section" : "sections"}`}
                className="bg-error-container/60 text-on-error-container inline-flex items-center gap-1 rounded-full px-2 py-1"
              >
                <Icon name="alert" className="size-3.5" />
                <span className="schedule-conflict-short">{conflicts.size}</span>
                <span className="schedule-conflict-long">
                  {conflicts.size} conflicting {conflicts.size === 1 ? "section" : "sections"}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {(stale || catalogError) && (
        <div className="border-tertiary/20 bg-tertiary-container/40 text-on-tertiary-container mx-3 mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs">
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
      )}

      <div className="schedule-view-toggle border-border-subtle shrink-0 gap-1 border-b p-2">
        <button
          type="button"
          aria-pressed={mobileView === "courses"}
          onClick={() => setMobileView("courses")}
          className={`focus-visible:ring-primary/40 flex-1 rounded-lg px-3 py-2 text-xs font-medium focus-visible:ring-2 ${
            mobileView === "courses" ? "bg-accent-subtle text-primary" : "text-on-surface-variant"
          }`}
        >
          Courses
        </button>
        <button
          type="button"
          aria-pressed={mobileView === "timetable"}
          onClick={() => setMobileView("timetable")}
          className={`focus-visible:ring-primary/40 flex-1 rounded-lg px-3 py-2 text-xs font-medium focus-visible:ring-2 ${
            mobileView === "timetable" ? "bg-accent-subtle text-primary" : "text-on-surface-variant"
          }`}
        >
          Timetable
          {conflicts.size > 0 && (
            <span className="bg-error-container text-on-error-container ml-1.5 rounded-full px-1.5 py-0.5">
              {conflicts.size}
            </span>
          )}
        </button>
      </div>

      <div className="schedule-layout min-h-0 flex-1">
        <aside className="schedule-courses border-border-subtle bg-surface h-full min-h-0 flex-col gap-3 border-b p-3">
          <div className="shrink-0">
            <h3 className="mb-2 text-sm font-medium">Find a course</h3>
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
          </div>

          <div className="border-border-subtle min-h-0 flex-1 overflow-y-auto border-t pt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">Courses in this term</h3>
              {visibleEntries.length > 0 && (
                <span className="text-muted font-mono text-xs">{visibleEntries.length} sections</span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {shownDocs.map((doc) => (
                <SectionPicker
                  key={`${doc.code}-${activeTerm}`}
                  doc={doc}
                  term={activeTerm}
                  conflictingIds={conflictingIds}
                />
              ))}
              {[...pickedCodes]
                .filter((code) => !docs.has(code))
                .map((code) => (
                  <div key={code} className="bg-surface-container-low flex items-start gap-2 rounded-lg p-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-sm font-medium">{code}</p>
                      <p className="text-muted mt-1 text-xs">Loading section options…</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCourse(code, activeTerm)}
                      aria-label={`Remove ${code} from ${activeTerm}`}
                      className="text-on-surface-variant hover:bg-error/10 hover:text-error focus-visible:ring-primary/40 grid size-9 shrink-0 place-items-center rounded-lg focus-visible:ring-2 focus-visible:ring-offset-1"
                    >
                      <Icon name="trash" className="size-4" />
                    </button>
                  </div>
                ))}
              {shownDocs.length === 0 && pickedCodes.size === 0 && !record && (
                <p className="text-muted py-4 text-sm">Choose a search result to see its available sections.</p>
              )}
            </div>
          </div>
        </aside>

        <section
          aria-label="Weekly timetable. Scroll sideways to see later days."
          className="schedule-timetable bg-surface-container-low/25 h-full min-h-0 min-w-0 overflow-auto"
        >
          {visibleEntries.length > 0 && (
            <p className="schedule-single-view-only text-muted bg-surface sticky left-0 z-30 px-3 py-1.5 text-xs">
              Scroll sideways to see later days.
            </p>
          )}
          <div className={visibleEntries.length === 0 ? "h-full min-w-0" : "h-full min-w-[42rem]"}>
            {visibleEntries.length === 0 ? <EmptyGrid /> : <TimetableGrid entries={visibleEntries} />}
          </div>
        </section>
      </div>
    </div>
  );
}
