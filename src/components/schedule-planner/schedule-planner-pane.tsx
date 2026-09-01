"use client";

import { CourseSearchField, useCourseAutocomplete, type Candidate } from "@/src/components/course-lookup/course-search";
import { Icon } from "@/src/components/icons";
import { useApi } from "@/src/components/providers";
import { ScheduleGrid, type ScheduleGridDragConfig } from "@/src/components/schedule/schedule-grid";
import { ScheduleWorkspace, type ScheduleWorkspaceView } from "@/src/components/schedule/schedule-workspace";
import { TermSwitcher } from "@/src/components/schedule/term-switcher";
import { ToastProvider } from "@/src/components/schedule/toast";
import { UploadDropzone } from "@/src/components/schedule/upload-dropzone";
import { useDialogFocus } from "@/src/components/schedule/use-dialog-focus";
import type { CourseDoc } from "@/src/lib/api-types";
import { normalizeDays, sectionGroup } from "@/src/lib/schedule";
import { selectAutomaticSections } from "@/src/lib/schedule-planner";
import { resolvePlannerImport, type PlannerImportReview } from "@/src/lib/schedule-planner-import";
import { buildScheduleGrid } from "@/src/lib/schedule/grid";
import type { DayCode, Schedule } from "@/src/lib/schedule/types";
import { minutesToFullLabel } from "@/src/lib/schedule/util/time";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlannerCourseModule, type PlannerCourseFocusRequest } from "./planner-course-module";
import {
  plannerConflictLabels,
  plannerDragOptions,
  plannerGridItems,
  plannerScheduledSections,
} from "./planner-grid-adapter";
import {
  entryId,
  normalizeScheduleCode,
  useSchedule,
  type ScheduleImportMode,
  type ScheduleImportSelection,
} from "./schedule-store";
import { useScheduleSync } from "./use-schedule-sync";

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

