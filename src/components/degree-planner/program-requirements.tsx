"use client";

// Right-sidebar program selector + requirements progress. Two render
// modes driven by src/lib/program-requirements:
//   - structured (overlay):  per-category credit progress bars
//   - prose (default):       year-by-year checklist when the calendar page
//                            has parseable requirement tables, else a flat
//                            checklist of referenced courses
import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { Icon } from "@/src/components/icons";
import {
  getProgramIndex,
  getRequirementsFor,
  optionMatches,
  type ProgramIndex,
  type ProgramOption,
  type ProgramRequirements,
} from "@/src/lib/program-requirements";
import { hasYearRequirements, parseProgramYears } from "@/src/lib/program-years";
import { useEffect, useMemo, useState } from "react";
import { usePlanner } from "./planner-store";
import { YearRequirements } from "./year-requirements";

interface ProgramRequirementsProps {
  courseIndex: Map<string, CourseIndexEntry>;
  plannedCodes: Set<string>;
}

const SELECT_CLASS =
  "neu-inset bg-surface-container-low text-on-surface focus-visible:ring-primary/40 rounded-lg px-2 py-1 text-sm focus-visible:ring-2 disabled:opacity-50";

function creditValue(entry: CourseIndexEntry | undefined): number {
  return entry?.credits ?? 0;
}

