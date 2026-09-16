"use client";

// Program selection and requirement progress for the planner rail. Structured
// requirements show category credit bars; prose requirements show a parsed
// year-by-year checklist or a flat course fallback. The progress view also
// shows degree-wide rules and the selected minor's requirements.
import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { Icon } from "@/src/components/icons";
import { RetryAlert } from "@/src/components/ui/feedback";
import { Field, TextInput } from "@/src/components/ui/form-controls";
import { Heading } from "@/src/components/ui/heading";
import { InlineLink } from "@/src/components/ui/inline-action";
import { Skeleton, SkeletonGroup, SkeletonList } from "@/src/components/ui/skeleton";
import {
  evaluateCategory,
  getDegreeRules,
  getProgramIndex,
  getRequirementsFor,
  getSubjectFaculties,
  resolveProgram,
  type DegreeRules,
  type PlannedCourse,
  type ProgramIndex,
  type ProgramOption,
  type ProgramRequirements,
  type RegistryEntry,
  type RequirementCategory,
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

/** Reserves the responsive faculty, major, and minor control row. */
export function ProgramSelectorsLoading() {
  const major = usePlanner((state) => state.major);
  return (
    <SkeletonGroup
      label="Loading programs…"
      className="grid w-full grid-cols-2 items-end gap-2 @min-[55rem]:flex @min-[55rem]:flex-wrap @min-[55rem]:gap-x-3"
    >
      {[
        ["Faculty", "@min-[55rem]:w-44"],
        ["Major / program", "@min-[55rem]:w-52"],
        ["Minor (optional)", "@min-[55rem]:w-40"],
      ].map(([label, width]) => (
        <div key={label} className={`flex w-full min-w-0 flex-col gap-1.5 ${width}`}>
          <div className="flex min-h-4 flex-wrap items-center justify-between gap-x-2">
            <span className="relative text-xs leading-4 font-medium">
              <span className="invisible">{label}</span>
              <Skeleton className="absolute inset-0 h-4 w-full" />
            </span>
            {label === "Major / program" && major ? (
              <span className="relative inline-flex min-h-11 shrink-0 items-center gap-0.5 px-1 text-xs leading-4 whitespace-nowrap sm:min-h-0 sm:px-0">
                <span className="invisible">UBC Calendar</span>
                <Icon name="externalLink" size={11} className="invisible" />
                <Skeleton className="absolute inset-x-0 top-1/2 h-4 w-full -translate-y-1/2" />
              </span>
            ) : null}
          </div>
          <Skeleton className="h-11 w-full rounded-lg sm:h-9" />
        </div>
      ))}
    </SkeletonGroup>
  );
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

  useEffect(() => {
    if (!index) return;
    for (const level of ["major", "minor"] as const) {
      const value = level === "major" ? major : minor;
      if (value?.startsWith("http")) {
        const entry = resolveProgram(index, value);
        setProgram(level, entry ? entry.id : null);
      }
    }
  }, [index, major, minor, setProgram]);

  const majorOptions: ProgramOption[] = useMemo(() => {
    if (!index || !faculty) return [];
    return index.majorsByFaculty.get(faculty) ?? [];
  }, [index, faculty]);

  const minorOptions: ProgramOption[] = useMemo(() => {
    if (!index || !faculty) return [];
    return index.minorsByFaculty.get(faculty) ?? [];
  }, [index, faculty]);

  const majorUrl = useMemo(() => {
    if (!index || !major) return null;
    return resolveProgram(index, major)?.url ?? null;
  }, [index, major]);

  if (loadError) {
    return <div className="text-error text-sm">Couldn’t load program index: {loadError}</div>;
  }
  if (!index) {
    return <ProgramSelectorsLoading />;
  }

  return (
    <div className="grid w-full grid-cols-2 items-end gap-2 @min-[55rem]:flex @min-[55rem]:flex-wrap @min-[55rem]:gap-x-3">
      <ProgramCombobox
        label="Faculty"
        className="w-full @min-[55rem]:w-44"
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
        className="w-full @min-[55rem]:w-52"
        labelAction={
          majorUrl ? (
            <InlineLink
              href={majorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 gap-0.5 text-xs leading-4 whitespace-nowrap"
            >
              UBC Calendar
              <Icon name="externalLink" size={11} />
            </InlineLink>
          ) : undefined
        }
        placeholder={faculty ? "Search programs" : "Select a faculty first"}
        value={major}
        options={majorOptions.map((option) => ({ value: option.id, label: option.label }))}
        onChange={(value) => setProgram("major", value)}
        disabled={!faculty}
      />
      <ProgramCombobox
        label="Minor (optional)"
        className="w-full @min-[55rem]:w-40"
        placeholder={faculty ? "Search minors" : "Select a faculty first"}
        value={minor}
        options={minorOptions.map((option) => ({ value: option.id, label: option.label }))}
        onChange={(value) => setProgram("minor", value)}
        disabled={!faculty}
      />
    </div>
  );
}

function ProgramCombobox({
  label,
  labelAction,
  className,
  placeholder,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  labelAction?: ReactNode;
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

  function apply(input: string): boolean {
    const normalized = input.trim().toLowerCase();
    const match = options.find(
      (option) => option.label.toLowerCase() === normalized || option.value.toLowerCase() === normalized,
    );
    if (!match) return false;
    setQuery(match.label);
    if (match.value !== value) onChange(match.value);
    return true;
  }

  return (
    <Field label={label} htmlFor={inputId} labelAction={labelAction} className={className}>
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
    </Field>
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
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-on-surface min-w-0 flex-1">{label}</span>
        <span className="text-on-surface-variant shrink-0 text-xs whitespace-nowrap">{value}</span>
      </div>
      <ProgressBar earned={earned} required={required} />
      {children}
    </Component>
  );
}

interface ResolvedPrograms {
  majorEntry: RegistryEntry | null;
  minorEntry: RegistryEntry | null;
  majorReq: ProgramRequirements | null;
  minorReq: ProgramRequirements | null;
  rules: DegreeRules | null;
  subjectFaculty: Record<string, string>;
}

/** Renders the selected major, degree-wide rules, and minor requirements. */
export function ProgramProgress({ courseIndex, plannedCodes }: ProgramRequirementsProps) {
  const major = usePlanner((s) => s.major);
  const minor = usePlanner((s) => s.minor);
  const [result, setResult] = useState<{
    major: string | null;
    minor: string | null;
    resolved: ResolvedPrograms | null;
    error: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!major && !minor) {
      return () => {
        cancelled = true;
      };
    }
    (async () => {
      const [index, rulesMap, subjectFaculty] = await Promise.all([
        getProgramIndex(),
        getDegreeRules(),
        getSubjectFaculties(),
      ]);
      const majorEntry = resolveProgram(index, major);
      const minorEntry = resolveProgram(index, minor);
      const [majorReq, minorReq] = await Promise.all([
        major ? getRequirementsFor(major) : Promise.resolve(null),
        minor ? getRequirementsFor(minor) : Promise.resolve(null),
      ]);
      const rules = majorEntry ? (rulesMap.get(majorEntry.degree) ?? null) : null;
      if (!cancelled) {
        setResult({
          major,
          minor,
          resolved: { majorEntry, minorEntry, majorReq, minorReq, rules, subjectFaculty },
          error: false,
        });
      }
    })().catch(() => {
      if (!cancelled) setResult({ major, minor, resolved: null, error: true });
    });
    return () => {
      cancelled = true;
    };
  }, [major, minor]);

  const planned: PlannedCourse[] = useMemo(
    () => Array.from(plannedCodes).map((code) => ({ code, credits: creditValue(courseIndex.get(code)) })),
    [plannedCodes, courseIndex],
  );

  if (!major && !minor) {
    return (
      <p className="text-muted px-4 py-6 text-center text-xs">
        Pick a faculty and program in the top bar to see your checklist.
      </p>
    );
  }
  if (!result || result.major !== major || result.minor !== minor) {
    return <SkeletonList label="Loading requirements…" padding="none" rows={4} />;
  }
  if (result.error || !result.resolved) {
    return <RetryAlert>Couldn’t load requirements. Reload the page to try again.</RetryAlert>;
  }
  const resolved = result.resolved;
  if (!resolved.majorReq && !resolved.minorReq && !resolved.rules) {
    return (
      <p className="text-muted p-4 text-sm">
        No requirements are available for this program. Choose another program in the top bar.
      </p>
    );
  }
  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-2">
      {resolved.majorReq && (
        <RequirementsPanel
          req={resolved.majorReq}
          courseIndex={courseIndex}
          plannedCodes={plannedCodes}
          planned={planned}
          subjectFaculty={resolved.subjectFaculty}
        />
      )}
      {resolved.rules && (
        <section className="flex flex-col gap-2">
          <Heading as="h4" size="label">
            {resolved.majorEntry?.degree} degree-wide requirements
          </Heading>
          {typeof resolved.rules.total_credits === "number" && (
            <TotalCreditsBar
              earned={planned.reduce((sum, course) => sum + course.credits, 0)}
              required={resolved.rules.total_credits}
            />
          )}
          <CategoryList
            categories={resolved.rules.categories}
            planned={planned}
            subjectFaculty={resolved.subjectFaculty}
          />
        </section>
      )}
      {resolved.minorReq && (
        <section className="flex flex-col gap-2">
          <Heading as="h4" size="label">
            {resolved.minorEntry?.title ?? "Minor"}
          </Heading>
          <RequirementsPanel
            req={resolved.minorReq}
            courseIndex={courseIndex}
            plannedCodes={plannedCodes}
            planned={planned}
            subjectFaculty={resolved.subjectFaculty}
          />
        </section>
      )}
    </div>
  );
}

