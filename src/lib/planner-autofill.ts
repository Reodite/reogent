import type { CourseIndexEntry } from "@/app/api/course-index/route";
import { TERM_CREDIT_TARGET, type Year } from "@/src/components/degree-planner/planner-store";
import { parsePrereq, type Expr } from "@/src/shared/prereq-ast";
import { isRequirementMet, requirementKey, type ParsedProgramYears, type YearRequirement } from "./program-years";

export interface AutofillPlacement {
  yearId: string;
  termIdx: number;
  code: string;
}

export interface AutofillChoice {
  requirement: string;
  code: string;
}

export interface AutofillResult {
  placements: AutofillPlacement[];
  placedCodes: string[];
  choices: AutofillChoice[];
  remaining: string[];
}

interface AutofillInput {
  years: Year[];
  courseIndex: Map<string, CourseIndexEntry>;
  parsed: ParsedProgramYears;
  programUrl: string;
  checkedRequirements: string[];
}

interface Slot {
  yearId: string;
  yearIndex: number;
  termIdx: number;
  targetCredits: number;
  credits: number;
}

/** Builds one prerequisite-safe, capacity-aware autofill batch. */
export function buildAutofillPlan({
  years,
  courseIndex,
  parsed,
  programUrl,
  checkedRequirements,
}: AutofillInput): AutofillResult {
  const checked = new Set(checkedRequirements);
  const existingCodes = new Set(
    years.flatMap((year) => year.terms.flatMap((term) => term.blocks.map((block) => block.code))),
  );
  const selected = new Set(existingCodes);
  const requiredCodes: string[] = [];
  const preferredYear = new Map<string, number>();
  const choices: AutofillChoice[] = [];
  const remaining: string[] = [];

  parsed.years.forEach((programYear, fallbackYear) => {
    const yearIndex = yearIndexFromLabel(programYear.label, fallbackYear);
    for (const item of programYear.items) {
      const key = requirementKey(programUrl, programYear.label, item);
      if (checked.has(key) || isRequirementMet(item, selected)) continue;
      if (item.kind === "text") {
        remaining.push(item.label);
        continue;
      }
      const picks = requirementPicks(item, selected, courseIndex);
      if (picks.length === 0) {
        remaining.push(item.label);
        continue;
      }
      for (const pick of picks) {
        if (pick.alternatives > 1) choices.push({ requirement: item.label, code: pick.code });
        if (!selected.has(pick.code)) {
          selected.add(pick.code);
          requiredCodes.push(pick.code);
        }
        setEarlierYear(preferredYear, pick.code, yearIndex);
      }
    }
  });

  const prerequisites = new Map<string, Set<string>>();
  const corequisites = new Map<string, Set<string>>();
  const placementCodes = [...requiredCodes];
  for (let index = 0; index < placementCodes.length; index++) {
    const code = placementCodes[index];
    const entry = courseIndex.get(code);
    if (!entry) continue;
    const available = new Set([...existingCodes, ...placementCodes]);
    const pre = new Set(pickAstCodes(parsePrereq(entry.prerequisite), available, courseIndex));
    const core = new Set(pickAstCodes(parsePrereq(entry.corequisite), available, courseIndex));
    pre.delete(code);
    core.delete(code);
    prerequisites.set(code, pre);
    corequisites.set(code, core);

    const courseYear = preferredYear.get(code) ?? 0;
    for (const dependency of pre) {
      setEarlierYear(preferredYear, dependency, Math.max(0, courseYear - 1));
      if (!existingCodes.has(dependency) && !placementCodes.includes(dependency)) placementCodes.push(dependency);
    }
    for (const dependency of core) {
      setEarlierYear(preferredYear, dependency, courseYear);
      if (!existingCodes.has(dependency) && !placementCodes.includes(dependency)) placementCodes.push(dependency);
    }
  }

  const slots: Slot[] = [];
  const slotByExistingCode = new Map<string, number>();
  years.forEach((year, yearIndex) => {
    year.terms.forEach((term, termIdx) => {
      if (term.kind !== "study") return;
      const slotIndex = slots.length;
      const credits = term.blocks.reduce((sum, block) => sum + (courseIndex.get(block.code)?.credits ?? 3), 0);
      slots.push({
        yearId: year.id,
        yearIndex,
        termIdx,
        targetCredits: TERM_CREDIT_TARGET[term.season],
        credits,
      });
      for (const block of term.blocks) slotByExistingCode.set(block.code, slotIndex);
    });
  });
  if (slots.length === 0) return { placements: [], placedCodes: [], choices, remaining };

  const order: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  function visit(code: string): void {
    if (existingCodes.has(code) || visited.has(code) || visiting.has(code)) return;
    visiting.add(code);
    for (const dependency of prerequisites.get(code) ?? []) visit(dependency);
    for (const dependency of corequisites.get(code) ?? []) visit(dependency);
    visiting.delete(code);
    visited.add(code);
    order.push(code);
  }
  for (const code of placementCodes) visit(code);

  const assignedSlot = new Map(slotByExistingCode);
  const placements: AutofillPlacement[] = [];
  for (const code of order) {
    const desiredYear = preferredYear.get(code) ?? 0;
    let earliest = slots.findIndex((slot) => slot.yearIndex >= desiredYear);
    if (earliest < 0) earliest = slots.length - 1;
    for (const dependency of prerequisites.get(code) ?? []) {
      const dependencySlot = assignedSlot.get(dependency);
      if (dependencySlot != null) earliest = Math.max(earliest, dependencySlot + 1);
    }
    for (const dependency of corequisites.get(code) ?? []) {
      const dependencySlot = assignedSlot.get(dependency);
      if (dependencySlot != null) earliest = Math.max(earliest, dependencySlot);
    }
    if (earliest >= slots.length) {
      remaining.push(`${code} needs a later term`);
      continue;
    }

    const credits = courseIndex.get(code)?.credits ?? 3;
    const fittingSlot = slots.findIndex(
      (slot, index) => index >= earliest && slot.credits + credits <= slot.targetCredits,
    );
    const slotIndex = fittingSlot >= 0 ? fittingSlot : earliest;
    const slot = slots[slotIndex];
    slot.credits += credits;
    assignedSlot.set(code, slotIndex);
    placements.push({ yearId: slot.yearId, termIdx: slot.termIdx, code });
  }

  return { placements, placedCodes: placements.map((placement) => placement.code), choices, remaining };
}

