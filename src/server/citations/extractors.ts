import type { Citation, CitationKind } from "@/src/shared/citations/citation";
import type { AdmissionProgramDoc } from "../modules/admissions";
import type { KeyDateDoc } from "../modules/calendar";
import type { CourseDoc } from "../modules/courses";
import type { EventDoc } from "../modules/events";
import type { PageDoc } from "../modules/pages";

export type CitationSeed = Omit<Citation, "index" | "used">;
export type CitationExtractor = (result: unknown, input: unknown) => CitationSeed[];

const displaySubject = (s: string): string => s.replace(/_V$/, "");

const urlOrNull = (u: unknown): string | undefined => (typeof u === "string" && u !== "" ? u : undefined);

const courseSeed = (c: CourseDoc, tool: string): CitationSeed => ({
  label: `${displaySubject(c.subject)} ${c.number} \u2014 ${c.title}`,
  kind: "course",
  tool,
  detail: { subject: displaySubject(c.subject), number: c.number },
});

export const CITATION_EXTRACTORS: Record<string, CitationExtractor> = {
  find_courses: (result) => {
    const { courses } = (result ?? {}) as { courses?: CourseDoc[] };
    return (courses ?? []).map((c) => courseSeed(c, "find_courses"));
  },
  get_course: (result) => {
    const c = result as CourseDoc | undefined;
    return c && typeof c.code === "string" ? [courseSeed(c, "get_course")] : [];
  },
  find_programs: (result) => {
    const { programs } = (result ?? {}) as { programs?: AdmissionProgramDoc[] };
    return (programs ?? []).map((p) => ({
      label: p.name,
      kind: "program" as CitationKind,
      tool: "find_programs",
      source_url: urlOrNull(p.url),
    }));
  },
  find_events: (result) => {
    const { events } = (result ?? {}) as { events?: EventDoc[] };
    return (events ?? []).map((e) => ({
      label: e.title,
      kind: "event" as CitationKind,
      tool: "find_events",
      source_url: urlOrNull(e.url),
      detail: e.start_date ? { date: e.start_date } : undefined,
    }));
  },
  get_key_dates: (result) => {
    const { dates } = (result ?? {}) as { dates?: KeyDateDoc[] };
    return (dates ?? []).map((d) => ({
      label: d.name,
      kind: "calendar" as CitationKind,
      tool: "get_key_dates",
      source_url: urlOrNull(d.source_url),
      detail: d.start ? { date: d.start } : undefined,
    }));
  },
  search_ubc_pages: (result) => {
    const { pages } = (result ?? {}) as { pages?: PageDoc[] };
    return (pages ?? []).map((p) => ({
      label: p.title,
      kind: "page" as CitationKind,
      tool: "search_ubc_pages",
      source_url: urlOrNull(p.url),
      detail: p.date ? { date: p.date } : undefined,
    }));
  },
};
