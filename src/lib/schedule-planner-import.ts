import type { CourseDoc, CourseSection } from "./api-types";
import { normalizeDays, parseTime, sectionComponent } from "./schedule";
import type { Schedule, Section } from "./schedule/types";

export type PlannerImportMatchStatus = "exact" | "ambiguous" | "unmatched";

/** One Workday section reconciled against editable catalog section identifiers. */
export interface PlannerImportMatch {
  source: Section;
  doc: CourseDoc | null;
  candidates: CourseSection[];
  status: PlannerImportMatchStatus;
  reason?: string;
}

/** Complete staged Workday reconciliation shown before the planner changes. */
export interface PlannerImportReview {
  sourceFileName?: string;
  matches: PlannerImportMatch[];
}

function normalizeCode(code: string): string {
  return code
    .toUpperCase()
    .replace(/_V(?=\s)/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function expectedTermPrefix(iso: string | undefined): string | null {
  if (!iso) return null;
  const year = Number.parseInt(iso.slice(0, 4), 10);
  const month = Number.parseInt(iso.slice(5, 7), 10);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
  if (month >= 9) return `${year}-${String(year + 1).slice(-2)} Winter Term 1`;
  if (month >= 5) return `${year} Summer Session`;
  return `${year - 1}-${String(year).slice(-2)} Winter Term 2`;
}

function importedComponent(section: Section): ReturnType<typeof sectionComponent> {
  const component = section.component.toLowerCase();
  if (component.includes("lab")) return "laboratory";
  if (component.includes("tutorial")) return "tutorial";
  if (component.includes("discussion")) return "discussion";
  return "lecture";
}

function sameDays(left: string[], right: string[]): boolean {
  return normalizeDays(left).toSorted().join("|") === normalizeDays(right).toSorted().join("|");
}

function candidatesFor(source: Section, doc: CourseDoc): CourseSection[] {
  if (source.meetings.length !== 1) return [];
  const meeting = source.meetings[0];
  const termPrefix = expectedTermPrefix(source.termStart);
  if (!termPrefix) return [];
  const component = importedComponent(source);
  return doc.sections.filter(
    (candidate) =>
      candidate.term?.startsWith(termPrefix) &&
      sectionComponent(candidate.section) === component &&
      sameDays(candidate.days, meeting.days) &&
      parseTime(candidate.start_time) === meeting.startMin &&
      parseTime(candidate.end_time) === meeting.endMin,
  );
}

/** Reconciles Workday meetings with catalog sections without mutating planner state. */
export async function resolvePlannerImport(
  schedule: Schedule,
  resolveCourse: (code: string) => Promise<CourseDoc>,
): Promise<PlannerImportReview> {
  const codes = [...new Set(schedule.sections.map((section) => normalizeCode(section.courseCode)).filter(Boolean))];
  const docs = new Map<string, CourseDoc | null>();
  await Promise.all(
    codes.map(async (code) => {
      try {
        docs.set(code, await resolveCourse(code));
      } catch {
        docs.set(code, null);
      }
    }),
  );

  const matches = schedule.sections.map((source): PlannerImportMatch => {
    const code = normalizeCode(source.courseCode);
    const doc = docs.get(code) ?? null;
    if (!code || !doc) {
      return { source, doc, candidates: [], status: "unmatched", reason: "Course not found in the catalog." };
    }
    if (source.meetings.length === 0) {
      return { source, doc, candidates: [], status: "unmatched", reason: "Workday lists no meeting time." };
    }
    if (source.meetings.length > 1) {
      return {
        source,
        doc,
        candidates: [],
        status: "unmatched",
        reason: "The catalog cannot represent this section’s multiple meeting patterns.",
      };
    }
    const candidates = candidatesFor(source, doc);
    if (candidates.length === 1) return { source, doc, candidates, status: "exact" };
    if (candidates.length > 1) {
      return {
        source,
        doc,
        candidates,
        status: "ambiguous",
        reason: "More than one catalog section has this meeting time.",
      };
    }
    return {
      source,
      doc,
      candidates,
      status: "unmatched",
      reason: "No catalog section matches this term, component, day, and time.",
    };
  });

  return { sourceFileName: schedule.sourceFileName, matches };
}
