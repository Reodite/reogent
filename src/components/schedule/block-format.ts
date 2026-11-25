import { stripCampusSuffix } from "@/src/shared/course-code";

/** Returns a display course code, falling back to the section title. */
export function displayCode(section: { courseCode: string; title: string }): string {
  return section.courseCode ? stripCampusSuffix(section.courseCode) : section.title;
}