function requirementPicks(
  item: YearRequirement,
  selected: Set<string>,
  courseIndex: Map<string, CourseIndexEntry>,
): Array<{ code: string; alternatives: number }> {
  if (item.groups.length > 0) {
    return item.groups.flatMap((group) => {
      if (group.some((code) => selected.has(code))) return [];
      const available = group.filter((code) => courseIndex.has(code));
      return available[0] ? [{ code: available[0], alternatives: available.length }] : [];
    });
  }
  if (item.mode === "oneof") {
    const available = item.codes.filter((code) => courseIndex.has(code));
    return available[0] ? [{ code: available[0], alternatives: available.length }] : [];
  }
  return item.codes
    .filter((code) => !selected.has(code) && courseIndex.has(code))
    .map((code) => ({ code, alternatives: 1 }));
}

function pickAstCodes(expr: Expr | null, selected: Set<string>, courseIndex: Map<string, CourseIndexEntry>): string[] {
  if (!expr) return [];
  switch (expr.kind) {
    case "code":
      return courseIndex.has(expr.code) ? [expr.code] : [];
    case "and":
      return [...new Set(expr.children.flatMap((child) => pickAstCodes(child, selected, courseIndex)))];
    case "or": {
      const branches = expr.children
        .map((child, index) => ({ index, codes: pickAstCodes(child, selected, courseIndex) }))
        .filter((branch) => branch.codes.length > 0);
      branches.sort(
        (a, b) =>
          a.codes.filter((code) => !selected.has(code)).length - b.codes.filter((code) => !selected.has(code)).length ||
          a.codes.length - b.codes.length ||
          a.index - b.index,
      );
      return branches[0]?.codes ?? [];
    }
    case "flattened":
      return pickAstCodes(expr.subExpr, selected, courseIndex);
    case "soft":
    case "literal":
      return [];
  }
}

function setEarlierYear(target: Map<string, number>, code: string, year: number): void {
  const current = target.get(code);
  if (current == null || year < current) target.set(code, year);
}

function yearIndexFromLabel(label: string, fallback: number): number {
  const names: Record<string, number> = {
    first: 0,
    one: 0,
    second: 1,
    two: 1,
    third: 2,
    three: 2,
    fourth: 3,
    four: 3,
    fifth: 4,
    five: 4,
    sixth: 5,
    six: 5,
  };
  const named = label.toLowerCase().match(/\b(first|second|third|fourth|fifth|sixth)\b/);
  if (named) return names[named[1]];
  const numeric = label.toLowerCase().match(/\byear\s+([1-6]|one|two|three|four|five|six)\b/);
  if (!numeric) return fallback;
  return /^\d$/.test(numeric[1]) ? Number(numeric[1]) - 1 : names[numeric[1]];
}
