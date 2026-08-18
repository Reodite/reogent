import { formatSeconds } from "../core/time";
import type { DatasetModule, SearchClient } from "../core/types";

export interface CourseSection {
  section: string;
  term: string | null;
  days: string[];
  start_seconds: number | null;
  end_seconds: number | null;
  instructor?: string;
  status?: string;
}

export interface CourseDoc {
  code: string; // "CPSC_V 110"
  subject: string; // "CPSC_V"
  number: string;
  title: string;
  description: string;
  credits: number | null;
  prerequisite: string | null; // null when absent/empty (drives has_no_prereqs)
  corequisite: string | null;
  sections: CourseSection[];
  /** Distinct section term names, e.g. "2026-27 Winter Term 1". */
  terms: string[];
}

// biome-ignore lint/suspicious/noExplicitAny: raw dataset rows
type Row = Record<string, any>;

const normalize = (s: unknown): string | null => {
  const v = typeof s === "string" ? s.trim() : "";
  return v === "" ? null : v;
};

function parseCredits(credit: unknown): number | null {
  const m = typeof credit === "string" ? credit.match(/[\d.]+/) : null;
  return m ? Number(m[0]) : null;
}

const courseTerms = (sections: CourseSection[]): string[] => [
  ...new Set(sections.map((s) => s.term).filter((t): t is string => t != null)),
];

/** Joins the academic-calendar catalogue with courses/sections per QUERYING.md:
 *  calendar code = subjects[related.course_code].name + " " + field_course_number,
 *  sections attach via courses/courses.field_course_code. */
export function joinCourses(tables: {
  calCourses: Row[];
  calSubjects: Row[];
  schedCourses: Row[];
  sections: Row[];
  terms: Row[];
  statuses: Row[];
}): CourseDoc[] {
  const subjectName = new Map(tables.calSubjects.map((s) => [s.id, s.name as string]));
  const termName = new Map(tables.terms.map((t) => [t.id, t.name as string]));
  const statusName = new Map(tables.statuses.map((s) => [s.id, s.name as string]));
  const codeById = new Map(tables.schedCourses.map((c) => [c.id, c.field_course_code as string]));

  const sectionsByCode = new Map<string, CourseSection[]>();
  for (const s of tables.sections) {
    const code = codeById.get(s.related?.course);
    if (!code) continue;
    const list = sectionsByCode.get(code) ?? [];
    list.push({
      section: String(s.field_section_number ?? ""),
      term: termName.get(s.related?.academic_term) ?? null,
      days: Array.isArray(s.field_days) ? s.field_days : [],
      start_seconds: typeof s.field_start_time === "number" ? s.field_start_time : null,
      end_seconds: typeof s.field_end_time === "number" ? s.field_end_time : null,
      ...(s.field_instructors?.[0] ? { instructor: String(s.field_instructors[0]) } : {}),
      ...(statusName.has(s.related?.status) ? { status: statusName.get(s.related?.status) } : {}),
    });
    sectionsByCode.set(code, list);
  }

  const docs = new Map<string, CourseDoc>(); // dedupe catalogue by course code, first wins
  for (const row of tables.calCourses) {
    const subject = subjectName.get(row.related?.course_code);
    const number = row.field_course_number;
    if (!subject || number == null) continue;
    const code = `${subject} ${number}`;
    if (docs.has(code)) continue;
    const sections = sectionsByCode.get(code) ?? [];
    docs.set(code, {
      code,
      subject,
      number: String(number),
      title: row.field_course_title ?? String(row.title ?? "").replace(/^.*?:\s*/, ""),
      description: row.description_text ?? "",
      credits: parseCredits(row.field_course_credit),
      prerequisite: normalize(row.prerequisite),
      corequisite: normalize(row.corequisite),
      sections,
      terms: courseTerms(sections),
    });
  }

  // Scheduled courses missing from the calendar catalogue (21% of sections)
  // still get a doc, synthesized from the schedule table — its description at
  // 86% fill and prerequisites at 40% are worse than the calendar's, but far
  // better than the course not existing.
  const schedByCode = new Map<string, Row>();
  for (const c of tables.schedCourses) {
    if (c.field_course_code && !schedByCode.has(c.field_course_code)) schedByCode.set(c.field_course_code, c);
  }
  for (const [code, sections] of sectionsByCode) {
    if (docs.has(code)) continue;
    const row = schedByCode.get(code);
    if (!row) continue;
    const [subject = "", number = ""] = code.split(" ");
    docs.set(code, {
      code,
      subject,
      number,
      title: String(row.title ?? code),
      description: row.description_text ?? "",
      credits: parseCredits(row.field_credits),
      prerequisite: normalize(row.prerequisite),
      corequisite: normalize(row.corequisite),
      sections,
      terms: courseTerms(sections),
    });
  }
  return [...docs.values()];
}

