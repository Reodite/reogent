"use client";

import { averageColorClass } from "@/src/components/course-lookup/grade-distribution-chart";
import { useApi } from "@/src/components/providers";
import { Button } from "@/src/components/ui/button";
import { RetryAlert, RetryState } from "@/src/components/ui/feedback";
import { Field, SearchInput, SelectInput, TextInput } from "@/src/components/ui/form-controls";
import { WorkspaceCanvas, WorkspacePage } from "@/src/components/ui/workspace";
import type { CourseDoc } from "@/src/lib/api-types";
import { usePersistentState } from "@/src/lib/use-persistent-state";
import { defaultSession, SESSIONS } from "@/src/server/course-records";
import { canonicalize } from "@/src/shared/course-code";
import { useCallback, useEffect, useRef, useState } from "react";

type ExplorerCourse = CourseDoc & {
  session?: string;
  level?: number | null;
  credits?: number | null;
  average?: number;
  reported?: number;
};

const SORTS = [
  { value: "students_desc", label: "Most students" },
  { value: "students_asc", label: "Fewest students" },
  { value: "code", label: "Code (A\u2013Z)" },
  { value: "average_desc", label: "Highest average" },
  { value: "average_asc", label: "Lowest average" },
] as const;

const AVG_BANDS = [
  { value: "90", label: "90+" },
  { value: "85", label: "85\u201389" },
  { value: "80", label: "80\u201384" },
  { value: "70", label: "70\u201379" },
  { value: "60", label: "60\u201369" },
  { value: "0", label: "<60" },
];

const ENROLL_BANDS = [
  { value: "800", label: "800+" },
  { value: "400", label: "400\u2013799" },
  { value: "100", label: "100\u2013399" },
  { value: "50", label: "50\u201399" },
  { value: "0", label: "<50" },
];

const SESSION_OPTIONS = SESSIONS.map((value) => ({ value, label: value }));
const YEAR_OPTIONS = [
  { value: "", label: "All years" },
  ...[100, 200, 300, 400, 500, 600].map((value) => ({ value: String(value), label: `${value}s` })),
];
const AVERAGE_OPTIONS = [{ value: "", label: "Any average" }, ...AVG_BANDS];
const ENROLLMENT_OPTIONS = [{ value: "", label: "Any size" }, ...ENROLL_BANDS];
const CREDIT_OPTIONS = [
  { value: "", label: "Any credits" },
  ...[4, 3, 2, 1].map((value) => ({ value: String(value), label: `${value} cr` })),
];

function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} htmlFor={id}>
      <SelectInput id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value || "all"} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectInput>
    </Field>
  );
}

function courseSearchParams(query: string): { q?: string; subject?: string; number?: string } {
  const parsed = canonicalize(query);
  if (parsed?.kind === "code") return { subject: parsed.subject, number: parsed.number };
  if (parsed?.kind === "partialCode") return { subject: parsed.subject, number: parsed.numberPrefix };
  if (parsed?.kind === "subject") return { subject: parsed.subject };
  return query ? { q: query } : {};
}

