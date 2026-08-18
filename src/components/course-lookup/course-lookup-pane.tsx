"use client";

import { CourseDetailCard } from "@/src/components/course-lookup/course-detail-card";
import { useApi } from "@/src/components/providers";
import type { PaneState } from "@/src/components/shell/pane-registry";
import type { CourseDoc } from "@/src/lib/api-types";
import { ApiError } from "@/src/lib/api-types";
import { canonicalize, isOkanagan } from "@/src/shared/course-code";
import { useState } from "react";

type Candidate = { code: string; subject: string; number: string; title: string };

const LEVEL_OP: Record<string, "eq" | "plus" | "minus"> = { "=": "eq", "+": "plus", "-": "minus" };

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
  const [didYouMean, setDidYouMean] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);
  const [status, setStatus] = useState<"idle" | "loading">("idle");

  async function lookup(input: string) {
    const trimmed = input.trim();
    if (!trimmed) return;
    if (isOkanagan(trimmed)) {
      setRejected(true);
      setRecord(null);
      setDidYouMean(null);
      setList(null);
      setError(null);
      return;
    }
    setRejected(false);
    setStatus("loading");
    setError(null);

    const level = parseLevel(trimmed);
    try {
      if (level) {
        const res = await api.searchCourses({ subject: level.subject, level: level.level, digit: level.digit });
        const courses = res.courses.map(toCandidate);
        setRecord(null);
        setDidYouMean(null);
        setList({ courses, total: res.subject_total ?? courses.length });
        setStatus("idle");
        return;
      }
      const canonical = canonicalize(trimmed);
      if (canonical?.kind === "code") {
        try {
          const rec = await api.getCourse(`${canonical.subject} ${canonical.number}`);
          setRecord(rec);
          setDidYouMean(null);
          setList(null);
          setStatus("idle");
          return;
        } catch (e) {
          if (e instanceof ApiError && e.status === 404) {
            const res = await api.searchCourses({ q: `${canonical.subject} ${canonical.number}` });
            setRecord(null);
            setList(null);
            setDidYouMean(res.courses.slice(0, 8).map(toCandidate));
            setStatus("idle");
            return;
          }
          throw e;
        }
      }
      if (canonical?.kind === "subject") {
        const res = await api.searchCourses({ subject: canonical.subject });
        const courses = res.courses.map(toCandidate);
        setRecord(null);
        setDidYouMean(null);
        setList({ courses, total: res.subject_total ?? courses.length });
        setStatus("idle");
        return;
      }
      // Unrecognized input: substring fallback via q full-text search.
      const res = await api.searchCourses({ q: trimmed });
      setRecord(null);
      setList(null);
      setDidYouMean(res.courses.slice(0, 8).map(toCandidate));
      setStatus("idle");
    } catch (e) {
      setRecord(null);
      setDidYouMean(null);
      setList(null);
      setError(e instanceof Error ? e.message : "Lookup failed");
      setStatus("idle");
    }
  }

  const subjectOverflow = list !== null && list.total > 200;

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setState({ code });
          lookup(code);
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="CPSC 110"
          aria-label="Course code"
          aria-invalid={rejected ? "true" : undefined}
          aria-errormessage={rejected ? "code-error" : undefined}
          className="neu-inset bg-surface-container-low text-on-surface focus-visible:ring-primary/40 aria-[invalid=true]:ring-error/30 h-11 w-full rounded-lg px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-1 aria-[invalid=true]:ring-2"
        />
        <button
          type="submit"
          disabled={code.trim() === ""}
          className="neu-primary-button bg-primary text-on-primary min-h-[44px] min-w-[44px] rounded-xl px-4 text-sm font-medium disabled:opacity-40"
        >
          Look up
        </button>
      </form>

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
        <div role="status" aria-busy="true" className="skeleton bg-surface-container h-48 animate-pulse rounded-lg" />
      )}

      {didYouMean && didYouMean.length > 0 && (
        <div data-did-you-mean className="flex flex-wrap gap-1.5">
          {didYouMean.slice(0, 8).map((c) => (
            <button
              key={`${c.subject}-${c.number}`}
              type="button"
              onClick={() => {
                setCode(`${c.subject} ${c.number}`);
                lookup(`${c.subject} ${c.number}`);
              }}
              className="text-primary border-primary hover:bg-accent-subtle focus-visible:ring-primary/40 min-h-[36px] min-w-[44px] rounded-full border px-4 py-2.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95"
            >
              <span className="font-mono">
                {c.subject} {c.number}
              </span>
            </button>
          ))}
        </div>
      )}

      {didYouMean && didYouMean.length === 0 && !error && !rejected && (
        <p className="text-muted text-sm">No course matching {code}.</p>
      )}

      {list && (
        <div data-course-list className="flex flex-col gap-1.5 overflow-auto">
          {list.courses.map((c) => (
            <button
              key={c.code}
              type="button"
              onClick={() => {
                setCode(c.code);
                lookup(c.code);
              }}
              className="neu-raised bg-surface flex items-center gap-2 rounded-lg px-3 py-2 text-left"
            >
              <span className="font-mono text-sm font-medium">{c.code}</span>
              <span className="text-on-surface-variant truncate text-xs">{c.title}</span>
            </button>
          ))}
          {subjectOverflow && <p className="text-muted text-xs">Showing first 200 of {list.total}.</p>}
        </div>
      )}

      {record && <CourseDetailCard record={record} />}

      {!code && !record && !didYouMean && !list && !error && !rejected && (
        <p className="text-muted text-sm">Type a course code to see its details.</p>
      )}
    </div>
  );
}
