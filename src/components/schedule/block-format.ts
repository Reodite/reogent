const COMPONENT_ABBREV: Record<string, string> = {
  Lecture: "lec",
  Laboratory: "lab",
  Discussion: "dis",
  Seminar: "sem",
};

/** Returns the compact component label used inside timetable blocks. */
export function componentAbbrev(component: string): string {
  return COMPONENT_ABBREV[component] ?? component.slice(0, 3).toLowerCase();
}

/** Returns a display course code, falling back to the section title. */
export function displayCode(section: { courseCode: string; title: string }): string {
  return section.courseCode ? section.courseCode.replace(/_V(?=\s)/, "") : section.title;
}
