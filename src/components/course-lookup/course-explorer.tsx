"use client";

import { useApi } from "@/src/components/providers";
import type { CourseDoc } from "@/src/lib/api-types";
import { defaultSession, getTermLabel, gradeClass, SESSIONS } from "@/src/server/course-records";
import { useCallback, useEffect, useState } from "react";

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
  const [courses, setCourses] = useState<ExplorerCourse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 100;

  const fetch = useCallback(async () => {
    const res = await api.searchCourses({ q: query || undefined, session, sort: sort as unknown as string });
    // Client-side pagination: the /api/courses exploratory path returns up to 1000; slice locally.
    const all = (res.courses ?? []) as ExplorerCourse[];
    setCourses(all);
    setTotal(res.subject_total ?? all.length);
    setPage(1);
  }, [api, query, session, sort]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const paged = courses.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(courses.length / pageSize));

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
        <span className="text-muted text-xs">
          Page {page} of {totalPages}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded border px-2 py-1 text-xs disabled:opacity-50"
          >
            Prev
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
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
