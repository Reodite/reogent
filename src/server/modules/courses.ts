import { formatSeconds } from "../core/time";
import type { DatasetModule, SearchClient } from "../core/types";
import { courseAverage, courseGrades } from "./grades";

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
  /** Hundred-level bucket parsed from `number` (110 → 100), for level filtering. Null when unparseable. */
  level: number | null;
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

/** Hundred-level bucket from a course number: "110" → 100, "4A" → 400. Null when no leading digit. */
function parseLevel(number: string): number | null {
  const m = number.match(/\d/);
  return m ? Number(m[0]) * 100 : null;
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
      level: parseLevel(String(number)),
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
      level: parseLevel(number),
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
        filterableAttributes: ["code", "subject", "credits", "level", "prerequisite", "terms"],
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
        name: "find_courses",
        description:
          "Search or browse UBC Vancouver courses. Pass a keyword query, or omit it and filter by subject/level/credits/term/has_no_prereqs to browse a department's catalogue. Results include each course's historical grade average when available. Sort by relevance, code, or grade average ascending/descending.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              query: { type: "string", description: "Keywords to match against course title, description, and code" },
              subject: { type: "string", description: 'Subject code filter, e.g. "CPSC"' },
              level: { type: "number", description: "Course level bucket, e.g. 100, 200, 300, 400" },
              credits: { type: "number", description: "Exact credit count filter, e.g. 3" },
              term: { type: "string", description: 'Term filter, e.g. "2026-27 Winter Term 1"' },
              has_no_prereqs: { type: "boolean", description: "If true, only courses with no prerequisites" },
              min_grade_avg: { type: "number", description: "Minimum historical class average, e.g. 80" },
              max_grade_avg: { type: "number", description: "Maximum historical class average" },
              sort: {
                type: "string",
                enum: ["relevance", "code", "grade_avg_desc", "grade_avg_asc"],
                description: "Sort order (default relevance when query present, code otherwise)",
              },
              limit: { type: "number", description: "Max results (default 20)" },
            },
            required: [],
          },
        },
      },
      async execute(input, search) {
        const { query, subject, level, credits, has_no_prereqs, term, min_grade_avg, max_grade_avg, sort, limit } =
          input;
        const filters: string[] = [];
        if (subject) filters.push(`subject = '${upSubject(String(subject))}'`);
        if (level !== undefined) filters.push(`level = ${Number(level)}`);
        if (credits !== undefined) filters.push(`credits = ${credits}`);
        if (has_no_prereqs) filters.push("prerequisite IS NULL");
        if (term) filters.push(`terms = '${String(term)}'`);
        const sortBy = String(sort ?? "");
        const needsGradeJoin =
          sortBy === "grade_avg_desc" ||
          sortBy === "grade_avg_asc" ||
          min_grade_avg !== undefined ||
          max_grade_avg !== undefined;
        if (!query && filters.length === 0 && !needsGradeJoin) {
          throw new Error("Provide a query or at least one filter (subject, level, credits, term, or has_no_prereqs)");
        }

        if (needsGradeJoin) {
          // Pull a candidate pool, join grades, filter by bounds, then sort.
          const catRes = await search.index("courses").search(query ? String(query) : "", {
            filter: filters.length > 0 ? filters.join(" AND ") : undefined,
            sort: query ? undefined : ["code:asc"],
            limit: 200,
          });
          const candidates = catRes.hits as unknown as CourseDoc[];
          if (candidates.length === 0) throw new Error(`No courses matched${query ? ` "${query}"` : " those filters"}`);
          const withGrades = await Promise.all(
            candidates.map(async (c) => ({
              course: c,
              avg_grade: await courseAverage(search, c.subject, c.number),
            })),
          );
          const min = min_grade_avg !== undefined ? Number(min_grade_avg) : Number.NEGATIVE_INFINITY;
          const max = max_grade_avg !== undefined ? Number(max_grade_avg) : Number.POSITIVE_INFINITY;
          const ranked = withGrades.filter(
            (r): r is { course: CourseDoc; avg_grade: number } =>
              r.avg_grade !== null && r.avg_grade >= min && r.avg_grade <= max,
          );
          if (sortBy === "grade_avg_asc") {
            ranked.sort((a, b) => a.avg_grade - b.avg_grade);
          } else {
            ranked.sort((a, b) => b.avg_grade - a.avg_grade);
          }
          return {
            courses: ranked.slice(0, Math.min(Number(limit) || 20, 50)).map((r) => ({
              ...presentCourse(r.course, 10),
              grade_avg: r.avg_grade,
            })),
          };
        }

        const res = await search.index("courses").search(query ? String(query) : "", {
          filter: filters.length > 0 ? filters.join(" AND ") : undefined,
          sort: query ? undefined : ["code:asc"],
          limit: Math.min(Number(limit) || 20, 50),
        });
        const hits = res.hits as unknown as CourseDoc[];
        if (hits.length === 0) throw new Error(`No courses matched${query ? ` "${query}"` : " those filters"}`);
        const courses = hits.map((h) => presentCourse(h, 10));
        // Collect available terms for agent self-correction of unmatched term.
        const availableTerms = term ? [...new Set(hits.flatMap((h) => h.terms))].sort() : undefined;
        return {
          courses,
          ...(availableTerms ? { available_terms: availableTerms } : {}),
        };
      },
    },
    {
      spec: {
        name: "get_course",
        description:
          "Get the full record for one UBC course by its course code, including description, credits, prerequisites, corequisites, all scheduled sections, and a pooled grade summary. Set include_grades to also get the full grade distribution histogram.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              course_code: { type: "string", description: 'Course code, e.g. "CPSC 110" or "CPSC_V 110"' },
              include_grades: {
                type: "boolean",
                description: "If true, include the pooled grade distribution histogram",
              },
            },
            required: ["course_code"],
          },
        },
      },
      async execute(input, search) {
        const doc = await findByCode(search, String(input.course_code ?? ""));
        if (!doc) throw new Error(`No course found with code "${input.course_code}"`);
        const base = presentCourse(doc);
        const grade = await courseAverage(search, doc.subject, doc.number);
        if (grade === null) return base;
        const result: Record<string, unknown> = { ...base, grade_avg: grade };
        if (input.include_grades) {
          const full = await courseGrades(search, doc.subject, doc.number);
          if (full) {
            result.grade_summary = full.summary;
            result.grade_distribution = full.distribution;
          }
        }
        return result;
      },
    },
  ],
};
