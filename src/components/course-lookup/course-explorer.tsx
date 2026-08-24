"use client";

import { averageColorClass } from "@/src/components/course-lookup/grade-distribution-chart";
import { Icon } from "@/src/components/icons";
import { useApi } from "@/src/components/providers";
import type { CourseDoc } from "@/src/lib/api-types";
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

// Matches the CourseSearchField input recipe at a compact control height.
const controlCls =
  "neu-inset bg-surface-container-low text-on-surface focus-visible:ring-primary/40 h-9 w-auto rounded-lg px-2.5 text-xs focus-visible:ring-2 focus-visible:ring-offset-1";

export function CourseExplorer({ onSelect }: { onSelect?: (code: string) => void }) {
  const api = useApi();
  const [session, setSession] = useState<string>(defaultSession());
  const [sort, setSort] = useState<string>("students_desc");
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<number | undefined>(undefined);
  const [faculty, setFaculty] = useState("");
  const [credits, setCredits] = useState<number | undefined>(undefined);
  const [avgBand, setAvgBand] = useState<string>("");
  const [studentBand, setStudentBand] = useState<string>("");
  const [courses, setCourses] = useState<ExplorerCourse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative">
        <Icon
          name="search"
          className="text-on-surface-variant pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <input
          type="text"
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          placeholder="Search code, subject, or name"
          aria-label="Search courses"
          className="neu-inset bg-surface-container-low text-on-surface focus-visible:ring-primary/40 h-11 w-full rounded-lg pr-3 pl-9 text-sm focus-visible:ring-2 focus-visible:ring-offset-1"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <select
          aria-label="Session"
          value={session}
          onChange={(e) => setSession(e.target.value)}
          className={controlCls}
        >
          {SESSIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value)} className={controlCls}>
          {SORTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Year level"
          value={level ?? ""}
          onChange={(e) => setLevel(e.target.value ? Number(e.target.value) : undefined)}
          className={controlCls}
        >
          <option value="">All years</option>
          {[100, 200, 300, 400, 500, 600].map((n) => (
            <option key={n} value={n}>
              {n}s
            </option>
          ))}
        </select>
        <select
          aria-label="Average band"
          value={avgBand}
          onChange={(e) => setAvgBand(e.target.value)}
          className={controlCls}
        >
          <option value="">Any average</option>
          {AVG_BANDS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Enrollment band"
          value={studentBand}
          onChange={(e) => setStudentBand(e.target.value)}
          className={controlCls}
        >
          <option value="">Any size</option>
          {ENROLL_BANDS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Credits"
          value={credits ?? ""}
          onChange={(e) => setCredits(e.target.value ? Number(e.target.value) : undefined)}
          className={controlCls}
        >
          <option value="">Any credits</option>
          <option value="4">4 cr</option>
          <option value="3">3 cr</option>
          <option value="2">2 cr</option>
          <option value="1">1 cr</option>
        </select>
        <input
          type="text"
          value={faculty}
          onChange={(e) => setFaculty(e.target.value)}
          placeholder="Faculty of Science"
          aria-label="Faculty"
          className={`${controlCls} min-w-[10rem] flex-1`}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="border-error/30 bg-error-container/30 text-error rounded-lg border px-3 py-2 text-sm"
        >
          Couldn&apos;t load courses.{" "}
          <button
            type="button"
            onClick={() => fetchExplorer()}
            className="focus-visible:ring-primary/40 text-primary rounded-sm underline focus-visible:ring-2 focus-visible:ring-offset-1"
          >
            Retry
          </button>
        </p>
      )}

      {loading && courses.length === 0 && !error && (
        <div role="status" aria-busy="true" className="flex flex-col gap-1.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-surface-container-low/60 flex h-9 animate-pulse items-center gap-3 rounded-lg px-3"
            >
              <span className="bg-surface-container h-3 w-20 animate-pulse rounded" />
              <span className="bg-surface-container h-3 flex-1 animate-pulse rounded" />
            </div>
          ))}
        </div>
      )}

      {!loading && !error && courses.length === 0 && (
        <div className="text-muted flex flex-col items-center gap-2 px-1 py-8 text-sm">
          <p>No courses match these filters.</p>
          {(query || faculty || level !== undefined || credits !== undefined || avgBand || studentBand) && (
            <button
              type="button"
              onClick={() => {
                setQueryInput("");
                setFaculty("");
                setLevel(undefined);
                setCredits(undefined);
                setAvgBand("");
                setStudentBand("");
              }}
              className="text-primary border-primary hover:bg-accent-subtle focus-visible:ring-primary/40 inline-flex min-h-[44px] items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {!(loading && courses.length === 0) && !error && courses.length > 0 && (
        <div className="border-border-subtle overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Course list for {session}</caption>
            <thead>
              <tr>
                <th scope="col" className="bg-surface-container text-muted px-3 py-2 text-left text-xs font-semibold">
                  Code
                </th>
                <th scope="col" className="bg-surface-container text-muted px-3 py-2 text-left text-xs font-semibold">
                  Course Name
                </th>
                <th scope="col" className="bg-surface-container text-muted px-3 py-2 text-right text-xs font-semibold">
                  Students
                </th>
                <th scope="col" className="bg-surface-container text-muted px-3 py-2 text-right text-xs font-semibold">
                  Average
                </th>
              </tr>
            </thead>
            <tbody>
              {paged.map((c) => (
                <tr
                  key={c.code}
                  className="border-surface-container hover:bg-surface-container-low cursor-pointer border-t transition-colors"
                  onClick={() => onSelect?.(c.code)}
                >
                  <td className="px-3 py-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect?.(c.code);
                      }}
                      className="focus-visible:ring-primary/40 hover:text-primary -mx-1.5 rounded-md px-1.5 py-1 font-mono text-xs font-medium focus-visible:ring-2 focus-visible:ring-offset-1"
                    >
                      {c.code}
                    </button>
                  </td>
                  <td className="text-on-surface-variant max-w-[16rem] truncate px-3 py-1.5 text-xs">{c.title}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs whitespace-nowrap">
                    {c.reported != null ? c.reported.toLocaleString() : "\u2014"}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right font-mono text-xs whitespace-nowrap ${c.average != null ? averageColorClass(c.average) : "text-muted"}`}
                  >
                    {c.average != null ? c.average.toFixed(1) : "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-muted text-xs">
          {total.toLocaleString()} course{total === 1 ? "" : "s"} · {session}
        </span>
        {courses.length > effectivePageSize && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="neu-button bg-surface text-on-surface-variant h-9 rounded-lg px-2.5 text-xs font-medium transition-all duration-150 hover:-translate-y-px active:translate-y-px active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45"
            >
              Prev
            </button>
            <span className="text-muted min-w-14 text-center text-xs">
              Page {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="neu-button bg-surface text-on-surface-variant h-9 rounded-lg px-2.5 text-xs font-medium transition-all duration-150 hover:-translate-y-px active:translate-y-px active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
