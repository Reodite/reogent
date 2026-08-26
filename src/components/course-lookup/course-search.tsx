"use client";

import { Icon } from "@/src/components/icons";
import { useApi } from "@/src/components/providers";
import type { CourseDoc } from "@/src/lib/api-types";
import { ApiError } from "@/src/lib/api-types";
import { canonicalize, isOkanagan } from "@/src/shared/course-code";
import { useCallback, useEffect, useRef, useState } from "react";

export type Candidate = { code: string; subject: string; number: string; title: string };

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

export type UseCourseAutocompleteOptions = {
  // Fetches the single record when the input canonicalizes to a full code. On 404,
  // the hook falls back to a subject+number-equals list.
  resolveSingle?: (code: string) => Promise<CourseDoc>;
};

export function useCourseAutocomplete(value: string, opts: UseCourseAutocompleteOptions = {}) {
  const api = useApi();
  const [list, setList] = useState<{ candidates: Candidate[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);
  const [record, setRecord] = useState<CourseDoc | null>(null);
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  // Token of the lookup currently in flight; the latest one wins, stale
  // responses are dropped.
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
      setError(null);
      const canonical = canonicalize(trimmed);

      if (canonical?.kind === "code") {
        if (opts.resolveSingle) {
          setStatus("loading");
          const my = ++reqToken.current;
          try {
            const rec = await opts.resolveSingle(`${canonical.subject} ${canonical.number}`);
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
              const candidates = res.courses.filter((c) => c.number === canonical.number).map(toCandidate);
              setRecord(null);
              setList({ candidates, total: candidates.length });
              setStatus("idle");
              return;
            }
            throw e;
          }
        }
        // No resolver: clear the list and settle idle.
        setRecord(null);
        setList(null);
        setStatus("idle");
        return;
      }

      setStatus("loading");
      const my = ++reqToken.current;
      const level = parseLevel(trimmed);
      try {
        if (level) {
          const res = await api.searchCourses({ subject: level.subject, level: level.level, digit: level.digit });
          if (my !== reqToken.current) return;
          const candidates = res.courses.map(toCandidate);
          setRecord(null);
          setList({ candidates, total: res.subject_total ?? candidates.length });
          setStatus("idle");
          return;
        }
        if (canonical?.kind === "partialCode") {
          // ponytail: server-side substring filter on `number` keeps "CPSC 11"
          // scoped to the typed subject and ranks ascending so the smallest
          // completion (110) surfaces first. If the subject part isn't a
          // real catalogue subject (e.g. "calc"), drop the partial number and
          // free-text q-search it so "calc 3" lands on Calculus III via
          // Meilisearch's prefix match.
          const res = await api.searchCourses({ subject: canonical.subject, number: canonical.numberPrefix });
          if (my !== reqToken.current) return;
          if (res.courses.length > 0) {
            setRecord(null);
            setList({ candidates: res.courses.map(toCandidate), total: res.subject_total ?? res.courses.length });
            setStatus("idle");
            return;
          }
          const qres = await api.searchCourses({ q: canonical.subject });
          if (my !== reqToken.current) return;
          const candidates = qres.courses.slice(0, 8).map(toCandidate);
          setRecord(null);
          setList({ candidates, total: candidates.length });
          setStatus("idle");
          return;
        }
        if (canonical?.kind === "subject") {
          const res = await api.searchCourses({ subject: canonical.subject });
          if (my !== reqToken.current) return;
          const candidates = res.courses.map(toCandidate);
          if (candidates.length > 0) {
            setRecord(null);
            setList({ candidates, total: res.subject_total ?? candidates.length });
            setStatus("idle");
            return;
          }
          // No exact subject — keep only q-fuzzy hits whose subject carries
          // `canonical.subject` as a prefix, so "CPS" surfaces CPSC/CPEN
          // rather than courses whose titles merely mention "CPS".
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
          setList({ candidates: prefixMatches, total: prefixMatches.length });
          setStatus("idle");
          return;
        }
        const res = await api.searchCourses({ q: trimmed });
        if (my !== reqToken.current) return;
        const candidates = res.courses.slice(0, 8).map(toCandidate);
        setRecord(null);
        setList({ candidates, total: candidates.length });
        setStatus("idle");
      } catch (e) {
        if (my !== reqToken.current) return;
        setRecord(null);
        setList(null);
        setError(e instanceof Error ? e.message : "Lookup failed");
        setStatus("idle");
      }
    },
    [api, opts.resolveSingle],
  );

  // Live debounced search on `value`.
  useEffect(() => {
    const t = setTimeout(() => lookup(value), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value, lookup]);

  return { list, status, error, rejected, record, lookup };
}

export type CourseSearchFieldProps = {
  value: string;
  onChange: (v: string) => void;
  onSelect?: (code: string) => void;
  onRetry?: () => void;
  status: "idle" | "loading";
  list: { candidates: Candidate[]; total: number } | null;
  error: string | null;
  rejected: boolean;
  placeholder?: string;
  ariaLabel?: string;
};

export function CourseSearchField({
  value,
  onChange,
  onSelect,
  onRetry,
  status,
  list,
  error,
  rejected,
  placeholder = "Search a course code or subject — CPSC, MATH 200, CPSC+1",
  ariaLabel = "Course code",
}: CourseSearchFieldProps) {
  const trimmed = value.trim();
  return (
    <>
      <div className="relative">
        <Icon
          name="search"
          className="text-on-surface-variant pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-invalid={rejected ? "true" : undefined}
          aria-errormessage={rejected ? "code-error" : undefined}
          className="neu-inset bg-surface-container-low text-on-surface focus-visible:ring-primary/40 aria-[invalid=true]:ring-error/30 h-11 w-full rounded-lg pr-9 pl-9 text-sm focus-visible:ring-2 focus-visible:ring-offset-1 aria-[invalid=true]:ring-2"
        />
        {trimmed && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="text-on-surface-variant hover:text-on-surface focus-visible:ring-primary/40 absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-md focus-visible:ring-2 focus-visible:ring-offset-1"
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
          {value} could not be reached.{" "}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="focus-visible:ring-primary/40 text-primary rounded-sm underline focus-visible:ring-2 focus-visible:ring-offset-1"
            >
              Retry
            </button>
          )}
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

      {list && status === "idle" && list.candidates.length > 0 && (
        <>
          <p className="text-on-surface-variant px-1 text-xs">
            {list.candidates.length}
            {list.candidates.length === 1 ? " match" : " matches"}
          </p>
          <div data-course-list className="flex flex-col gap-1.5 overflow-auto">
            {list.candidates.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => onSelect?.(c.code)}
                className="neu-raised bg-surface hover:bg-surface-container-low focus-visible:ring-primary/40 flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-left focus-visible:ring-2 focus-visible:ring-offset-1 active:scale-[0.99]"
              >
                <span className="font-mono text-sm font-medium tracking-tight">{c.code}</span>
                <span className="text-on-surface-variant truncate text-xs">{c.title}</span>
              </button>
            ))}
            {list.total > list.candidates.length && (
              <p className="text-muted px-1 text-xs">
                Showing first {list.candidates.length} of {list.total}.
              </p>
            )}
          </div>
        </>
      )}

      {list && status === "idle" && list.candidates.length === 0 && !error && !rejected && (
        <p className="text-muted px-1 text-sm">No courses matching {trimmed}.</p>
      )}

      {!trimmed && status === "idle" && !error && !rejected && (
        <p className="text-muted text-sm">Start typing a course code or subject to see results.</p>
      )}
    </>
  );
}