function CategoryList({
  categories,
  planned,
  subjectFaculty,
}: {
  categories: RequirementCategory[];
  planned: PlannedCourse[];
  subjectFaculty: Record<string, string>;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {categories.map((category) => {
        const { earned, matched } = evaluateCategory(category, planned, subjectFaculty);
        return (
          <RequirementProgressCard
            key={category.name}
            listItem
            label={category.name}
            value={`${earned}/${category.credits_required} cr`}
            earned={earned}
            required={category.credits_required}
          >
            {category.notes && <p className="text-muted text-xs">{category.notes}</p>}
            {matched.length > 0 && <p className="text-on-surface-variant text-xs">{matched.join(", ")}</p>}
          </RequirementProgressCard>
        );
      })}
    </ul>
  );
}

function RequirementsPanel({
  req,
  courseIndex,
  plannedCodes,
  planned,
  subjectFaculty,
}: {
  req: ProgramRequirements;
  courseIndex: Map<string, CourseIndexEntry>;
  plannedCodes: Set<string>;
  planned: PlannedCourse[];
  subjectFaculty: Record<string, string>;
}) {
  if (req.kind === "structured") {
    return (
      <div className="flex flex-col gap-3">
        {typeof req.total_credits === "number" && (
          <TotalCreditsBar
            earned={planned.reduce((sum, course) => sum + course.credits, 0)}
            required={req.total_credits}
          />
        )}
        <CategoryList categories={req.categories} planned={planned} subjectFaculty={subjectFaculty} />
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
                  <span className="shrink-0 font-medium">{code}</span>
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
