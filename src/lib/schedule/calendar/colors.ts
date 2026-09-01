import { fnv1a } from "../util/hash";

/**
 * Course accent palette with well-spaced hues across both themes.
 * Blocks use these for a tinted fill and edge; text keeps the theme's normal
 * contrast. Color identifies the course while avatars identify people.
 */
const COURSE_COLORS = [
  "#6ea8fe", // cornflower
  "#ffb46b", // tangerine
  "#62d2a2", // jade
  "#e886c9", // orchid
  "#ffd166", // amber
  "#7ee0e6", // ice
  "#b69cff", // lavender
  "#9bd356", // pear
  "#ff8f8f", // salmon
  "#5fd0c0", // lagoon
  "#f3a6ff", // pink quartz
  "#d9c79b", // sandstone
];

/** Normalizes catalog and Workday codes before assigning a stable course color. */
export function normalizeCourseColorKey(value: string): string {
  return value
    .toUpperCase()
    .replace(/_V(?=\s)/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Returns the shared accent color for a course identity. */
export function courseColor(identity: string | { courseCode: string; title: string }): string {
  const value = typeof identity === "string" ? identity : identity.courseCode || identity.title;
  const idx = parseInt(fnv1a(normalizeCourseColorKey(value)), 16) % COURSE_COLORS.length;
  return COURSE_COLORS[idx];
}