// Program selectors (Faculty / Major / Minor) — lives in the Info tab. Writes
// the selection to the planner store; the Progress tab (ProgramProgress) reads
// it to resolve and render the requirements.
export function ProgramSelectors() {
  const faculty = usePlanner((s) => s.faculty);
  const major = usePlanner((s) => s.major);
  const minor = usePlanner((s) => s.minor);
  const setProgram = usePlanner((s) => s.setProgram);

  const [index, setIndex] = useState<ProgramIndex | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getProgramIndex()
      .then((idx) => {
        if (!cancelled) setIndex(idx);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(String(err?.message ?? err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const majorOptions: ProgramOption[] = useMemo(() => {
    if (!index || !faculty) return [];
    return index.majorsByFaculty.get(faculty) ?? [];
  }, [index, faculty]);

  const minorOptions: ProgramOption[] = useMemo(() => {
    if (!index || !faculty) return [];
    return index.minorsByFaculty.get(faculty) ?? [];
  }, [index, faculty]);

  if (loadError) {
    return <div className="text-error text-sm">Couldn’t load program index: {loadError}</div>;
  }
  if (!index) {
    return <div className="text-muted text-sm">Loading programs…</div>;
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <h3 className="text-on-surface text-sm font-semibold">Program</h3>
      <div className="flex flex-col gap-2 text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-on-surface-variant text-xs">Faculty</span>
          <select
            value={faculty ?? ""}
            onChange={(e) => {
              const value = e.target.value || null;
              setProgram("faculty", value);
              setProgram("major", null);
              setProgram("minor", null);
            }}
            className={SELECT_CLASS}
          >
            <option value="">— Select faculty —</option>
            {index.faculties.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-on-surface-variant text-xs">Major / program</span>
          <select
            value={major ?? ""}
            onChange={(e) => setProgram("major", e.target.value || null)}
            disabled={!faculty}
            className={SELECT_CLASS}
          >
            <option value="">— Select major —</option>
            {majorOptions.map((opt) => (
              <option key={opt.url} value={opt.url}>
                {opt.label}
              </option>
            ))}
          </select>
          {major && (
            <a
              href={major}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary flex items-center gap-1 text-xs hover:underline"
            >
              <Icon name="externalLink" size={14} />
              UBC Calendar page
            </a>
          )}
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-on-surface-variant text-xs">Minor (optional)</span>
          <select
            value={minor ?? ""}
            onChange={(e) => setProgram("minor", e.target.value || null)}
            disabled={!faculty}
            className={SELECT_CLASS}
          >
            <option value="">— Select minor —</option>
            {minorOptions.map((opt) => (
              <option key={opt.url} value={opt.url}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

// Requirements display (the progress bar + year-by-year course checklist) —
// lives in the Progress tab. Reads the selected major from the store and
// resolves its requirements; falls back to a hint until a major is picked.
export function ProgramProgress({ courseIndex, plannedCodes }: ProgramRequirementsProps) {
  const major = usePlanner((s) => s.major);
  const [requirements, setRequirements] = useState<ProgramRequirements | null>(null);

  // Re-resolve requirements whenever major changes.
  useEffect(() => {
    let cancelled = false;
    if (!major) {
      // Defer the clear off the render path; the user-visible effect is
      // identical since we run before paint.
      queueMicrotask(() => {
        if (!cancelled) setRequirements(null);
      });
      return () => {
        cancelled = true;
      };
    }
    getRequirementsFor(major).then((req) => {
      if (!cancelled) setRequirements(req);
    });
    return () => {
      cancelled = true;
    };
  }, [major]);

  if (!major) {
    return <div className="text-muted text-sm">Select a major in the Info tab to see program requirements.</div>;
  }
  if (!requirements) {
    return <div className="text-muted text-sm">Loading requirements…</div>;
  }
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <RequirementsPanel req={requirements} courseIndex={courseIndex} plannedCodes={plannedCodes} />
    </div>
  );
}

function RequirementsPanel({
  req,
  courseIndex,
  plannedCodes,
}: {
  req: ProgramRequirements;
  courseIndex: Map<string, CourseIndexEntry>;
  plannedCodes: Set<string>;
}) {
  if (req.kind === "structured") {
    return (
      <div className="flex flex-col gap-3">
        {typeof req.total_credits === "number" && (
          <TotalCreditsBar
            earned={Array.from(plannedCodes).reduce((sum, c) => sum + creditValue(courseIndex.get(c)), 0)}
            required={req.total_credits}
          />
        )}
        <ul className="flex flex-col gap-2">
          {req.categories.map((cat) => {
            const matchingCodes = Array.from(plannedCodes).filter((c) =>
              cat.options.some((opt) => optionMatches(opt, c)),
            );
            const earned = matchingCodes.reduce((sum, c) => {
              const opt = cat.options.find((o) => optionMatches(o, c));
              return sum + (opt?.credit_value ?? creditValue(courseIndex.get(c)) ?? 0);
            }, 0);
            return (
              <li
                key={cat.name}
                className="border-border bg-surface-container-low flex flex-col gap-1 rounded-lg border p-2"
              >
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-on-surface">{cat.name}</span>
                  <span className="text-on-surface-variant text-xs">
                    {earned}/{cat.credits_required} cr
                  </span>
                </div>
                <ProgressBar earned={earned} required={cat.credits_required} />
                {cat.notes && <p className="text-muted text-xs">{cat.notes}</p>}
                {matchingCodes.length > 0 && (
                  <p className="text-on-surface-variant text-xs">{matchingCodes.join(", ")}</p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
  // Prose mode: prefer the year-by-year checklist when the calendar page has
  // parseable requirement tables; otherwise fall back to the flat referenced-
  // courses list. parseProgramYears is pure + cheap, so calling it on render
  // is fine (no hook needed — keeps RequirementsPanel hook-free).
  const parsedYears = parseProgramYears(req.text);
  if (hasYearRequirements(parsedYears)) {
    return <YearRequirements programUrl={req.program_url} parsed={parsedYears} plannedCodes={plannedCodes} />;
  }
  // Fallback: checklist of referenced courses.
  return <ProseRequirements req={req} courseIndex={courseIndex} plannedCodes={plannedCodes} />;
}

function ProseRequirements({
  req,
  courseIndex,
  plannedCodes,
}: {
  req: Extract<ProgramRequirements, { kind: "prose" }>;
  courseIndex: Map<string, CourseIndexEntry>;
  plannedCodes: Set<string>;
}) {
  const referenced = req.referenced_courses ?? [];
  const referencedSet = new Set(referenced);
  const completedRefs = referenced.filter((c) => plannedCodes.has(c));
  // "Earned referenced credits" = sum of credit values for the referenced
  // courses currently in any term. Imprecise vs a per-category counter
  // (some courses may double-count across categories), but it gives the
  // user a useful "how much of this program's named coursework do I have
  // planned" signal.
  const earned = completedRefs.reduce((sum, c) => sum + creditValue(courseIndex.get(c)), 0);
  const totalReferencedCredits = referenced.reduce((sum, c) => sum + creditValue(courseIndex.get(c)), 0);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="border-border bg-surface-container-low flex flex-col gap-1 rounded-lg border p-2">
        <div className="flex items-baseline justify-between">
          <span className="text-on-surface">Referenced courses</span>
          <span className="text-on-surface-variant text-xs">
            {completedRefs.length}/{referenced.length} planned
          </span>
        </div>
        <ProgressBar earned={earned} required={totalReferencedCredits || 1} />
        {totalReferencedCredits > 0 && (
          <p className="text-muted text-xs">
            {earned}/{totalReferencedCredits} referenced credits planned
          </p>
        )}
        {referenced.length > 0 && (
          <ul className="mt-1 flex max-h-40 flex-col gap-0.5 overflow-y-auto text-xs">
            {referenced.map((code) => {
              const planned = referencedSet.has(code) && plannedCodes.has(code);
              const title = courseIndex.get(code)?.title ?? "";
              return (
                <li
                  key={code}
                  className={`flex items-baseline gap-2 ${planned ? "text-on-surface" : "text-on-surface-variant"}`}
                >
                  {planned ? (
                    <Icon name="check" size={14} className="text-primary shrink-0 self-center" />
                  ) : (
                    <Icon name="circle" size={14} className="text-muted shrink-0 self-center" />
                  )}
                  <span className="shrink-0 font-mono">{code}</span>
                  {title && <span className="text-muted truncate">— {title}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function ProgressBar({ earned, required }: { earned: number; required: number }) {
  const pct = Math.max(0, Math.min(100, (earned / Math.max(required, 1)) * 100));
  return (
    <div className="bg-outline-variant/40 h-1.5 overflow-hidden rounded">
      <div className="bg-primary h-full transition-[width] duration-200" style={{ width: `${pct}%` }} />
    </div>
  );
}

function TotalCreditsBar({ earned, required }: { earned: number; required: number }) {
  return (
    <div className="border-border bg-surface-container-low flex flex-col gap-1 rounded-lg border p-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-on-surface">Total credits</span>
        <span className="text-on-surface-variant text-xs">
          {earned}/{required} cr
        </span>
      </div>
      <ProgressBar earned={earned} required={required} />
    </div>
  );
}
