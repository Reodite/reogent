"use client";

import { useApi } from "@/src/components/providers";
import type { CourseDoc } from "@/src/lib/api-types";
import { defaultSession, getTermLabel, gradeClass, SESSIONS } from "@/src/server/course-records";
import { useCallback, useEffect, useRef, useState } from "react";

type ExplorerCourse = CourseDoc & {
  session?: string;
  average?: number;
  reported?: number;
  buckets?: Record<string, number>;
};

const SORTS = [
  { value: "students_desc", label: "Students \u2193" },
  { value: "students_asc", label: "Students \u2191" },
  { value: "code", label: "Code" },
  { value: "average_desc", label: "Average \u2193" },
  { value: "average_asc", label: "Average \u2191" },
] as const;

export function CourseExplorer({ onSelect }: { onSelect?: (code: string) => void }) {
  const api = useApi();
  const [session, setSession] = useState<string>(defaultSession());
  const [sort, setSort] = useState<string>("students_desc");
  const [query, setQuery] = useState("");
  const [level, setLevel] = useState<number | undefined>(undefined);
  const [faculty, setFaculty] = useState("");
  const [credits, setCredits] = useState<number | undefined>(undefined);
  const [avgBand, setAvgBand] = useState<string>("");
  const [studentBand, setStudentBand] = useState<string>("");
  const [courses, setCourses] = useState<ExplorerCourse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<100 | 1000 | -1>(100);
  const fetchedSession = useRef<string>(session);

  const fetchExplorer = useCallback(async () => {
    const res = await api.searchCourses({
      q: query || undefined,
      session,
      sort: sort as unknown as string,
      level: level !== undefined ? (`eq` as const) : undefined,
      digit: level !== undefined ? level / 100 : undefined,
      subject: faculty || undefined,
    } as unknown as Record<string, unknown> as never);
    let all = (res.courses ?? []) as ExplorerCourse[];
    // Client-side facet narrowing for bands not yet indexed server-side
    if (credits !== undefined)
      all = all.filter((c) => (c as unknown as { credits: number | null }).credits === credits);
    if (level !== undefined) all = all.filter((c) => (c as unknown as { level: number | null }).level === level);
    if (avgBand) {
      const n = Number(avgBand);
      all = all.filter((c) => {
        const a = (c as ExplorerCourse).average;
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
        const r = (c as ExplorerCourse).reported;
        if (r == null) return false;
        if (n === 800) return r >= 800;
        if (n === 400) return r >= 400 && r < 800;
        if (n === 100) return r >= 100 && r < 400;
        if (n === 50) return r >= 50 && r < 100;
        return r < 50;
      });
    }
    setCourses(all);
    setTotal(
      res.subject_total != null && !avgBand && !studentBand && credits === undefined ? res.subject_total : all.length,
    );
    fetchedSession.current = session;
    setPage(1);
  }, [api, query, session, sort, level, faculty, credits, avgBand, studentBand]);

  useEffect(() => {
    fetchExplorer();
  }, [fetchExplorer]);

  const effectivePageSize = pageSize === -1 ? courses.length || 1 : pageSize;
  const paged = pageSize === -1 ? courses : courses.slice((page - 1) * effectivePageSize, page * effectivePageSize);
  const totalPages = pageSize === -1 ? 1 : Math.max(1, Math.ceil(courses.length / effectivePageSize));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search code, subject, name"
          className="bg-surface-container-low border-surface-container min-w-[180px] flex-1 rounded-lg border px-3 py-2 text-sm"
        />
        <select
          value={session}
          onChange={(e) => setSession(e.target.value)}
          className="bg-surface-container-low rounded-lg px-2 py-2 text-xs"
        >
          {SESSIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="bg-surface-container-low rounded-lg px-2 py-2 text-xs"
        >
          {SORTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          value={level ?? ""}
          onChange={(e) => setLevel(e.target.value ? Number(e.target.value) : undefined)}
          className="bg-surface-container-low rounded-lg px-2 py-1.5 text-xs"
        >
          <option value="">Year: All</option>
          {[100, 200, 300, 400, 500, 600].map((n) => (
            <option key={n} value={n}>
              {n}s
            </option>
          ))}
        </select>
        <select
          value={avgBand}
          onChange={(e) => setAvgBand(e.target.value)}
          className="bg-surface-container-low rounded-lg px-2 py-1.5 text-xs"
        >
          <option value="">Avg: All</option>
          <option value="90">&gt;90</option>
          <option value="85">85-89</option>
          <option value="80">80-84</option>
          <option value="70">70-79</option>
          <option value="60">60-69</option>
          <option value="0">&lt;60</option>
        </select>
        <select
          value={studentBand}
          onChange={(e) => setStudentBand(e.target.value)}
          className="bg-surface-container-low rounded-lg px-2 py-1.5 text-xs"
        >
          <option value="">Enroll: All</option>
          <option value="800">&gt;800</option>
          <option value="400">400-799</option>
          <option value="100">100-399</option>
          <option value="50">50-99</option>
          <option value="0">&lt;50</option>
        </select>
        <select
          value={credits ?? ""}
          onChange={(e) => setCredits(e.target.value ? Number(e.target.value) : undefined)}
          className="bg-surface-container-low rounded-lg px-2 py-1.5 text-xs"
        >
          <option value="">Credits: All</option>
          <option value="4">4 cr</option>
          <option value="3">3 cr</option>
          <option value="2">2 cr</option>
          <option value="1">1 cr</option>
        </select>
        <input
          value={faculty}
          onChange={(e) => setFaculty(e.target.value)}
          placeholder="Faculty"
          className="bg-surface-container-low border-surface-container min-w-[120px] rounded-lg border px-2 py-1.5 text-xs"
        />
      </div>
      <p className="text-muted text-xs">
        Showing {paged.length} of {total} courses {session && `· ${session}`}
      </p>
      <div className="overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-container text-muted text-xs">
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-left">Course Name</th>
              <th className="px-3 py-2 text-right">Students</th>
              <th className="px-3 py-2 text-left">Term</th>
              <th className="px-3 py-2 text-right">Average</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((c) => (
              <tr
                key={c.code}
                className="border-surface-container hover:bg-surface-container-low cursor-pointer border-t"
                onClick={() => onSelect?.(c.code)}
              >
                <td className="px-3 py-2 font-mono text-xs font-medium">{c.code}</td>
                <td className="text-on-surface-variant px-3 py-2 text-xs">{c.title}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">
                  {c.reported != null ? c.reported.toLocaleString() : "—"}
                </td>
                <td className="text-muted px-3 py-2 text-xs">
                  {getTermLabel((c as unknown as { term?: unknown }).term)}
                </td>
                <td
                  className={`px-3 py-2 text-right font-mono text-xs ${c.average != null ? gradeClass(c.average) : ""}`}
                >
                  {c.average != null ? `${c.average.toFixed(2)}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-muted text-xs">
            Page {page} of {totalPages}
          </span>
          <select
            value={String(pageSize)}
            onChange={(e) => {
              setPageSize(Number(e.target.value) as unknown as 100 | 1000 | -1);
              setPage(1);
            }}
            className="bg-surface-container-low rounded px-1 py-0.5 text-xs"
          >
            <option value="100">100 / page</option>
            <option value="1000">1000 / page</option>
            <option value="-1">Show all</option>
          </select>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={page <= 1 || pageSize === -1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border px-2 py-1 text-xs disabled:opacity-50"
          >
            Prev
          </button>
          <button
            type="button"
            disabled={page >= totalPages || pageSize === -1}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded border px-2 py-1 text-xs disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
