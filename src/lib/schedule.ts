// Pure timetable logic for the Course Schedule pane: section classification,
// time parsing, and conflict detection. No I/O — the pane supplies CourseDoc
// sections resolved from the catalog.

export interface ScheduledSection {
  /** Course code, e.g. "CPSC 110". */
  code: string;
  /** Course title for block tooltips/labels. */
  title: string;
  /** Section code, e.g. "101" or "T1A". */
  section: string;
  /** Term name, e.g. "2026-27 Winter Term 1". */
  term: string;
  /** Meeting days normalized to "Mon", "Tue", etc. */
  days: string[];
  /** Minutes since midnight, or -1 for unset. */
  startMinutes: number;
  endMinutes: number;
  instructor?: string;
}

export type SectionComponent = "lecture" | "laboratory" | "tutorial" | "discussion" | "other";

export const DAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

const COMPONENT_LETTERS: Record<string, SectionComponent> = {
  L: "laboratory",
  T: "tutorial",
  D: "discussion",
};

function sectionSuffix(section: string): string {
  return section.trim().split("_").at(-1) ?? "";
}

const DAY_LABELS: Record<string, string> = {
  m: "Mon",
  mon: "Mon",
  t: "Tue",
  tue: "Tue",
  w: "Wed",
  wed: "Wed",
  th: "Thu",
  thu: "Thu",
  f: "Fri",
  fri: "Fri",
  sa: "Sat",
  sat: "Sat",
  su: "Sun",
  sun: "Sun",
};

/** Normalizes the compact day codes in the sections dataset for display and
 *  grid placement. Unknown values survive unchanged. */
export function normalizeDays(days: string[]): string[] {
  return days.map((day) => DAY_LABELS[day.trim().toLowerCase()] ?? day);
}

/** Returns the selection group for a section code without collapsing unknown prefixes together. */
export function sectionGroup(section: string): string {
  const suffix = sectionSuffix(section);
  if (suffix === "") return "other:unknown";
  if (/^\d/.test(suffix)) return "lecture";
  const letters = suffix.match(/^[A-Za-z]+/)?.[0].toUpperCase() ?? suffix.toUpperCase();
  const componentPrefix = letters.startsWith("V") && letters.length > 1 ? letters[1] : letters[0];
  return COMPONENT_LETTERS[componentPrefix] ?? `other:${letters}`;
}

/** Classifies a section code for display while retaining unknown grouping through {@link sectionGroup}. */
export function sectionComponent(section: string): SectionComponent {
  const group = sectionGroup(section);
  return group.startsWith("other:") ? "other" : (group as SectionComponent);
}

/** "HH:MM" → minutes since midnight, or -1 when the value is missing/malformed. */
export function parseTime(t: string | null): number {
  if (!t) return -1;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return -1;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return -1;
  return h * 60 + min;
}

/** Formats minutes-since-midnight back to "HH:MM" for grid labels. */
export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Two sections conflict when they share a term, share a day, and their
 *  [start, end) intervals overlap. Sections without times never conflict. */
export function conflicts(a: ScheduledSection, b: ScheduledSection): boolean {
  if (a.term !== b.term) return false;
  if (a.startMinutes < 0 || b.startMinutes < 0 || a.endMinutes < 0 || b.endMinutes < 0) return false;
  if (!a.days.some((d) => b.days.includes(d))) return false;
  return a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

/** IDs of every entry that conflicts with at least one other entry. Entries
 *  are identified by their index in the input array. */
export function conflictedIndices(entries: ScheduledSection[]): Set<number> {
  const bad = new Set<number>();
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (conflicts(entries[i], entries[j])) {
        bad.add(i);
        bad.add(j);
      }
    }
  }
  return bad;
}

/** Within one day column, arranges overlapping sections into side-by-side
 *  lanes. Returns a lane index and total lane count per section index, so
 *  conflicting blocks render narrower instead of stacking opaquely. */
export function laneLayout(
  daySections: { index: number; startMinutes: number; endMinutes: number }[],
): Map<number, { lane: number; lanes: number }> {
  const sorted = [...daySections].sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);
  const out = new Map<number, { lane: number; lanes: number }>();
  // Sweep: a "cluster" is a maximal run of mutually reachable overlaps; within
  // it, assign the lowest free lane. Lane count = max concurrency in cluster.
  let cluster: typeof sorted = [];
  let clusterEnd = -1;
  const flush = () => {
    if (cluster.length === 0) return;
    const lanes: number[] = [];
    for (const s of cluster) {
      let lane = lanes.findIndex((end) => end <= s.startMinutes);
      if (lane === -1) {
        lane = lanes.length;
        lanes.push(-1);
      }
      lanes[lane] = s.endMinutes;
      out.set(s.index, { lane, lanes: 0 });
    }
    const total = lanes.length;
    for (const s of cluster) {
      const v = out.get(s.index);
      if (v) out.set(s.index, { lane: v.lane, lanes: total });
    }
  };
  for (const s of sorted) {
    if (cluster.length > 0 && s.startMinutes >= clusterEnd) {
      flush();
      cluster = [];
      clusterEnd = -1;
    }
    cluster.push(s);
    clusterEnd = Math.max(clusterEnd, s.endMinutes);
  }
  flush();
  return out;
}

/** Visible days for the grid: Mon–Fri always, weekend days only when used. */
export function visibleDays(entries: ScheduledSection[]): string[] {
  const extra = DAY_ORDER.filter((d) => (d === "Sat" || d === "Sun") && entries.some((e) => e.days.includes(d)));
  return [...DAY_ORDER.slice(0, 5), ...extra];
}

/** Grid hour range (whole hours) covering all entries, with an
 *  08:00–22:00 minimum window. */
export function hourRange(entries: ScheduledSection[]): { startHour: number; endHour: number } {
  let start = 8 * 60;
  let end = 22 * 60;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const e of entries) {
    if (e.startMinutes >= 0 && e.endMinutes > e.startMinutes) {
      min = Math.min(min, e.startMinutes);
      max = Math.max(max, e.endMinutes);
    }
  }
  if (min <= max) {
    start = Math.min(start, Math.floor(min / 60) * 60);
    end = Math.max(end, Math.ceil(max / 60) * 60);
  }
  return { startHour: start / 60, endHour: end / 60 };
}
