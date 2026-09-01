"use client";

import { Icon } from "@/src/components/icons";
import { useApi } from "@/src/components/providers";
import { RetryAlert } from "@/src/components/ui/feedback";
import { TextInput } from "@/src/components/ui/form-controls";
import { InlineAction } from "@/src/components/ui/inline-action";
import type { CourseDoc } from "@/src/lib/api-types";
import { ApiError } from "@/src/lib/api-types";
import { canonicalize, isOkanagan } from "@/src/shared/course-code";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export type Candidate = {
  code: string;
  subject: string;
  number: string;
  title: string;
  terms?: string[];
};

const LEVEL_OP: Record<string, "eq" | "plus" | "minus"> = { "=": "eq", "+": "plus", "-": "minus" };
const DEBOUNCE_MS = 250;
const OVERLAY_RESULT_LIMIT = 20;

function parseLevel(input: string): { subject: string; level: "eq" | "plus" | "minus"; digit: number } | null {
  const m = input.trim().match(/^([A-Za-z]{2,4})\s*([=+-])\s*([1-5])$/);
  if (!m) return null;
  return { subject: m[1].toUpperCase(), level: LEVEL_OP[m[2]], digit: Number(m[3]) };
}

function toCandidate(doc: CourseDoc): Candidate {
  return { code: doc.code, subject: doc.subject, number: doc.number, title: doc.title, terms: doc.terms };
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
              // q-search spans all fields and Meilisearch ranks by
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
            if (my !== reqToken.current) return;
            setRecord(null);
            setList(null);
            setError(e instanceof Error ? e.message : "Lookup failed");
            setStatus("idle");
            return;
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
          // server-side substring filter on `number` keeps "CPSC 11"
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

  // Clear prior results and invalidate requests before starting the debounce for a new value.
  useLayoutEffect(() => {
    reqToken.current += 1;
    setRecord(null);
    setList(null);
    setError(null);
    setRejected(false);
    setStatus(value.trim() ? "loading" : "idle");
    const t = setTimeout(() => lookup(value), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value, lookup]);

  return { list, status, error, rejected, record, lookup };
}

export type CandidatePresentation = {
  annotation?: ReactNode;
  disabled?: boolean;
  pending?: boolean;
};

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
  presentation?: "inline" | "overlay";
  record?: CourseDoc | null;
  getCandidatePresentation?: (candidate: Candidate) => CandidatePresentation;
  inputRef?: { current: HTMLInputElement | null };
  monospaceCodes?: boolean;
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
  presentation = "inline",
  record,
  getCandidatePresentation,
  inputRef: externalInputRef,
  monospaceCodes = true,
}: CourseSearchFieldProps) {
  const trimmed = value.trim();
  const overlay = presentation === "overlay";
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoringFocus = useRef(false);
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const candidatePool = record ? [toCandidate(record)] : (list?.candidates ?? []);
  const candidates = overlay ? candidatePool.slice(0, OVERLAY_RESULT_LIMIT) : candidatePool;
  const presentations = candidates.map((candidate) => getCandidatePresentation?.(candidate) ?? {});
  const hasPendingCandidate = presentations.some((candidatePresentation) => candidatePresentation.pending);
  const selectableIndexes = presentations
    .map((candidatePresentation, index) =>
      candidatePresentation.disabled || candidatePresentation.pending ? -1 : index,
    )
    .filter((index) => index >= 0);
  const showOverlay = overlay && open && !!trimmed;

  useEffect(() => {
    if (presentation !== "overlay") return;
    setActiveIndex(-1);
    if (value.trim()) setOpen(true);
  }, [presentation, value]);

  useEffect(() => {
    if (overlay && trimmed && (status === "loading" || !!error || rejected || hasPendingCandidate)) setOpen(true);
  }, [error, hasPendingCandidate, overlay, rejected, status, trimmed]);

  useEffect(() => {
    if (!overlay) return;
    const dismiss = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [overlay]);

  const restoreInputFocus = () => {
    if (document.activeElement === inputRef.current) return;
    restoringFocus.current = true;
    inputRef.current?.focus();
    restoringFocus.current = false;
  };

  const selectCandidate = (index: number) => {
    const candidate = candidates[index];
    const candidatePresentation = presentations[index];
    if (!candidate || candidatePresentation?.disabled || candidatePresentation?.pending) return;
    onSelect?.(candidate.code);
    setOpen(false);
    restoreInputFocus();
  };

  const moveActive = (direction: 1 | -1) => {
    if (selectableIndexes.length === 0) return;
    const current = selectableIndexes.indexOf(activeIndex);
    const next = current < 0 ? (direction === 1 ? 0 : selectableIndexes.length - 1) : current + direction;
    setActiveIndex(selectableIndexes[(next + selectableIndexes.length) % selectableIndexes.length]);
  };

  const handleOverlayKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      restoreInputFocus();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      moveActive(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      if (selectableIndexes.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex(selectableIndexes[event.key === "Home" ? 0 : selectableIndexes.length - 1]);
      return;
    }
    if (event.key === "Enter" && open && activeIndex >= 0) {
      event.preventDefault();
      selectCandidate(activeIndex);
    }
  };

  const input = (
    <div className="relative">
      <Icon
        name="search"
        className="text-on-surface-variant pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
      />
      <TextInput
        ref={(node) => {
          inputRef.current = node;
          if (externalInputRef) externalInputRef.current = node;
        }}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (trimmed && !restoringFocus.current) setOpen(true);
        }}
        onKeyDown={handleOverlayKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={rejected ? "true" : undefined}
        aria-errormessage={rejected ? "code-error" : undefined}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showOverlay}
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        adornment="both"
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
  );

  if (overlay) {
    return (
      <div ref={rootRef} className="relative">
        {input}
        {showOverlay && (
          <div
            id={listboxId}
            role={status === "idle" && candidates.length > 0 && !error && !rejected ? "listbox" : undefined}
            data-course-list
            className="border-border-subtle bg-surface absolute top-full z-30 mt-2 max-h-[320px] w-full overflow-y-auto rounded-xl border shadow-lg"
          >
            {status === "loading" ? (
              <div role="status" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex h-11 items-center gap-3 px-3">
                    <span className="bg-surface-container h-3 w-16 animate-pulse rounded" />
                    <span className="bg-surface-container h-3 flex-1 animate-pulse rounded" />
                  </div>
                ))}
              </div>
            ) : rejected ? (
              <div id="code-error" role="alert" className="text-error flex min-h-11 items-center px-3 text-sm">
                Okanagan campus codes aren't in this catalog. Try a Vancouver course.
              </div>
            ) : error ? (
              <div role="alert" className="text-error flex min-h-11 items-center px-3 text-sm">
                <span className="min-w-0 flex-1">{value} could not be reached.</span>
                {onRetry && (
                  <InlineAction onPointerDown={(event) => event.preventDefault()} onClick={onRetry}>
                    Retry
                  </InlineAction>
                )}
              </div>
            ) : candidates.length > 0 ? (
              <>
                {candidates.map((candidate, index) => {
                  const candidatePresentation = presentations[index];
                  const unavailable = candidatePresentation.disabled || candidatePresentation.pending;
                  return (
                    <button
                      id={`${listboxId}-option-${index}`}
                      key={candidate.code}
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={activeIndex === index}
                      aria-disabled={unavailable || undefined}
                      aria-busy={candidatePresentation.pending || undefined}
                      disabled={unavailable}
                      onPointerDown={(event) => event.preventDefault()}
                      onPointerMove={() => {
                        if (!unavailable) setActiveIndex(index);
                      }}
                      onClick={() => selectCandidate(index)}
                      className="hover:bg-surface-container-low aria-selected:bg-primary/10 focus-visible:ring-primary/40 flex min-h-12 w-full items-center px-3 py-1.5 text-left focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span
                            className={`text-on-surface text-body-sm shrink-0 font-medium ${monospaceCodes ? "font-mono" : ""}`}
                          >
                            {candidate.code}
                          </span>
                          <span className="text-on-surface-variant truncate text-xs">{candidate.title}</span>
                        </span>
                        {candidatePresentation.annotation ? (
                          <span className="text-muted mt-0.5 block truncate text-xs">
                            {candidatePresentation.annotation}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
                {candidatePool.length > candidates.length ? (
                  <p className="border-border-subtle text-muted border-t px-3 py-2 text-xs">
                    Keep typing to narrow {list?.total ?? candidatePool.length} results.
                  </p>
                ) : null}
              </>
            ) : (
              <div className="text-muted flex min-h-11 items-center px-3 text-sm">No courses matching {trimmed}.</div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="relative">
        <Icon
          name="search"
          className="text-on-surface-variant pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <TextInput
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={ariaLabel}
          aria-invalid={rejected ? "true" : undefined}
          aria-errormessage={rejected ? "code-error" : undefined}
          adornment="both"
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
        <RetryAlert variant="soft" onRetry={onRetry}>
          {value} could not be reached.
        </RetryAlert>
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
                <span className={`${monospaceCodes ? "font-mono" : ""} text-sm font-medium tracking-tight`}>
                  {c.code}
                </span>
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
