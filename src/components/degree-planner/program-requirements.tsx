"use client";

// Program selection and requirement progress for the planner rail. Structured
// requirements show category credit bars; prose requirements show a parsed
// year-by-year checklist or a flat course fallback.
import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { Icon } from "@/src/components/icons";
import { TextInput } from "@/src/components/ui/form-controls";
import {
  getProgramIndex,
  getRequirementsFor,
  optionMatches,
  type ProgramIndex,
  type ProgramOption,
  type ProgramRequirements,
} from "@/src/lib/program-requirements";
import { hasYearRequirements, parseProgramYears } from "@/src/lib/program-years";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { usePlanner } from "./planner-store";
import { YearRequirements } from "./year-requirements";

interface ProgramRequirementsProps {
  courseIndex: Map<string, CourseIndexEntry>;
  plannedCodes: Set<string>;
}

function creditValue(entry: CourseIndexEntry | undefined): number {
  return entry?.credits ?? 0;
}

// Program selectors write the faculty, major, and minor to the planner store.
// `toolbar` renders the compact row used in the pane header.
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
    <div className="flex flex-wrap items-end gap-x-3 gap-y-2 max-md:w-full">
      <ProgramCombobox
        label="Faculty"
        className="w-44"
        placeholder="Search faculties"
        value={faculty}
        options={index.faculties.map((name) => ({ value: name, label: name }))}
        onChange={(value) => {
          setProgram("faculty", value);
          setProgram("major", null);
          setProgram("minor", null);
        }}
      />
      <ProgramCombobox
        label="Major / program"
        className="w-52"
        labelExtra={
          major ? (
            <a
              href={major}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary flex items-center gap-0.5 text-xs hover:underline"
            >
              UBC Calendar
              <Icon name="externalLink" size={11} />
            </a>
          ) : undefined
        }
        placeholder={faculty ? "Search programs" : "Select a faculty first"}
        value={major}
        options={majorOptions.map((option) => ({ value: option.url, label: option.label }))}
        onChange={(value) => setProgram("major", value)}
        disabled={!faculty}
      />
      <ProgramCombobox
        label="Minor (optional)"
        className="w-40"
        placeholder={faculty ? "Search minors" : "Select a faculty first"}
        value={minor}
        options={minorOptions.map((option) => ({ value: option.url, label: option.label }))}
        onChange={(value) => setProgram("minor", value)}
        disabled={!faculty}
      />
    </div>
  );
}

function ProgramCombobox({
  label,
  labelExtra,
  className,
  placeholder,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  labelExtra?: ReactNode;
  className?: string;
  placeholder: string;
  value: string | null;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}) {
  const listId = useId();
  const inputId = `${listId}-input`;
  const selectedLabel = options.find((option) => option.value === value)?.label ?? "";
  const [query, setQuery] = useState(selectedLabel);

  useEffect(() => setQuery(selectedLabel), [selectedLabel]);

  function apply(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    const match = options.find(
      (option) => option.label.toLowerCase() === normalized || option.value.toLowerCase() === normalized,
    );
    if (!match) return false;
    setQuery(match.label);
    if (match.value !== value) onChange(match.value);
    return true;
  }

  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <div className="text-muted flex items-baseline justify-between gap-2 text-xs">
        <label htmlFor={inputId}>{label}</label>
        {labelExtra}
      </div>
      <TextInput
        id={inputId}
        type="text"
        list={listId}
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          if (!next) onChange(null);
          else apply(next);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && apply(event.currentTarget.value)) event.preventDefault();
        }}
        onBlur={(event) => {
          if (!event.currentTarget.value) return;
          if (!apply(event.currentTarget.value)) setQuery(selectedLabel);
        }}
        controlSize="compact"
      />
      <datalist id={listId}>
        {options.map((option) => (
          <option key={option.value} value={option.label} />
        ))}
      </datalist>
    </div>
  );
}

function RequirementProgressCard({
  label,
  value,
  earned,
  required,
  children,
  listItem = false,
}: {
  label: string;
  value: ReactNode;
  earned: number;
  required: number;
  children?: ReactNode;
  listItem?: boolean;
}) {
  const Component = listItem ? "li" : "div";
  return (
    <Component className="border-border bg-surface-container-low flex flex-col gap-1 rounded-lg border p-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-on-surface">{label}</span>
        <span className="text-on-surface-variant text-xs">{value}</span>
      </div>
      <ProgressBar earned={earned} required={required} />
      {children}
    </Component>
  );
}

// Resolves the selected program into progress bars and requirement rows.
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
    return (
      <p className="text-muted px-4 py-6 text-center text-xs">
        Pick a faculty and major in the top bar to see your checklist.
      </p>
    );
  }
  if (!requirements) {
    return <div className="text-muted text-sm">Loading requirements…</div>;
  }
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-2">
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
              <RequirementProgressCard
                key={cat.name}
                listItem
                label={cat.name}
                value={`${earned}/${cat.credits_required} cr`}
                earned={earned}
                required={cat.credits_required}
              >
                {cat.notes ? <p className="text-muted text-xs">{cat.notes}</p> : null}
                {matchingCodes.length > 0 ? (
                  <p className="text-on-surface-variant text-xs">{matchingCodes.join(", ")}</p>
                ) : null}
              </RequirementProgressCard>
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
    return (
      <YearRequirements
        programUrl={req.program_url}
        parsed={parsedYears}
        plannedCodes={plannedCodes}
        courseIndex={courseIndex}
      />
    );
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
      <RequirementProgressCard
        label="Referenced courses"
        value={`${completedRefs.length}/${referenced.length} planned`}
        earned={earned}
        required={totalReferencedCredits || 1}
      >
        {totalReferencedCredits > 0 ? (
          <p className="text-muted text-xs">
            {earned}/{totalReferencedCredits} referenced credits planned
          </p>
        ) : null}
        {referenced.length > 0 ? (
          <ul className="mt-1 flex max-h-40 flex-col gap-0.5 overflow-y-auto text-xs">
            {referenced.map((code) => {
              const planned = referencedSet.has(code) && plannedCodes.has(code);
              const title = courseIndex.get(code)?.title ?? "";
              return (
                <li
                  key={code}
                  className={`flex items-baseline gap-2 ${planned ? "text-on-surface" : "text-on-surface-variant"}`}
                >
                  <Icon
                    name={planned ? "check" : "circle"}
                    size={14}
                    className={`${planned ? "text-primary" : "text-muted"} shrink-0 self-center`}
                  />
                  <span className="shrink-0 font-mono">{code}</span>
                  {title ? <span className="text-muted truncate">— {title}</span> : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </RequirementProgressCard>
    </div>
  );
}

function ProgressBar({ earned, required }: { earned: number; required: number }) {
  const pct = Math.max(0, Math.min(100, (earned / Math.max(required, 1)) * 100));
  return (
    <div className="bg-outline-variant/40 h-1.5 overflow-hidden rounded">
      <div
        className="bg-primary h-full w-full origin-left transition-transform duration-200"
        style={{ transform: `scaleX(${pct / 100})` }}
      />
    </div>
  );
}

function TotalCreditsBar({ earned, required }: { earned: number; required: number }) {
  return (
    <RequirementProgressCard
      label="Total credits"
      value={`${earned}/${required} cr`}
      earned={earned}
      required={required}
    />
  );
}