function importSectionOption(section: CourseDoc["sections"][number]): string {
  const days = normalizeDays(section.days);
  const when =
    section.start_time && section.end_time
      ? `${days.length ? days.join("/") : "TBA"} · ${section.start_time}–${section.end_time}`
      : "Time TBA";
  const instructor = section.instructor ? ` · ${section.instructor}` : "";
  const status = section.status ? ` · ${section.status}` : "";
  return `${section.section} · ${when}${instructor}${status}`;
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
                <article key={match.source.id} className="bg-surface-container-low rounded-lg p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium">{code || match.source.title}</h3>
                      <p className="text-muted mt-0.5 truncate text-xs">{match.source.title}</p>
                      <p className="text-on-surface-variant mt-1 text-xs">{meetingLabel}</p>
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
                            {importSectionOption(candidate)}
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
  const removeEntry = useSchedule((state) => state.removeEntry);
  const removeCourse = useSchedule((state) => state.removeCourse);
  const stale = useSchedule((state) => state.stale);
  const setStale = useSchedule((state) => state.setStale);
  const [query, setQuery] = useState("");
  const [docs, setDocs] = useState<Map<string, CourseDoc>>(new Map());
  const [catalogError, setCatalogError] = useState(false);
  const [mobileView, setMobileView] = useState<ScheduleWorkspaceView>("schedule");
  const [activeDay, setActiveDay] = useState<DayCode>("Mon");
  const [importReview, setImportReview] = useState<PlannerImportReview | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [commitPendingCode, setCommitPendingCode] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [failedCommitCode, setFailedCommitCode] = useState<string | null>(null);
  const [unavailableCodes, setUnavailableCodes] = useState<Set<string>>(new Set());
  const [focusRequest, setFocusRequest] = useState<(PlannerCourseFocusRequest & { code: string }) | null>(null);
  const [focusSearchOnControls, setFocusSearchOnControls] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const commitToken = useRef(0);
  const focusToken = useRef(0);
  const mounted = useRef(true);
  const queryRef = useRef(query);
  const invalidatedQueryRef = useRef(query);
  queryRef.current = query;

  const resolveSingle = useCallback((code: string) => api.getCourse(code), [api]);
  const { list, status, error, rejected, record, lookup } = useCourseAutocomplete(query, { resolveSingle });
  const plannerList = useMemo(
    () =>
      list
        ? {
            ...list,
            candidates: list.candidates.map((candidate) => ({
              ...candidate,
              code: normalizeScheduleCode(candidate.code),
            })),
          }
        : null,
    [list],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      commitToken.current += 1;
    };
  }, []);

  useEffect(() => {
    if (invalidatedQueryRef.current === query) return;
    invalidatedQueryRef.current = query;
    commitToken.current += 1;
    setCommitPendingCode(null);
    setCommitError(null);
    setFailedCommitCode(null);
  }, [query]);

  useEffect(() => {
    if (mobileView !== "controls" || !focusSearchOnControls) return;
    searchInputRef.current?.focus();
    setFocusSearchOnControls(false);
  }, [focusSearchOnControls, mobileView]);

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

  const storedCodeKey = useMemo(
    () => [...new Set(entries.map((entry) => normalizeScheduleCode(entry.code)))].sort().join("\u0000"),
    [entries],
  );

  useEffect(() => {
    if (!storedCodeKey) return;
    const codes = storedCodeKey.split("\u0000").filter((code) => !docs.has(code));
    if (codes.length === 0) return;
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
  }, [api, docs, storedCodeKey]);

  const allTerms = useMemo(() => {
    const terms = entries.map((entry) => entry.term);
    const pickedCourseCodes = new Set(entries.map((entry) => normalizeScheduleCode(entry.code)));
    for (const code of pickedCourseCodes) terms.push(...(docs.get(code)?.terms ?? []));
    return sortTerms(terms);
  }, [docs, entries]);

  useEffect(() => {
    if (allTerms.length === 0) return;
    if (!activeTerm || !allTerms.includes(activeTerm)) setActiveTerm(allTerms[0]);
  }, [activeTerm, allTerms, setActiveTerm]);

  const visibleEntries = useMemo(() => entries.filter((entry) => entry.term === activeTerm), [activeTerm, entries]);
  const gridItems = useMemo(() => plannerGridItems(visibleEntries), [visibleEntries]);
  const gridModel = useMemo(() => buildScheduleGrid(gridItems), [gridItems]);
  const pickedCodes = new Set(visibleEntries.map((entry) => normalizeScheduleCode(entry.code)));
  const conflictingIds = new Set(gridItems.filter((item) => item.conflict).map((item) => item.id));
  const conflictLabels = useMemo(() => plannerConflictLabels(visibleEntries), [visibleEntries]);
  const conflictCount = conflictingIds.size;
  const credits = [...pickedCodes].reduce((sum, code) => sum + (docs.get(code)?.credits ?? 0), 0);

  const requestCourseFocus = useCallback((code: string, group?: string) => {
    focusToken.current += 1;
    setFocusRequest({ code, group, token: focusToken.current });
  }, []);

  const clearCourseFocus = useCallback(() => setFocusRequest(null), []);

  const commitCandidate = useCallback(
    async (candidateCode: string) => {
      const code = normalizeScheduleCode(candidateCode);
      const expectedQuery = queryRef.current;
      const token = ++commitToken.current;
      setCommitPendingCode(code);
      setCommitError(null);
      setFailedCommitCode(null);

      let doc: CourseDoc;
      try {
        doc = record && normalizeScheduleCode(record.code) === code ? record : await api.getCourse(code);
      } catch {
        if (!mounted.current || token !== commitToken.current || queryRef.current !== expectedQuery) return;
        setCommitPendingCode(null);
        setCommitError(`Could not add ${code}. Try again.`);
        setFailedCommitCode(code);
        return;
      }
      if (!mounted.current || token !== commitToken.current || queryRef.current !== expectedQuery) return;

      const activeDuplicate = entries.some(
        (entry) => normalizeScheduleCode(entry.code) === code && entry.term === activeTerm,
      );
      setDocs((current) => new Map(current).set(code, doc));
      if (activeDuplicate) {
        setCommitPendingCode(null);
        setQuery("");
        requestCourseFocus(code);
        return;
      }

      const offeredTerms = sortTerms(doc.sections.flatMap((section) => (section.term ? [section.term] : [])));
      const targetTerm = offeredTerms.includes(activeTerm) ? activeTerm : offeredTerms[0];
      if (!targetTerm) {
        setUnavailableCodes((current) => new Set(current).add(code));
        setCommitPendingCode(null);
        return;
      }

      const duplicate = entries.some(
        (entry) => normalizeScheduleCode(entry.code) === code && entry.term === targetTerm,
      );
      if (duplicate) {
        if (targetTerm !== activeTerm) setActiveTerm(targetTerm);
        setCommitPendingCode(null);
        setQuery("");
        requestCourseFocus(code);
        return;
      }

      const selection = selectAutomaticSections(
        doc,
        targetTerm,
        plannerScheduledSections(entries.filter((entry) => entry.term === targetTerm)),
      );
      if (selection.sections.length === 0) {
        setUnavailableCodes((current) => new Set(current).add(code));
        setCommitPendingCode(null);
        return;
      }

      if (targetTerm === activeTerm) addCourseSections(doc, selection.sections);
      else addCourseSections(doc, selection.sections, { activateTerm: true });
      setCommitPendingCode(null);
      setQuery("");
      requestCourseFocus(code);
    },
    [activeTerm, addCourseSections, api, entries, record, requestCourseFocus, setActiveTerm],
  );

  const getCandidatePresentation = useCallback(
    (candidate: Candidate) => {
      const code = normalizeScheduleCode(candidate.code);
      const exactRecord = record && normalizeScheduleCode(record.code) === code ? record : null;
      const offeredTerms = sortTerms(
        exactRecord
          ? exactRecord.sections.flatMap((section) => (section.term ? [section.term] : []))
          : (candidate.terms ?? []),
      );
      const targetTerm = offeredTerms.includes(activeTerm) ? activeTerm : offeredTerms[0];
      const activeDuplicate = entries.some(
        (entry) => normalizeScheduleCode(entry.code) === code && entry.term === activeTerm,
      );
      if (activeDuplicate) {
        return {
          annotation: commitPendingCode === code ? "Added — focus course · Focusing…" : "Added — focus course",
          pending: commitPendingCode === code,
        };
      }
      if (!targetTerm || unavailableCodes.has(code)) {
        return { annotation: "No offered sections", disabled: true };
      }
      const duplicate = entries.some(
        (entry) => normalizeScheduleCode(entry.code) === code && entry.term === targetTerm,
      );
      const annotation = duplicate
        ? `Added — switch to ${targetTerm}`
        : targetTerm === activeTerm
          ? `Add to ${targetTerm}`
          : `Add and switch to ${targetTerm}`;
      return {
        annotation: commitPendingCode === code ? `${annotation} · ${duplicate ? "Switching…" : "Adding…"}` : annotation,
        pending: commitPendingCode === code,
      };
    },
    [activeTerm, commitPendingCode, entries, record, unavailableCodes],
  );

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
      <div className="border-tertiary/20 bg-tertiary-container/40 text-on-tertiary-container flex shrink-0 items-start gap-2 rounded-lg border px-3 py-2 text-xs">
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
      {allTerms.length === 0 ? (
        <span className="text-muted px-2 py-1.5 text-xs">Terms appear after you add a course.</span>
      ) : (
        <TermSwitcher
          terms={allTerms.map((term) => ({ key: term, label: termLabel(term) }))}
          selected={activeTerm}
          onSelect={setActiveTerm}
        />
      )}
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
    <div data-planner-controls className="flex h-full min-h-0 flex-col overflow-visible">
      <section data-planner-search className="relative z-20 shrink-0 p-4 pb-3">
        <h2 className="mb-2 text-sm font-medium">Find a course</h2>
        <CourseSearchField
          value={query}
          onChange={setQuery}
          onSelect={(code) => void commitCandidate(code)}
          onRetry={() => {
            if (failedCommitCode) void commitCandidate(failedCommitCode);
            else void lookup(query);
          }}
          status={status}
          list={plannerList}
          error={commitError ?? error}
          rejected={rejected}
          placeholder="CPSC 110, MATH 200, linear algebra"
          ariaLabel="Find a course to schedule"
          presentation="overlay"
          record={record}
          getCandidatePresentation={getCandidatePresentation}
          inputRef={searchInputRef}
          monospaceCodes={false}
        />
        <p className="text-muted mt-2 min-h-8 text-xs leading-4">
          {!query.trim() && status === "idle"
            ? "Search by course code, subject, or title, then choose a result."
            : "\u00a0"}
        </p>
      </section>

      <section
        data-planner-course-list
        aria-labelledby="planner-course-list-title"
        className="border-border-subtle min-h-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto border-t px-4 py-3"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 id="planner-course-list-title" className="text-sm font-medium">
            Courses in this term
          </h2>
          {visibleEntries.length > 0 ? (
            <span className="text-muted text-xs">{visibleEntries.length} sections</span>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          {[...pickedCodes].sort().map((code) => {
            const doc = docs.get(code);
            const selected = visibleEntries.filter((entry) => normalizeScheduleCode(entry.code) === code);
            return (
              <PlannerCourseModule
                key={code}
                code={code}
                title={doc?.title ?? selected[0]?.snapshot.title ?? "Loading course details…"}
                doc={doc}
                term={activeTerm}
                entries={selected}
                conflictingIds={conflictingIds}
                conflictLabels={conflictLabels}
                focusRequest={focusRequest?.code === code ? focusRequest : undefined}
                onSelectSection={(current, next) => {
                  if (next && doc) addEntry(doc, next);
                  else if (current) removeEntry(current.code, current.section, current.term);
                }}
                onRemove={() => removeCourse(code, activeTerm)}
                onFocusHandled={clearCourseFocus}
              />
            );
          })}
          {pickedCodes.size === 0 ? (
            <p className="text-muted py-4 text-sm leading-relaxed">
              Add a course from search to configure its lecture, lab, and tutorial here.
            </p>
          ) : null}
        </div>
      </section>

      <section data-planner-import className="border-border-subtle shrink-0 border-t p-4">
        <h2 className="text-on-surface text-sm font-medium">Workday import</h2>
        <p className="text-muted mt-1 mb-2 text-xs leading-relaxed">Add or replace registered sections from Excel.</p>
        {importLoading ? (
          <div role="status" className="bg-surface-container-low text-muted rounded-lg px-3 py-3 text-sm">
            Matching Workday sections to the catalog…
          </div>
        ) : (
          <UploadDropzone
            presentation="button"
            label="Import Workday schedule"
            onParsed={(schedule) => void prepareImport(schedule)}
          />
        )}
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
            if (!item) return;
            setMobileView("controls");
            requestCourseFocus(item.code, sectionGroup(item.section ?? ""));
          }}
          ariaLabel="Weekly course schedule"
          blockContentAlignment="center"
          drag={dragConfig}
          empty={{
            title: "Build your first timetable",
            description: "Search for a course, then choose its lecture, lab, or tutorial.",
            actionLabel: "Browse courses",
            onAction: () => {
              setMobileView("controls");
              setFocusSearchOnControls(true);
            },
          }}
        />
      </ScheduleWorkspace>

      {importReview ? (
        <PlannerImportDialog review={importReview} onApply={applyImport} onClose={() => setImportReview(null)} />
      ) : null}
    </>
  );
}
