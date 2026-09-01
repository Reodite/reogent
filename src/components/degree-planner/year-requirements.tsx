"use client";

// Year-by-year requirement checklist. Course rows support drag-add and
// click-add; manual checks cover transfer credit and non-course requirements.
import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { Icon } from "@/src/components/icons";
import { findCourseTarget } from "@/src/lib/planner-placement";
import {
  isRequirementMet,
  requirementKey,
  type ParsedProgramYears,
  type YearRequirement,
} from "@/src/lib/program-years";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMemo, useState } from "react";
import { PlannerCheckboxMark } from "./planner-checkbox";
import { usePlanner } from "./planner-store";

interface YearRequirementsProps {
  programUrl: string;
  parsed: ParsedProgramYears;
  plannedCodes: Set<string>;
  courseIndex: Map<string, CourseIndexEntry>;
}

function cleanLabel(label: string): string {
  return label.replace(/_V/g, "");
}

export function YearRequirements({ programUrl, parsed, plannedCodes, courseIndex }: YearRequirementsProps) {
  const checkedRequirements = usePlanner((state) => state.checkedRequirements);
  const toggleRequirement = usePlanner((state) => state.toggleRequirement);
  const checkedSet = useMemo(() => new Set(checkedRequirements), [checkedRequirements]);

  const { doneCredits, totalCredits } = useMemo(() => {
    let done = 0;
    let sum = 0;
    for (const year of parsed.years) {
      for (const item of year.items) {
        const credits = item.credits ?? 0;
        sum += credits;
        const key = requirementKey(programUrl, year.label, item);
        if (isRequirementMet(item, plannedCodes) || checkedSet.has(key)) done += credits;
      }
    }
    return { doneCredits: done, totalCredits: parsed.degreeTotalCredits ?? sum };
  }, [parsed, plannedCodes, checkedSet, programUrl]);

  const pct = totalCredits === 0 ? 0 : Math.min(100, (doneCredits / totalCredits) * 100);

  return (
    <div className="flex min-w-0 flex-col gap-4 text-sm">
      <div className="flex flex-col gap-1 px-2 pt-2">
        <div className="flex items-baseline justify-between">
          <span className="text-on-surface text-xs font-medium">Degree progress</span>
          <span className="text-muted text-xs tabular-nums">
            {doneCredits}/{totalCredits} credits
          </span>
        </div>
        <div className="bg-surface-container-high h-1.5 overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-[width] duration-200"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {parsed.years.map((year, yearIndex) => {
        const rows = year.items.map((item) => {
          const key = requirementKey(programUrl, year.label, item);
          const met = isRequirementMet(item, plannedCodes);
          const manuallyChecked = checkedSet.has(key);
          return { item, key, met, manuallyChecked, complete: met || manuallyChecked };
        });
        const pending = rows.filter((row) => !row.complete);
        const completed = rows.filter((row) => row.complete);

        return (
          <section key={year.label} className="flex flex-col gap-2">
            <div className="flex items-baseline px-2 pt-3 pb-1">
              <h4 className="text-muted text-xs font-medium tracking-[0.05em] uppercase">{year.label}</h4>
              {year.totalCredits != null && (
                <span className="text-muted ml-auto text-xs tabular-nums">{year.totalCredits} cr</span>
              )}
            </div>
            <ul className="flex flex-col gap-0.5">
              {pending.map(({ item, key, manuallyChecked }) => (
                <RequirementRow
                  key={key}
                  rowKey={key}
                  item={item}
                  manuallyChecked={manuallyChecked}
                  plannedCodes={plannedCodes}
                  courseIndex={courseIndex}
                  preferredYear={yearIndex}
                  onToggle={() => toggleRequirement(key)}
                />
              ))}
            </ul>
            {completed.length > 0 && (
              <details className="group">
                <summary className="text-muted hover:text-on-surface-variant flex h-8 cursor-pointer list-none items-center gap-1 rounded px-2 text-xs [&::-webkit-details-marker]:hidden">
                  <Icon name="right" size={11} className="transition-transform group-open:rotate-90" />
                  {completed.length} completed
                </summary>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {completed.map(({ item, key, met }) => (
                    <CompletedRequirementRow key={key} item={item} met={met} onToggle={() => toggleRequirement(key)} />
                  ))}
                </ul>
              </details>
            )}
          </section>
        );
      })}
    </div>
  );
}

