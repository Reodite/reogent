import type { ScheduleGridDragOption } from "@/src/components/schedule/schedule-grid";
import type { CourseDoc } from "@/src/lib/api-types";
import {
  conflictedIndices,
  conflicts,
  normalizeDays,
  parseTime,
  sectionComponent,
  sectionGroup,
  type ScheduledSection,
} from "@/src/lib/schedule";
import type { ScheduleGridItem } from "@/src/lib/schedule/grid";
import { DAY_ORDER, type DayCode } from "@/src/lib/schedule/types";
import { entryId, normalizeScheduleCode, type ScheduleEntry } from "./schedule-store";

const DAY_CODES = new Set<string>(DAY_ORDER);

/** Converts persisted planner entries into the shared conflict-checking shape. */
export function plannerScheduledSections(entries: ScheduleEntry[]): ScheduledSection[] {
  return entries.map((entry) => ({
    code: normalizeScheduleCode(entry.code),
    title: entry.snapshot.title,
    section: entry.section,
    term: entry.term,
    days: normalizeDays(entry.snapshot.days),
    startMinutes: parseTime(entry.snapshot.start_time),
    endMinutes: parseTime(entry.snapshot.end_time),
    instructor: entry.snapshot.instructor ?? undefined,
  }));
}

function componentLabel(section: string): string {
  const component = sectionComponent(section);
  if (component === "laboratory") return "Lab";
  if (component === "tutorial") return "Tutorial";
  if (component === "discussion") return "Discussion";
  if (component === "lecture") return "Lecture";
  return `${sectionGroup(section).slice(6)} section`;
}

function optionLabel(section: CourseDoc["sections"][number]): string {
  const days = normalizeDays(section.days);
  const when =
    section.start_time && section.end_time
      ? `${days.length > 0 ? days.join("/") : "TBA"} · ${section.start_time}–${section.end_time}`
      : "Time TBA";
  return `${section.section} · ${when}${section.status ? ` · ${section.status}` : ""}`;
}

/** Maps planner snapshots into the route-independent items consumed by the shared week grid. */
export function plannerGridItems(entries: ScheduleEntry[]): ScheduleGridItem[] {
  const scheduled = plannerScheduledSections(entries);
  const conflictSet = conflictedIndices(scheduled);
  return entries.map((entry, index) => ({
    id: entryId(entry),
    courseKey: normalizeScheduleCode(entry.code),
    code: normalizeScheduleCode(entry.code),
    title: entry.snapshot.title,
    section: entry.section,
    component: componentLabel(entry.section),
    days: normalizeDays(entry.snapshot.days).filter((day): day is DayCode => DAY_CODES.has(day)),
    startMin: parseTime(entry.snapshot.start_time),
    endMin: parseTime(entry.snapshot.end_time),
    meta: entry.snapshot.instructor ?? undefined,
    accessibleDetails: entry.snapshot.status ? [`Catalog status: ${entry.snapshot.status}`] : undefined,
    conflict: conflictSet.has(index),
  }));
}

/** Names the selected sections that overlap each planner entry. */
export function plannerConflictLabels(entries: ScheduleEntry[]): Map<string, string[]> {
  const scheduled = plannerScheduledSections(entries);
  const labels = new Map<string, string[]>();
  for (let left = 0; left < scheduled.length; left++) {
    for (let right = left + 1; right < scheduled.length; right++) {
      if (!conflicts(scheduled[left], scheduled[right])) continue;
      const leftId = entryId(entries[left]);
      const rightId = entryId(entries[right]);
      labels.set(leftId, [...(labels.get(leftId) ?? []), `${scheduled[right].code} ${scheduled[right].section}`]);
      labels.set(rightId, [...(labels.get(rightId) ?? []), `${scheduled[left].code} ${scheduled[left].section}`]);
    }
  }
  return labels;
}

/** Builds alternate section slots for one selected planner component. */
export function plannerDragOptions(
  entries: ScheduleEntry[],
  docs: Map<string, CourseDoc>,
  blockId: string,
): ScheduleGridDragOption[] {
  const currentIndex = entries.findIndex((entry) => entryId(entry) === blockId);
  const current = entries[currentIndex];
  if (!current) return [];
  const code = normalizeScheduleCode(current.code);
  const doc = docs.get(code);
  if (!doc) return [];
  const group = sectionGroup(current.section);

  return doc.sections.flatMap((section) => {
    if (
      section.term !== current.term ||
      section.section === current.section ||
      sectionGroup(section.section) !== group
    ) {
      return [];
    }
    const days = normalizeDays(section.days).filter((day): day is DayCode => DAY_CODES.has(day));
    const startMin = parseTime(section.start_time);
    const endMin = parseTime(section.end_time);
    if (days.length === 0 || startMin < 0 || endMin <= startMin) return [];
    const candidate: ScheduleEntry = {
      code,
      section: section.section,
      term: current.term,
      snapshot: {
        title: doc.title,
        instructor: section.instructor ?? null,
        days,
        start_time: section.start_time,
        end_time: section.end_time,
        status: section.status ?? null,
      },
    };
    const resulting = entries.with(currentIndex, candidate);
    const conflict = conflictedIndices(plannerScheduledSections(resulting)).has(currentIndex);
    const id = entryId(candidate);
    return [
      {
        id,
        label: `${optionLabel(section)}${conflict ? " · creates a conflict" : ""}`,
        item: {
          id,
          courseKey: code,
          code,
          title: doc.title,
          section: section.section,
          component: componentLabel(section.section),
          days,
          startMin,
          endMin,
          accessibleDetails: section.status ? [`Catalog status: ${section.status}`] : undefined,
          conflict,
        },
      },
    ];
  });
}
