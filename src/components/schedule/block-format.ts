/** Returns a display course code, falling back to the section title. */
export function displayCode(section: { courseCode: string; title: string }): string {
  return section.courseCode ? section.courseCode.replace(/_V(?=\s)/, "") : section.title;
}
