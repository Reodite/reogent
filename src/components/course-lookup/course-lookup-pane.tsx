"use client";

import { CourseDetailCard } from "@/src/components/course-lookup/course-detail-card";
import { Icon } from "@/src/components/icons";
import { useApi } from "@/src/components/providers";
import type { PaneState } from "@/src/components/shell/pane-registry";
import type { CourseDoc } from "@/src/lib/api-types";
import { ApiError } from "@/src/lib/api-types";
import { canonicalize, isOkanagan } from "@/src/shared/course-code";
import { useCallback, useEffect, useRef, useState } from "react";

type Candidate = { code: string; subject: string; number: string; title: string };

const LEVEL_OP: Record<string, "eq" | "plus" | "minus"> = { "=": "eq", "+": "plus", "-": "minus" };
const DEBOUNCE_MS = 250;

function parseLevel(input: string): { subject: string; level: "eq" | "plus" | "minus"; digit: number } | null {
  const m = input.trim().match(/^([A-Za-z]{2,4})\s*([=+-])\s*([1-5])$/);
  if (!m) return null;
  return { subject: m[1].toUpperCase(), level: LEVEL_OP[m[2]], digit: Number(m[3]) };
}

function toCandidate(doc: CourseDoc): Candidate {
  return { code: doc.code, subject: doc.subject, number: doc.number, title: doc.title };
}