export function CourseExplorer({ onSelect }: { onSelect?: (code: string) => void }) {
  const api = useApi();
  const [session, setSession] = usePersistentState<string>("reodite.explorer.session", defaultSession());
  const [sort, setSort] = usePersistentState<string>("reodite.explorer.sort", "students_desc");
  const [queryInput, setQueryInput] = usePersistentState("reodite.explorer.query", "");
  const [query, setQuery] = useState("");
  const [level, setLevel] = usePersistentState<number | undefined>("reodite.explorer.level", undefined);
  const [faculty, setFaculty] = usePersistentState("reodite.explorer.faculty", "");
  const [credits, setCredits] = usePersistentState<number | undefined>("reodite.explorer.credits", undefined);
  const [avgBand, setAvgBand] = usePersistentState<string>("reodite.explorer.avgBand", "");
  const [studentBand, setStudentBand] = usePersistentState<string>("reodite.explorer.studentBand", "");
  const [courses, setCourses] = useState<ExplorerCourse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(queryInput.trim()), 250);
    return () => clearTimeout(timer);
  }, [queryInput]);

  const fetchExplorer = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    let result: { courses?: ExplorerCourse[]; subject_total?: number } | undefined;
    try {
      result = await api.searchCourses({
        ...courseSearchParams(query),
        session,
        sort,
        faculty: faculty || undefined,
      });
    } catch (caught) {
      if (id !== requestId.current) return;
      setError(caught instanceof Error ? caught.message : "Couldn't load courses.");
      setLoading(false);
      return;
    }
    if (id !== requestId.current) return;

    let filtered = result?.courses ?? [];
    if (level !== undefined) filtered = filtered.filter((course) => course.level === level);
    if (credits !== undefined) filtered = filtered.filter((course) => course.credits === credits);
    if (avgBand) {
      const minimum = Number(avgBand);
      filtered = filtered.filter((course) => {
        const average = course.average;
        if (average == null) return false;
        if (minimum === 90) return average >= 90;
        if (minimum === 85) return average >= 85 && average < 90;
        if (minimum === 80) return average >= 80 && average < 85;
        if (minimum === 70) return average >= 70 && average < 80;
        if (minimum === 60) return average >= 60 && average < 70;
        return average < 60;
      });
    }
    if (studentBand) {
      const minimum = Number(studentBand);
      filtered = filtered.filter((course) => {
        const reported = course.reported;
        if (reported == null) return false;
        if (minimum === 800) return reported >= 800;
        if (minimum === 400) return reported >= 400 && reported < 800;
        if (minimum === 100) return reported >= 100 && reported < 400;
        if (minimum === 50) return reported >= 50 && reported < 100;
        return reported < 50;
      });
    }

    setCourses(filtered);
    const filteredClientSide = avgBand !== "" || studentBand !== "" || level !== undefined || credits !== undefined;
    setTotal(filteredClientSide || result?.subject_total == null ? filtered.length : result.subject_total);
    setPage(1);
    setLoading(false);
  }, [api, query, session, sort, level, faculty, credits, avgBand, studentBand]);

  useEffect(() => {
    fetchExplorer();
  }, [fetchExplorer]);

  useEffect(
    () => () => {
      requestId.current += 1;
    },
    [],
  );

  const effectivePageSize = 100;
  const paged = courses.slice((page - 1) * effectivePageSize, page * effectivePageSize);
  const totalPages = Math.max(1, Math.ceil(courses.length / effectivePageSize));
  const activeFilterCount = [
    faculty !== "",
    level !== undefined,
    credits !== undefined,
    avgBand !== "",
    studentBand !== "",
  ].filter(Boolean).length;
  const hasFilters = queryInput !== "" || activeFilterCount > 0;

  function resetAdvancedFilters() {
    setFaculty("");
    setLevel(undefined);
    setCredits(undefined);
    setAvgBand("");
    setStudentBand("");
  }

  function clearAllFilters() {
    setQueryInput("");
    resetAdvancedFilters();
  }

  return (
    <WorkspacePage
      composition="single"
      title="Course lookup"
      description="Find a course, compare recent enrollment and grades, then open its full record."
      notice={
        error && courses.length > 0 ? (
          <RetryAlert variant="soft" onRetry={() => fetchExplorer()}>
            Couldn't refresh courses. Showing the previous results.
          </RetryAlert>
        ) : null
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div
          data-course-command
          className="grid shrink-0 grid-cols-2 items-end gap-3 @min-[55rem]:grid-cols-[minmax(18rem,1fr)_9rem_11rem_auto]"
        >
          <Field label="Find a course" htmlFor="course-explorer-search" className="col-span-2 @min-[55rem]:col-span-1">
            <SearchInput
              id="course-explorer-search"
              type="text"
              value={queryInput}
              onChange={(event) => setQueryInput(event.target.value)}
              onClear={() => setQueryInput("")}
              placeholder="Course code, subject, or title"
            />
          </Field>
          <FilterSelect
            id="course-explorer-session"
            label="Session"
            value={session}
            options={SESSION_OPTIONS}
            onChange={setSession}
          />
          <FilterSelect id="course-explorer-sort" label="Sort by" value={sort} options={SORTS} onChange={setSort} />
          <Button
            variant="outline"
            size="field"
            aria-expanded={filtersOpen}
            aria-controls="course-explorer-advanced-filters"
            onClick={() => setFiltersOpen((open) => !open)}
            className="col-span-2 w-full @min-[55rem]:col-span-1"
          >
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </Button>
        </div>

        {filtersOpen ? (
          <section
            id="course-explorer-advanced-filters"
            aria-label="Advanced course filters"
            className="border-border-subtle bg-surface-container-low grid shrink-0 grid-cols-2 items-end gap-3 rounded-xl border p-3 @min-[55rem]:grid-cols-6"
          >
            <FilterSelect
              id="course-explorer-level"
              label="Year"
              value={level == null ? "" : String(level)}
              options={YEAR_OPTIONS}
              onChange={(value) => setLevel(value ? Number(value) : undefined)}
            />
            <FilterSelect
              id="course-explorer-average"
              label="Average"
              value={avgBand}
              options={AVERAGE_OPTIONS}
              onChange={setAvgBand}
            />
            <FilterSelect
              id="course-explorer-enrollment"
              label="Enrollment"
              value={studentBand}
              options={ENROLLMENT_OPTIONS}
              onChange={setStudentBand}
            />
            <FilterSelect
              id="course-explorer-credits"
              label="Credits"
              value={credits == null ? "" : String(credits)}
              options={CREDIT_OPTIONS}
              onChange={(value) => setCredits(value ? Number(value) : undefined)}
            />
            <Field label="Faculty" htmlFor="course-explorer-faculty" className="col-span-2 @min-[55rem]:col-span-1">
              <TextInput
                id="course-explorer-faculty"
                type="text"
                value={faculty}
                onChange={(event) => setFaculty(event.target.value)}
                placeholder="Faculty of Science"
                controlSize="compact"
              />
            </Field>
            <Button variant="ghost" size="field" disabled={activeFilterCount === 0} onClick={resetAdvancedFilters}>
              Reset filters
            </Button>
          </section>
        ) : null}

        <div className="min-h-0 flex-1">
          <WorkspaceCanvas overflow="hidden">
            <div aria-busy={loading} className="flex h-full min-h-0 flex-col">
              {error && courses.length === 0 ? (
                <RetryState
                  title="Courses unavailable"
                  message="The course catalog could not be loaded."
                  onRetry={() => fetchExplorer()}
                  className="min-h-0 flex-1 justify-center p-6"
                />
              ) : loading && courses.length === 0 ? (
                <div role="status" aria-label="Loading courses" className="flex min-h-0 flex-1 flex-col gap-2 p-3">
                  {[0, 1, 2, 3, 4].map((index) => (
                    <div
                      key={index}
                      className="bg-surface-container-low/60 flex h-11 items-center gap-3 rounded-lg px-3"
                    >
                      <span className="bg-surface-container h-3 w-20 animate-pulse rounded" />
                      <span className="bg-surface-container h-3 flex-1 animate-pulse rounded" />
                    </div>
                  ))}
                </div>
              ) : !error && courses.length === 0 ? (
                <div className="text-muted flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm">
                  <p>No courses match this search.</p>
                  {hasFilters ? (
                    <Button variant="outline" size="pill" onClick={clearAllFilters}>
                      Clear search and filters
                    </Button>
                  ) : null}
                </div>
              ) : courses.length > 0 ? (
                <div className="min-h-0 flex-1 overflow-auto">
                  <table className="w-full table-fixed text-sm sm:table-auto">
                    <caption className="sr-only">Course list for {session}</caption>
                    <thead className="sticky top-0 z-10">
                      <tr>
                        <th
                          scope="col"
                          className="bg-surface-container text-muted w-28 px-3 py-2 text-left text-xs font-semibold"
                        >
                          Code
                        </th>
                        <th
                          scope="col"
                          className="bg-surface-container text-muted px-3 py-2 text-left text-xs font-semibold"
                        >
                          Course name
                        </th>
                        <th
                          scope="col"
                          className="bg-surface-container text-muted px-3 py-2 text-right text-xs font-semibold max-sm:hidden"
                        >
                          Students
                        </th>
                        <th
                          scope="col"
                          className="bg-surface-container text-muted px-3 py-2 text-right text-xs font-semibold max-sm:hidden"
                        >
                          Average
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map((course) => {
                        const mobileFacts = [
                          course.reported != null ? `${course.reported.toLocaleString()} students` : null,
                          course.average != null ? `${course.average.toFixed(1)}% avg` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ");
                        return (
                          <tr
                            key={course.code}
                            className="border-surface-container hover:bg-surface-container-low relative border-t transition-colors"
                          >
                            <td className="px-3 py-1.5">
                              <button
                                type="button"
                                onClick={() => onSelect?.(course.code)}
                                className="hover:text-primary focus-visible:after:ring-primary/40 -mx-1.5 min-h-11 rounded-md px-1.5 font-mono text-xs font-medium after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset sm:min-h-8"
                              >
                                {course.code}
                              </button>
                            </td>
                            <td className="text-on-surface-variant min-w-0 px-3 py-1.5 text-xs">
                              <span className="block truncate">{course.title}</span>
                              {mobileFacts ? (
                                <span className="text-muted mt-0.5 block truncate sm:hidden">{mobileFacts}</span>
                              ) : null}
                            </td>
                            <td className="px-3 py-1.5 text-right font-mono text-xs whitespace-nowrap max-sm:hidden">
                              {course.reported != null ? course.reported.toLocaleString() : "—"}
                            </td>
                            <td
                              className={`px-3 py-1.5 text-right font-mono text-xs whitespace-nowrap max-sm:hidden ${
                                course.average != null ? averageColorClass(course.average) : "text-muted"
                              }`}
                            >
                              {course.average != null ? course.average.toFixed(1) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : null}

              <footer className="border-border-subtle flex min-h-17 shrink-0 flex-wrap items-center justify-between gap-2 border-t p-3 sm:min-h-15">
                <span className="text-muted text-xs">
                  {total.toLocaleString()} course{total === 1 ? "" : "s"} · {session}
                </span>
                {courses.length > effectivePageSize ? (
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="compact"
                      disabled={page <= 1}
                      onClick={() => setPage((value) => Math.max(1, value - 1))}
                    >
                      Prev
                    </Button>
                    <span className="text-muted min-w-14 text-center text-xs">
                      Page {page} / {totalPages}
                    </span>
                    <Button
                      size="compact"
                      disabled={page >= totalPages}
                      onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                    >
                      Next
                    </Button>
                  </div>
                ) : null}
              </footer>
            </div>
          </WorkspaceCanvas>
        </div>
      </div>
    </WorkspacePage>
  );
}
