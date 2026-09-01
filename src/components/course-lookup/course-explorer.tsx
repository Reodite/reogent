"use client";

import { averageColorClass } from "@/src/components/course-lookup/grade-distribution-chart";
import { useApi } from "@/src/components/providers";
import { Button } from "@/src/components/ui/button";
import { RetryAlert, RetryState } from "@/src/components/ui/feedback";
import { Field, SearchInput, SelectInput, TextInput } from "@/src/components/ui/form-controls";
import {
  WorkspaceCanvas,
  WorkspacePage,
  WorkspacePanel,
  WorkspaceRail,
  type WorkspaceView,
} from "@/src/components/ui/workspace";
import type { CourseDoc } from "@/src/lib/api-types";
import { usePersistentState } from "@/src/lib/use-persistent-state";
import { defaultSession, SESSIONS } from "@/src/server/course-records";
import { useCallback, useEffect, useState } from "react";

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
      <SelectInput id={id} value={value} onChange={(event) => onChange(event.target.value)} controlSize="compact">
        {options.map((option) => (
          <option key={option.value || "all"} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectInput>
    </Field>
  );
}

export function CourseExplorer({ onSelect }: { onSelect?: (code: string) => void }) {
  const api = useApi();
  // Filters persist in the browser so swapping tabs/pages (or reloading)
  // brings the browse view back exactly as the user left it.
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
  const [mobileView, setMobileView] = useState<WorkspaceView>("rail");

  // Debounce the search field so typing doesn't refetch per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput.trim()), 250);
    return () => clearTimeout(t);
  }, [queryInput]);

  const fetchExplorer = useCallback(async () => {
    setLoading(true);
    setError(null);
    let res: { courses?: ExplorerCourse[]; subject_total?: number } | undefined;
    try {
      res = await api.searchCourses({
        q: query || undefined,
        session,
        sort,
        faculty: faculty || undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load courses.");
      setLoading(false);
      return;
    }
    let all = res?.courses ?? [];
    // Band and year facets narrow client-side; the API has no indexed predicates for them.
    if (level !== undefined) all = all.filter((c) => c.level === level);
    if (credits !== undefined) all = all.filter((c) => c.credits === credits);
    if (avgBand) {
      const n = Number(avgBand);
      all = all.filter((c) => {
        const a = c.average;
        if (a == null) return false;
        if (n === 90) return a >= 90;
        if (n === 85) return a >= 85 && a < 90;
        if (n === 80) return a >= 80 && a < 85;
        if (n === 70) return a >= 70 && a < 80;
        if (n === 60) return a >= 60 && a < 70;
        return a < 60;
      });
    }
    if (studentBand) {
      const n = Number(studentBand);
      all = all.filter((c) => {
        const r = c.reported;
        if (r == null) return false;
        if (n === 800) return r >= 800;
        if (n === 400) return r >= 400 && r < 800;
        if (n === 100) return r >= 100 && r < 400;
        if (n === 50) return r >= 50 && r < 100;
        return r < 50;
      });
    }
    setCourses(all);
    const filteredClientSide = avgBand !== "" || studentBand !== "" || level !== undefined || credits !== undefined;
    setTotal(filteredClientSide || res?.subject_total == null ? all.length : res.subject_total);
    setPage(1);
    setLoading(false);
  }, [api, query, session, sort, level, faculty, credits, avgBand, studentBand]);

  useEffect(() => {
    fetchExplorer();
  }, [fetchExplorer]);

  const effectivePageSize = 100;
  const paged = courses.slice((page - 1) * effectivePageSize, page * effectivePageSize);
  const totalPages = Math.max(1, Math.ceil(courses.length / effectivePageSize));
  const hasFilters =
    queryInput !== "" ||
    faculty !== "" ||
    level !== undefined ||
    credits !== undefined ||
    avgBand !== "" ||
    studentBand !== "";

  function clearFilters() {
    setQueryInput("");
    setFaculty("");
    setLevel(undefined);
    setCredits(undefined);
    setAvgBand("");
    setStudentBand("");
  }

  return (
    <WorkspacePage
      composition="split"
      title="Course lookup"
      description="Search UBC courses, grades, prerequisites, and sections."
      notice={
        error && courses.length > 0 ? (
          <RetryAlert variant="soft" onRetry={() => fetchExplorer()}>
            Couldn't refresh courses. Showing the previous results.
          </RetryAlert>
        ) : null
      }
      view={mobileView}
      onViewChange={setMobileView}
      mainLabel="Courses"
      railLabel="Filters"
      rail={
        <WorkspaceRail>
          <WorkspacePanel title="Filters" description={`${total.toLocaleString()} courses`} padding="md">
            <div className="flex flex-col gap-3">
              <Field label="Search" htmlFor="course-explorer-search">
                <SearchInput
                  id="course-explorer-search"
                  type="text"
                  value={queryInput}
                  onChange={(event) => setQueryInput(event.target.value)}
                  onClear={() => setQueryInput("")}
                  placeholder="Code, subject, or name"
                  density="rail"
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <FilterSelect
                  id="course-explorer-session"
                  label="Session"
                  value={session}
                  options={SESSION_OPTIONS}
                  onChange={setSession}
                />
                <FilterSelect
                  id="course-explorer-sort"
                  label="Sort by"
                  value={sort}
                  options={SORTS}
                  onChange={setSort}
                />
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
              </div>
              <Field label="Faculty" htmlFor="course-explorer-faculty">
                <TextInput
                  id="course-explorer-faculty"
                  type="text"
                  value={faculty}
                  onChange={(event) => setFaculty(event.target.value)}
                  placeholder="Faculty of Science"
                  controlSize="compact"
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="field" onClick={() => setMobileView("main")}>
                  Show courses
                </Button>
                {hasFilters ? (
                  <Button variant="outline" size="pill" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : null}
              </div>
            </div>
          </WorkspacePanel>
        </WorkspaceRail>
      }
    >
      <WorkspaceCanvas overflow="hidden">
        <div aria-busy={loading} className="flex h-full min-h-0 flex-col">
          {error && courses.length === 0 ? (
            <RetryState
              title="Courses unavailable"
              message="The course catalog could not be loaded."
              onRetry={() => fetchExplorer()}
              className="m-auto p-6"
            />
          ) : loading && courses.length === 0 ? (
            <div role="status" aria-label="Loading courses" className="flex flex-col gap-2 p-3">
              {[0, 1, 2, 3, 4].map((index) => (
                <div key={index} className="bg-surface-container-low/60 flex h-11 items-center gap-3 rounded-lg px-3">
                  <span className="bg-surface-container h-3 w-20 animate-pulse rounded" />
                  <span className="bg-surface-container h-3 flex-1 animate-pulse rounded" />
                </div>
              ))}
            </div>
          ) : !error && courses.length === 0 ? (
            <div className="text-muted m-auto flex flex-col items-center gap-3 p-6 text-center text-sm">
              <p>No courses match these filters.</p>
              {hasFilters ? (
                <Button variant="outline" size="pill" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : null}
            </div>
          ) : courses.length > 0 ? (
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <caption className="sr-only">Course list for {session}</caption>
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th
                      scope="col"
                      className="bg-surface-container text-muted px-3 py-2 text-left text-xs font-semibold"
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
                      className="bg-surface-container text-muted px-3 py-2 text-right text-xs font-semibold"
                    >
                      Students
                    </th>
                    <th
                      scope="col"
                      className="bg-surface-container text-muted px-3 py-2 text-right text-xs font-semibold"
                    >
                      Average
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paged.map((course) => (
                    <tr
                      key={course.code}
                      className="border-surface-container hover:bg-surface-container-low cursor-pointer border-t transition-colors"
                      onClick={() => onSelect?.(course.code)}
                    >
                      <td className="px-3 py-1.5">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onSelect?.(course.code);
                          }}
                          className="focus-visible:ring-primary/40 hover:text-primary -mx-1.5 min-h-11 rounded-md px-1.5 font-mono text-xs font-medium focus-visible:ring-2 focus-visible:ring-offset-1 sm:min-h-8"
                        >
                          {course.code}
                        </button>
                      </td>
                      <td className="text-on-surface-variant max-w-[16rem] truncate px-3 py-1.5 text-xs">
                        {course.title}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs whitespace-nowrap">
                        {course.reported != null ? course.reported.toLocaleString() : "—"}
                      </td>
                      <td
                        className={`px-3 py-1.5 text-right font-mono text-xs whitespace-nowrap ${
                          course.average != null ? averageColorClass(course.average) : "text-muted"
                        }`}
                      >
                        {course.average != null ? course.average.toFixed(1) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <footer className="border-border-subtle flex shrink-0 items-center justify-between gap-2 border-t p-3">
            <span className="text-muted text-xs">
              {total.toLocaleString()} course{total === 1 ? "" : "s"} · {session}
            </span>
            {courses.length > effectivePageSize ? (
              <div className="flex items-center gap-1.5">
                <Button size="compact" disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
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
    </WorkspacePage>
  );
}
