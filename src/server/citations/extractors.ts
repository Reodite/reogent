import type { Citation, CitationKind } from "@/src/shared/citations/citation";
import { safeSourceUrl as urlOrNull } from "@/src/shared/citations/url";
import type { AdmissionProgramDoc } from "../modules/admissions";
import type { KeyDateDoc } from "../modules/calendar";
import type { CourseDoc } from "../modules/courses";
import type { EventDoc } from "../modules/events";
import type { PageResult } from "../modules/pages";

export type CitationSeed = Omit<Citation, "index" | "used">;
export type CitationExtractor = (result: unknown, input: unknown) => CitationSeed[];

const displaySubject = (s: string): string => s.replace(/_V$/, "");

type SourceRecord = {
  title: string;
  source_url?: string | null;
  category?: string;
  subcategory?: string;
  retrieved_at?: string | null;
  source_modified_at?: string | null;
  source_context_required?: boolean;
};

function sourceSeed(row: SourceRecord, tool: string, date?: string): CitationSeed {
  return {
    label: row.title,
    kind: row.category === "documents" ? "documents" : "page",
    tool,
    source_url: urlOrNull(row.source_url),
    detail: {
      ...(date ? { date } : {}),
      ...(row.category ? { category: row.category } : {}),
      ...(row.subcategory ? { subcategory: row.subcategory } : {}),
      ...(row.retrieved_at ? { retrieved_at: row.retrieved_at } : {}),
      ...(row.source_modified_at ? { source_modified_at: row.source_modified_at } : {}),
      ...(typeof row.source_context_required === "boolean"
        ? { source_context_required: row.source_context_required }
        : {}),
    },
  };
}

const courseSeed = (c: CourseDoc, tool: string): CitationSeed => ({
  label: `${displaySubject(c.subject)} ${c.number} \u2014 ${c.title}`,
  kind: "course",
  tool,
  detail: { subject: displaySubject(c.subject), number: c.number },
});

export const CITATION_EXTRACTORS: Record<string, CitationExtractor> = {
  get_document: (result) =>
    result && typeof result === "object" && "title" in result
      ? [sourceSeed(result as SourceRecord, "get_document")]
      : [],
  search_student_resources: (result) => {
    const { resources } = (result ?? {}) as { resources?: SourceRecord[] };
    return (resources ?? []).map((row) => sourceSeed(row, "search_student_resources"));
  },
  get_costs: (result) => {
    const { kind, fee_tables } = (result ?? {}) as { kind?: string; fee_tables?: SourceRecord[] };
    return kind === "housing" ? (fee_tables ?? []).map((row) => sourceSeed(row, "get_costs")) : [];
  },
  get_library_hours: (result) => {
    const { date, branches } = (result ?? {}) as {
      date?: string;
      branches?: (SourceRecord & { scheduled?: Omit<SourceRecord, "title"> & { date?: string } })[];
    };
    return (branches ?? []).map((row) =>
      sourceSeed(
        {
          ...row,
          source_url: row.scheduled?.source_url ?? row.source_url,
          retrieved_at: row.scheduled ? row.scheduled.retrieved_at : row.retrieved_at,
        },
        "get_library_hours",
        row.scheduled?.date ?? date,
      ),
    );
  },
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
    const { pages } = (result ?? {}) as { pages?: PageResult[] };
    return (pages ?? []).map((p) => sourceSeed({ ...p, source_url: p.url }, "search_ubc_pages", p.date ?? undefined));
  },
};
