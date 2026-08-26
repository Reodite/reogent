"use client";

// Year-by-year program-requirements checklist. Renders the parsed
// "Specialization Requirements" tables (see src/lib/program-years) as a
// checklist grouped by year: each course row is checkable (auto-ticked when
// a satisfying course is in the plan, and manually toggleable for transfer
// credit the user won't place on the board), each text row (Electives, "Any
// upper level MATH/STAT…") is advisory only and never counts toward progress.
import { Icon } from "@/src/components/icons";
import {
  isRequirementMet,
  requirementKey,
  type ParsedProgramYears,
  type YearRequirement,
} from "@/src/lib/program-years";
import { useMemo } from "react";
import { usePlanner } from "./planner-store";

interface YearRequirementsProps {
  programUrl: string;
  parsed: ParsedProgramYears;
  plannedCodes: Set<string>;
}

// Drop the "_V" campus suffix for display: "MATH_V 100 (or 180…)" → "MATH 100…"
function cleanLabel(label: string): string {
  return label.replace(/_V/g, "");
}

export function YearRequirements({ programUrl, parsed, plannedCodes }: YearRequirementsProps) {
  const checkedRequirements = usePlanner((s) => s.checkedRequirements);
  const toggleRequirement = usePlanner((s) => s.toggleRequirement);
  const checkedSet = useMemo(() => new Set(checkedRequirements), [checkedRequirements]);

  // Overall progress measured in credits: a row contributes its credit value
  // once met — a course row by a plan block or manual check, a text/literal row
  // (Electives, "Any upper level MATH/STAT…") only once manually checked. The
  // denominator is the official degree total when the page gives one, else the
  // sum of all listed requirement credits.
  const { doneCredits, totalCredits } = useMemo(() => {
    let done = 0;
    let sum = 0;
    for (const year of parsed.years) {
      for (const item of year.items) {
        const cr = item.credits ?? 0;
        sum += cr;
        const key = requirementKey(programUrl, year.label, item);
        if (isRequirementMet(item, plannedCodes) || checkedSet.has(key)) {
          done += cr;
        }
      }
    }
    return { doneCredits: done, totalCredits: parsed.degreeTotalCredits ?? sum };
  }, [parsed, plannedCodes, checkedSet, programUrl]);

  const pct = totalCredits === 0 ? 0 : Math.min(100, (doneCredits / totalCredits) * 100);

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="border-border bg-surface-container-low flex flex-col gap-1 rounded-lg border p-2">
        <div className="flex items-baseline justify-between">
          <span className="text-on-surface">Requirements</span>
          <span className="text-on-surface-variant text-xs">
            {doneCredits}/{totalCredits} Credits
          </span>
        </div>
        <div className="bg-outline-variant/40 h-1.5 overflow-hidden rounded">
          <div className="bg-primary h-full transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {parsed.years.map((year) => (
        <div key={year.label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between">
            <h4 className="text-on-surface-variant text-xs font-semibold tracking-wide uppercase">{year.label}</h4>
            {year.totalCredits != null && <span className="text-muted text-xs">{year.totalCredits}</span>}
          </div>
          <ul className="flex flex-col gap-0.5">
            {year.items.map((item) => {
              const key = requirementKey(programUrl, year.label, item);
              const manuallyChecked = checkedSet.has(key);
              return (
                <RequirementRow
                  key={key}
                  item={item}
                  met={isRequirementMet(item, plannedCodes)}
                  manuallyChecked={manuallyChecked}
                  plannedCount={item.codes.filter((c) => plannedCodes.has(c)).length}
                  onToggle={() => toggleRequirement(key)}
                />
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function RequirementRow({
  item,
  met,
  manuallyChecked,
  plannedCount,
  onToggle,
}: {
  item: YearRequirement;
  met: boolean;
  manuallyChecked: boolean;
  plannedCount: number;
  onToggle: () => void;
}) {
  const label = cleanLabel(item.label);
  const credits =
    item.credits != null ? <span className="text-muted shrink-0 tabular-nums">{item.credits}</span> : null;

  // A literal course block in the plan already fulfills this requirement, so
  // the plan is the source of truth — the row is locked (not a button, no
  // toggle). The user satisfies it by placing/removing the block. Only course
  // rows can reach this (text rows are never auto-met).
  if (met) {
    return (
      <li
        title="Satisfied by a course in your plan"
        className="flex cursor-default items-baseline gap-2 px-1 py-0.5 text-xs"
      >
        <Icon name="check" size={14} className="text-primary shrink-0 self-center" />
        <span className="text-on-surface flex-1">{label}</span>
        {credits}
      </li>
    );
  }

  // Otherwise the user fulfills the row by manually checking it: a course not
  // in the plan (transfer credit, AP) or a text/literal requirement (Electives,
  // "Any upper level MATH/STAT…") that has no specific block to drag.
  // Partial hint for an "all of" course group where some but not all are planned.
  const partial =
    item.kind === "course" && !manuallyChecked && item.codes.length > 1 && plannedCount > 0
      ? ` · ${plannedCount}/${item.codes.length}`
      : "";

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        title="Click to mark complete"
        className="hover:bg-surface-container flex w-full items-baseline gap-2 rounded px-1 py-0.5 text-left text-xs"
      >
        {manuallyChecked ? (
          <Icon name="checkbox" size={14} className="text-primary shrink-0 self-center" />
        ) : (
          <Icon name="square" size={14} className="text-muted shrink-0 self-center" />
        )}
        <span className={`flex-1 ${manuallyChecked ? "text-on-surface" : "text-on-surface-variant"}`}>
          {label}
          {partial && <span className="text-muted">{partial}</span>}
        </span>
        {credits}
      </button>
    </li>
  );
}
