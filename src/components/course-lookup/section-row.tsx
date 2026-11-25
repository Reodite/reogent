import type { CourseSection } from "@/src/lib/api-types";

function or(value: string | null | undefined, fallback: string): string {
  return value?.trim() ? value : fallback;
}

/** One row in the Course Detail Card's sections table: section, days, HH:MM 24h window, instructor. */
export function SectionRow({ section }: { section: CourseSection }) {
  const days = section.days.length > 0 ? section.days.join(" ") : "—";
  const time = section.start_time && section.end_time ? `${section.start_time}-${section.end_time}` : "—";
  return (
    <tr className="border-border-subtle/60 border-t">
      <td className="text-on-surface-variant py-2 pr-3 font-mono">{or(section.section, "—")}</td>
      <td className="text-on-surface-variant py-2 pr-3 font-mono">{days}</td>
      <td className="text-on-surface-variant py-2 pr-3 font-mono">{time}</td>
      <td className="text-on-surface-variant py-2">{or(section.instructor, "—")}</td>
    </tr>
  );
}