export function CourseLookupPane({ state, setState }: { state: PaneState; setState: (s: Partial<PaneState>) => void }) {
  const api = useApi();
  const [code, setCode] = useState(((state.code as string | undefined) ?? "") as string);
  const [record, setRecord] = useState<CourseDoc | null>(null);
  const [list, setList] = useState<{ courses: Candidate[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading">("idle");

  const reqToken = useRef(0);

  const lookup = useCallback(
    async (input: string) => {
      const trimmed = input.trim();
      if (!trimmed) {
        setRecord(null);
        setList(null);
        setError(null);
        setRejected(false);
        setStatus("idle");
        return;
      }
      if (isOkanagan(trimmed)) {
        setRejected(true);
        setRecord(null);
        setList(null);
        setError(null);
        setStatus("idle");
        return;
      }
      setRejected(false);
      setStatus("loading");
      setError(null);
      setState({ code: trimmed });
      const my = ++reqToken.current;

      const level = parseLevel(trimmed);
      try {
        if (level) {
          const res = await api.searchCourses({ subject: level.subject, level: level.level, digit: level.digit });
          if (my !== reqToken.current) return;
          const courses = res.courses.map(toCandidate);
          setRecord(null);
          setList({ courses, total: res.subject_total ?? courses.length });
          setStatus("idle");
          return;
        }
        const canonical = canonicalize(trimmed);
        if (canonical?.kind === "code") {
          try {
            const rec = await api.getCourse(`${canonical.subject} ${canonical.number}`);
            if (my !== reqToken.current) return;
            setRecord(rec);
            setList(null);
            setStatus("idle");
            return;
          } catch (e) {
            if (e instanceof ApiError && e.status === 404) {
              // ponytail: q-search spans all fields and Meilisearch ranks by
              // relevance, surfacing APSC 160 and ELEC 331 for "CPSC 101".
              // Narrow by subject + exact number so a dead code lands on a
              // no-results state instead of fuzzy spew.
              const res = await api.searchCourses({ subject: canonical.subject });
              if (my !== reqToken.current) return;
              const courses = res.courses.filter((c) => c.number === canonical.number).map(toCandidate);
              setRecord(null);
              setList({ courses, total: courses.length });
              setStatus("idle");
              return;
            }
            throw e;
          }
        }
        if (canonical?.kind === "partialCode") {
          // ponytail: server-side substring filter on `number` keeps "CPSC 11"
          // scoped to the typed subject and ranks ascending so the smallest
          // completion (110 for "11") surfaces first. If the subject part
          // isn't a real catalogue subject (e.g. "calc "), drop the number and
          // free-text q-search the subject-only fragment so "calc 3" lands on
          // Calculus III via Meilisearch's prefix match.
          const res = await api.searchCourses({ subject: canonical.subject, number: canonical.numberPrefix });
          if (my !== reqToken.current) return;
          if (res.courses.length > 0) {
            setRecord(null);
            setList({ courses: res.courses.map(toCandidate), total: res.subject_total ?? res.courses.length });
            setStatus("idle");
            return;
          }
          const qres = await api.searchCourses({ q: canonical.subject });
          if (my !== reqToken.current) return;
          const courses = qres.courses.slice(0, 8).map(toCandidate);
          setRecord(null);
          setList({ courses, total: courses.length });
          setStatus("idle");
          return;
        }
        if (canonical?.kind === "subject") {
          const res = await api.searchCourses({ subject: canonical.subject });
          if (my !== reqToken.current) return;
          const courses = res.courses.map(toCandidate);
          if (courses.length > 0) {
            setRecord(null);
            setList({ courses, total: res.subject_total ?? courses.length });
            setStatus("idle");
            return;
          }
          // No exact subject — keep only q-fuzzy hits whose subject carries
          // `canonical.subject` as a prefix, so "CPS" surfaces CPSC/CPEN rather
          // than courses whose titles merely mention "CPS".
          const fuzzy = await api.searchCourses({ q: canonical.subject });
          if (my !== reqToken.current) return;
          const lower = canonical.subject.toLowerCase();
          const prefixMatches = fuzzy.courses
            .filter((c) =>
              c.subject
                .replace(/_V$|_O$/, "")
                .toLowerCase()
                .startsWith(lower),
            )
            .map(toCandidate);
          setRecord(null);
          setList({ courses: prefixMatches, total: prefixMatches.length });
          setStatus("idle");
          return;
        }
        const res = await api.searchCourses({ q: trimmed });
        if (my !== reqToken.current) return;
        const courses = res.courses.map(toCandidate);
        setRecord(null);
        setList({ courses, total: courses.length });
        setStatus("idle");
      } catch (e) {
        if (my !== reqToken.current) return;
        setRecord(null);
        setList(null);
        setError(e instanceof Error ? e.message : "Lookup failed");
        setStatus("idle");
      }
    },
    [api, setState],
  );

  // Live debounced search on `code`.
  useEffect(() => {
    const t = setTimeout(() => lookup(code), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [code, lookup]);

  const trimmed = code.trim();

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="relative">
        <Icon
          name="search"
          className="text-on-surface-variant pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Search a course code or subject — CPSC, MATH 200, CPSC+1"
          aria-label="Course code"
          aria-invalid={rejected ? "true" : undefined}
          aria-errormessage={rejected ? "code-error" : undefined}
          className="neu-inset bg-surface-container-low text-on-surface focus-visible:ring-primary/40 aria-[invalid=true]:ring-error/30 h-11 w-full rounded-lg pr-9 pl-9 text-sm focus-visible:ring-2 focus-visible:ring-offset-1 aria-[invalid=true]:ring-2"
        />
        {trimmed && (
          <button
            type="button"
            onClick={() => setCode("")}
            aria-label="Clear search"
            className="text-on-surface-variant hover:text-on-surface focus-visible:ring-primary/40 absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-md focus-visible:ring-2 focus-visible:ring-offset-1"
          >
            <Icon name="close" className="size-4" />
          </button>
        )}
      </div>

      {rejected && (
        <p
          id="code-error"
          role="alert"
          className="border-error/30 bg-error-container/30 text-error rounded-lg border px-3 py-2 text-xs"
        >
          Okanagan campus codes aren't in this catalog. Try a Vancouver course.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="border-error/30 bg-error-container/30 text-error rounded-lg border px-3 py-2 text-sm"
        >
          {code} could not be reached.{" "}
          <button type="button" onClick={() => lookup(code)} className="text-primary underline">
            Retry
          </button>
        </p>
      )}

      {status === "loading" && (
        <div role="status" aria-busy="true" className="flex flex-col gap-1.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="bg-surface-container-low/60 flex h-11 animate-pulse items-center gap-3 rounded-lg px-3"
            >
              <span className="bg-surface-container h-3 w-16 animate-pulse rounded" />
              <span className="bg-surface-container h-3 flex-1 animate-pulse rounded" />
            </div>
          ))}
        </div>
      )}

      {list && status === "idle" && list.courses.length > 0 && (
        <>
          <p className="text-on-surface-variant px-1 text-xs">
            {list.courses.length}
            {list.courses.length === 1 ? " match" : " matches"}
          </p>
          <div data-course-list className="flex flex-col gap-1.5 overflow-auto">
            {list.courses.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => setCode(c.code)}
                className="neu-raised bg-surface hover:bg-surface-container-low focus-visible:ring-primary/40 flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-left focus-visible:ring-2 focus-visible:ring-offset-1 active:scale-[0.99]"
              >
                <span className="font-mono text-sm font-medium tracking-tight">{c.code}</span>
                <span className="text-on-surface-variant truncate text-xs">{c.title}</span>
              </button>
            ))}
            {list.total > list.courses.length && (
              <p className="text-muted px-1 text-xs">
                Showing first {list.courses.length} of {list.total}.
              </p>
            )}
          </div>
        </>
      )}

      {list && status === "idle" && list.courses.length === 0 && !error && !rejected && (
        <p className="text-muted px-1 text-sm">No courses matching {trimmed}.</p>
      )}

      {record && <CourseDetailCard record={record} />}

      {!trimmed && !record && !list && !error && !rejected && (
        <p className="text-muted text-sm">Start typing a course code or subject to see results.</p>
      )}
    </div>
  );
}