function RequirementRow({
  rowKey,
  item,
  manuallyChecked,
  plannedCodes,
  courseIndex,
  preferredYear,
  onToggle,
}: {
  rowKey: string;
  item: YearRequirement;
  manuallyChecked: boolean;
  plannedCodes: Set<string>;
  courseIndex: Map<string, CourseIndexEntry>;
  preferredYear: number;
  onToggle: () => void;
}) {
  if (item.kind === "text") {
    return <ManualRequirementRow item={item} checked={manuallyChecked} onToggle={onToggle} />;
  }
  return (
    <CourseRequirementRow
      rowKey={rowKey}
      item={item}
      manuallyChecked={manuallyChecked}
      plannedCodes={plannedCodes}
      courseIndex={courseIndex}
      preferredYear={preferredYear}
      onToggle={onToggle}
    />
  );
}

function CourseRequirementRow({
  rowKey,
  item,
  manuallyChecked,
  plannedCodes,
  courseIndex,
  preferredYear,
  onToggle,
}: {
  rowKey: string;
  item: YearRequirement;
  manuallyChecked: boolean;
  plannedCodes: Set<string>;
  courseIndex: Map<string, CourseIndexEntry>;
  preferredYear: number;
  onToggle: () => void;
}) {
  const choices = nextChoices(item, plannedCodes).filter((code) => courseIndex.has(code));
  const [chosenCode, setChosenCode] = useState(choices[0] ?? "");
  const selectedCode = choices.includes(chosenCode) ? chosenCode : (choices[0] ?? "");
  const years = usePlanner((state) => state.years);
  const addBlock = usePlanner((state) => state.addBlock);
  const target = useMemo(
    () => (selectedCode ? findCourseTarget(years, courseIndex, selectedCode, preferredYear) : null),
    [years, courseIndex, selectedCode, preferredYear],
  );
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `requirement:${rowKey}`,
    data: { kind: "requirement", code: selectedCode },
    disabled: !selectedCode || !target,
  });

  const plannedCount = item.codes.filter((code) => plannedCodes.has(code)).length;
  const partial = item.codes.length > 1 && plannedCount > 0 ? `${plannedCount}/${item.codes.length} planned` : null;

  return (
    <li
      ref={setNodeRef}
      data-requirement-key={rowKey}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.35 : 1 }}
      onPointerDown={(e) => {
        // The row is draggable anywhere except its interactive controls.
        if ((e.target as HTMLElement).closest("button, a, select, input")) return;
        listeners?.onPointerDown?.(e);
      }}
      className={`hover:bg-surface-container-low flex min-h-11 items-start gap-1 rounded-lg px-2 py-1 ${
        selectedCode && target ? "cursor-grab touch-none active:cursor-grabbing" : ""
      }`}
    >
      <button
        type="button"
        aria-pressed={manuallyChecked}
        onClick={onToggle}
        title={manuallyChecked ? "Mark requirement incomplete" : "Mark complete with transfer or external credit"}
        aria-label={manuallyChecked ? "Mark requirement incomplete" : "Mark requirement complete manually"}
        className="hover:bg-surface-container shrink-0 rounded-lg"
      >
        <PlannerCheckboxMark checked={manuallyChecked} />
      </button>
      <div className="min-w-0 flex-1 pt-2">
        <p className="text-on-surface-variant text-xs leading-snug" title={cleanLabel(item.label)}>
          {cleanLabel(item.label)}
        </p>
        {(choices.length > 1 || partial) && (
          <div className="text-muted mt-0.5 flex items-center gap-1 text-[11px]">
            {choices.length > 1 && (
              <select
                value={selectedCode}
                onChange={(event) => setChosenCode(event.target.value)}
                className="neu-inset bg-surface-container-low text-on-surface h-6 max-w-full rounded-md px-1 font-mono text-[11px]"
                aria-label="Course alternative"
              >
                {choices.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            )}
            {partial && <span>{partial}</span>}
          </div>
        )}
      </div>
      {item.credits != null && (
        <span className="text-muted w-9 shrink-0 pt-2 text-right text-[11px] tabular-nums">{item.credits} cr</span>
      )}
      <button
        type="button"
        disabled={!target || !selectedCode}
        onClick={() => target && addBlock(target.yearId, target.termIdx, selectedCode)}
        title={target ? `Add ${selectedCode} to the plan` : "No available study term"}
        aria-label={target ? `Add ${selectedCode} to the plan` : "No available study term"}
        className="text-primary hover:bg-primary/10 flex size-9 shrink-0 items-center justify-center rounded-lg disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Icon name="add" size={14} />
      </button>
    </li>
  );
}

