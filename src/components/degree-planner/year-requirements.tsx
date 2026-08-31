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
    <div className="flex flex-col gap-4 text-sm">
      <div className="border-border bg-surface-container-low flex flex-col gap-1 rounded-lg border p-2">
        <div className="flex items-baseline justify-between">
          <span className="text-on-surface">Degree progress</span>
          <span className="text-on-surface-variant text-xs">
            {doneCredits}/{totalCredits} credits
          </span>
        </div>
        <div className="bg-outline-variant/40 h-1.5 overflow-hidden rounded">
          <div className="bg-primary h-full transition-[width] duration-200" style={{ width: `${pct}%` }} />
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
            <div className="flex items-baseline justify-between">
              <h4 className="text-on-surface-variant text-xs font-semibold tracking-wide uppercase">{year.label}</h4>
              {year.totalCredits != null && <span className="text-muted text-xs">{year.totalCredits} cr</span>}
            </div>
            <ul className="flex flex-col gap-1.5">
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
                <summary className="text-muted hover:text-on-surface-variant flex cursor-pointer list-none items-center gap-1 rounded px-1 py-0.5 text-[11px] [&::-webkit-details-marker]:hidden">
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
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.35 : 1 }}
      onPointerDown={(e) => {
        // The row is draggable anywhere except its interactive controls.
        if ((e.target as HTMLElement).closest("button, a, select, input")) return;
        listeners?.onPointerDown?.(e);
      }}
      className={`border-border bg-surface group flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
        selectedCode && target ? "cursor-grab touch-none active:cursor-grabbing" : ""
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        title="Mark complete with transfer or external credit"
        className="text-muted hover:bg-surface-container hover:text-primary flex size-7 shrink-0 items-center justify-center rounded-md"
        aria-label="Mark requirement complete manually"
      >
        <Icon name={manuallyChecked ? "checkbox" : "square"} size={14} />
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-on-surface-variant truncate text-xs" title={cleanLabel(item.label)}>
          {cleanLabel(item.label)}
        </p>
        <div className="text-muted flex items-center gap-1 text-[10px]">
          {choices.length > 1 ? (
            <select
              value={selectedCode}
              onChange={(event) => setChosenCode(event.target.value)}
              className="bg-surface-container-low text-on-surface max-w-full rounded px-1 py-0.5 font-mono"
              aria-label="Course alternative"
            >
              {choices.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          ) : (
            selectedCode && <span className="font-mono">{selectedCode}</span>
          )}
          {partial && <span>· {partial}</span>}
        </div>
      </div>
      {item.credits != null && <span className="text-muted text-[10px] tabular-nums">{item.credits} cr</span>}
      <button
        type="button"
        disabled={!target || !selectedCode}
        onClick={() => target && addBlock(target.yearId, target.termIdx, selectedCode)}
        title={target ? `Add ${selectedCode} to the plan` : "No available study term"}
        aria-label={target ? `Add ${selectedCode} to the plan` : "No available study term"}
        className="text-primary hover:bg-primary/10 flex size-7 shrink-0 items-center justify-center rounded-md disabled:cursor-not-allowed disabled:opacity-30"
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
        onClick={onToggle}
        className="hover:bg-surface-container flex min-h-10 w-full items-start gap-2.5 rounded-lg px-2 py-2.5 text-left text-xs"
      >
        <Icon name={checked ? "checkbox" : "square"} size={14} className="text-muted mt-0.5 shrink-0" />
        <span className="text-on-surface-variant flex-1">{cleanLabel(item.label)}</span>
        {item.credits != null && <span className="text-muted shrink-0 tabular-nums">{item.credits} cr</span>}
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
  return (
    <li className="flex items-start gap-2 px-1.5 py-0.5 text-xs">
      {met ? (
        <Icon name="check" size={14} className="text-primary mt-0.5 shrink-0" />
      ) : (
        <button
          type="button"
          onClick={onToggle}
          className="text-primary hover:bg-surface-container flex size-7 shrink-0 items-center justify-center rounded-md"
          aria-label="Mark requirement incomplete"
        >
          <Icon name="checkbox" size={14} />
        </button>
      )}
      <span className="text-muted flex-1 line-through decoration-current/30">{cleanLabel(item.label)}</span>
      {item.credits != null && <span className="text-muted shrink-0 tabular-nums">{item.credits} cr</span>}
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