/** Section times go to the model as human-readable HH:MM (Requirement 3.7). */
export function presentCourse(doc: CourseDoc, maxSections = Number.POSITIVE_INFINITY) {
  const sections = doc.sections.slice(0, maxSections).map(({ start_seconds, end_seconds, ...rest }) => ({
    ...rest,
    start_time: start_seconds === null ? null : formatSeconds(start_seconds),
    end_time: end_seconds === null ? null : formatSeconds(end_seconds),
  }));
  return { ...doc, sections, total_sections: doc.sections.length };
}

const upSubject = (s: string) => {
  const up = s.trim().toUpperCase();
  return up.includes("_") ? up : `${up}_V`;
};

export async function findByCode(search: SearchClient, courseCode: string): Promise<CourseDoc | null> {
  const norm = courseCode.trim().toUpperCase().replace(/\s+/g, " ");
  const [subject = "", number = ""] = norm.split(" ");
  const candidates = [...new Set([norm, `${upSubject(subject)} ${number}`])];
  // Try each candidate as an exact filter match
  for (const code of candidates) {
    const res = await search.index("courses").search("", {
      filter: `code = '${code}'`,
      limit: 1,
    });
    if (res.hits[0]) return res.hits[0] as unknown as CourseDoc;
  }
  return null;
}

export const courses: DatasetModule = {
  name: "courses",
  indices: [
    {
      index: "courses",
      settings: {
        searchableAttributes: ["title", "description", "code", "subject", "number"],
        filterableAttributes: ["code", "subject", "credits", "prerequisite", "terms"],
        sortableAttributes: ["code"],
      },
      async *read(store) {
        const [calCourses, calSubjects, schedCourses, sections, terms, statuses] = (await Promise.all([
          store.getJson("academic-calendar/vancouver/courses.json"),
          store.getJson("academic-calendar/vancouver/subjects.json"),
          store.getJson("courses/courses.json"),
          store.getJson("courses/sections.json"),
          store.getJson("courses/terms.json"),
          store.getJson("courses/statuses.json"),
        ])) as Row[][];
        yield* joinCourses({ calCourses, calSubjects, schedCourses, sections, terms, statuses });
      },
      transform(doc: CourseDoc) {
        return { id: doc.code, doc };
      },
    },
  ],
  tools: [
    {
      spec: {
        name: "search_courses",
        description:
          "Search UBC Vancouver courses by keyword, with optional filters. Returns matching courses with their scheduled sections (times as 24h HH:MM).",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              query: { type: "string", description: "Keywords to match against course title, description, and code" },
              subject: { type: "string", description: 'Subject code filter, e.g. "CPSC"' },
              credits: { type: "number", description: "Exact credit count filter, e.g. 3" },
              term: { type: "string", description: 'Term filter, e.g. "2026-27 Winter Term 1"' },
              has_no_prereqs: { type: "boolean", description: "If true, only courses with no prerequisites" },
              limit: { type: "number", description: "Max results (default 20)" },
            },
            required: ["query"],
          },
        },
      },
      async execute(input, search) {
        const { query, subject, credits, has_no_prereqs, term, limit } = input;
        const filters: string[] = [];
        if (subject) filters.push(`subject = '${upSubject(String(subject))}'`);
        if (credits !== undefined) filters.push(`credits = ${credits}`);
        if (has_no_prereqs) filters.push("prerequisite IS NULL");
        if (term) filters.push(`terms = '${String(term)}'`);
        const res = await search.index("courses").search(String(query), {
          filter: filters.length > 0 ? filters.join(" AND ") : undefined,
          limit: Math.min(Number(limit) || 20, 50),
        });
        const hits = res.hits;
        if (hits.length === 0) throw new Error(`No courses matched "${query}"`);
        return { courses: hits.map((h) => presentCourse(h as unknown as CourseDoc, 10)) };
      },
    },
    {
      spec: {
        name: "get_course",
        description:
          "Get the full record for one UBC course by its course code, including description, prerequisites, corequisites, and all scheduled sections.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              course_code: { type: "string", description: 'Course code, e.g. "CPSC 110" or "CPSC_V 110"' },
            },
            required: ["course_code"],
          },
        },
      },
      async execute(input, search) {
        const doc = await findByCode(search, String(input.course_code ?? ""));
        if (!doc) throw new Error(`No course found with code "${input.course_code}"`);
        return presentCourse(doc);
      },
    },
  ],
};