function ManualRequirementRow({
  item,
  checked,
  onToggle,
}: {
  item: YearRequirement;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={checked}
        aria-label={checked ? "Mark requirement incomplete" : "Mark requirement complete"}
        onClick={onToggle}
        className="hover:bg-surface-container-low flex min-h-11 w-full items-start gap-1 rounded-lg px-2 py-1 text-left"
      >
        <PlannerCheckboxMark checked={checked} />
        <span className="text-on-surface-variant min-w-0 flex-1 pt-2 text-xs leading-snug">
          {cleanLabel(item.label)}
        </span>
        {item.credits != null && (
          <span className="text-muted w-9 shrink-0 pt-2 text-right text-[11px] tabular-nums">{item.credits} cr</span>
        )}
      </button>
    </li>
  );
}

function CompletedRequirementRow({
  item,
  met,
  onToggle,
}: {
  item: YearRequirement;
  met: boolean;
  onToggle: () => void;
}) {
  const content = (
    <>
      <PlannerCheckboxMark checked disabled={met} />
      <span className="text-muted min-w-0 flex-1 pt-2 text-xs leading-snug line-through decoration-current/30">
        {cleanLabel(item.label)}
      </span>
      <span className="text-muted shrink-0 pt-2 text-[10px]">{met ? "Planned" : "Marked done"}</span>
      {item.credits != null && (
        <span className="text-muted w-9 shrink-0 pt-2 text-right text-[11px] tabular-nums">{item.credits} cr</span>
      )}
    </>
  );
  // Auto-detected rows are inert; manually checked rows stay clickable so the
  // check can be revoked.
  if (met) {
    return <li className="flex min-h-11 items-start gap-1 rounded-lg px-2 py-1">{content}</li>;
  }
  return (
    <li>
      <button
        type="button"
        aria-pressed="true"
        onClick={onToggle}
        className="hover:bg-surface-container-low flex min-h-11 w-full items-start gap-1 rounded-lg px-2 py-1 text-left"
        aria-label="Mark requirement incomplete"
      >
        {content}
      </button>
    </li>
  );
}

function nextChoices(item: YearRequirement, plannedCodes: Set<string>): string[] {
  if (item.paths && item.paths.length > 0) {
    const ranked = item.paths
      .map((path, index) => ({
        index,
        missing: path.filter((code) => !plannedCodes.has(code)),
        overlap: path.filter((code) => plannedCodes.has(code)).length,
      }))
      .filter((path) => path.missing.length > 0)
      .sort((a, b) => b.overlap - a.overlap || a.missing.length - b.missing.length || a.index - b.index);
    if ((ranked[0]?.overlap ?? 0) > 0) return ranked[0].missing.slice(0, 1);
    return [...new Set(ranked.flatMap((path) => path.missing.slice(0, 1)))];
  }
  if (item.groups.length > 0) {
    return item.groups.find((group) => !group.some((code) => plannedCodes.has(code))) ?? [];
  }
  if (item.mode === "oneof") return item.codes.filter((code) => !plannedCodes.has(code));
  const next = item.codes.find((code) => !plannedCodes.has(code));
  return next ? [next] : [];
}
