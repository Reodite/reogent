import type { CourseDoc, CourseSection } from "./api-types";
import { conflicts, normalizeDays, parseTime, sectionGroup, type ScheduledSection } from "./schedule";

const GROUP_ORDER = ["lecture", "laboratory", "tutorial", "discussion"];

/** Complete automatic section choice plus whether it avoids every known conflict. */
export interface AutomaticSectionSelection {
  sections: CourseSection[];
  conflictFree: boolean;
}

function isAvailable(section: CourseSection): boolean {
  return !section.status || /open|active|available/i.test(section.status);
}

function asScheduled(doc: CourseDoc, section: CourseSection): ScheduledSection {
  return {
    code: doc.code,
    title: doc.title,
    section: section.section,
    term: section.term ?? "",
    days: normalizeDays(section.days),
    startMinutes: parseTime(section.start_time),
    endMinutes: parseTime(section.end_time),
    instructor: section.instructor,
  };
}

function orderedGroups(sections: CourseSection[]): CourseSection[][] {
  const groups = new Map<string, CourseSection[]>();
  for (const section of sections) {
    const key = sectionGroup(section.section);
    const group = groups.get(key) ?? [];
    group.push(section);
    groups.set(key, group);
  }
  const entries = [...groups.entries()];
  const required = entries.some(([key]) => !key.startsWith("other:"))
    ? entries.filter(([key]) => !key.startsWith("other:"))
    : entries.slice(0, 1);
  return required
    .sort(([a], [b]) => {
      const aIndex = GROUP_ORDER.indexOf(a);
      const bIndex = GROUP_ORDER.indexOf(b);
      return (
        (aIndex === -1 ? GROUP_ORDER.length : aIndex) - (bIndex === -1 ? GROUP_ORDER.length : bIndex) ||
        a.localeCompare(b)
      );
    })
    .map(([, group]) =>
      group.toSorted((a, b) => Number(isAvailable(b)) - Number(isAvailable(a)) || a.section.localeCompare(b.section)),
    );
}

/** Selects one section per component, preferring the first complete conflict-free combination. */
export function selectAutomaticSections(
  doc: CourseDoc,
  term: string,
  existing: ScheduledSection[],
): AutomaticSectionSelection {
  const groups = orderedGroups(doc.sections.filter((section) => section.term === term));
  if (groups.length === 0) return { sections: [], conflictFree: true };

  const fallback = groups.map((group) => group[0]);
  let selected: CourseSection[] | null = null;

  function visit(index: number, picked: CourseSection[], occupied: ScheduledSection[]) {
    if (selected) return;
    if (index === groups.length) {
      selected = picked;
      return;
    }
    for (const candidate of groups[index]) {
      const scheduled = asScheduled(doc, candidate);
      if (occupied.some((entry) => conflicts(entry, scheduled))) continue;
      visit(index + 1, [...picked, candidate], [...occupied, scheduled]);
    }
  }

  visit(0, [], existing);
  return selected ? { sections: selected, conflictFree: true } : { sections: fallback, conflictFree: false };
}
