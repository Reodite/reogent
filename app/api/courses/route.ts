import { requireUser } from "@/src/server/auth";
import { defaultSession, isSession } from "@/src/server/course-records";
import { presentCourse, type CourseDoc } from "@/src/server/modules/courses";
import { getSearch } from "@/src/server/search";
import { matchesLevel, type LevelOp } from "@/src/shared/course-code";
import { json, serverError } from "../http";

const upSubject = (s: string) => {
  const up = s.trim().toUpperCase();
  return up.includes("_") ? up : `${up}_V`;
};

const LEVEL_OPS: Record<string, LevelOp> = { eq: "=", plus: "+", minus: "-" };

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const subject = (url.searchParams.get("subject") ?? "").trim();
    const number = (url.searchParams.get("number") ?? "").trim().toUpperCase();
    const level = LEVEL_OPS[url.searchParams.get("level") ?? ""] ?? null;
    const digitRaw = url.searchParams.get("digit");
    const digit = digitRaw === null ? NaN : Number(digitRaw);
    const sessionRaw = (url.searchParams.get("session") ?? "").trim();
    const sort = (url.searchParams.get("sort") ?? "").trim();
    const session = sessionRaw ? sessionRaw : defaultSession();
    if (sessionRaw && !isSession(sessionRaw)) {
      return json({ error: `Unknown session "${sessionRaw}"` }, 400);
    }

    if (level && !(subject && Number.isInteger(digit) && digit >= 1 && digit <= 5)) {
      return json({ error: "level requires a subject and a digit between 1 and 5." }, 400);
    }
    if (number && !subject) {
      return json({ error: "number requires a subject." }, 400);
    }

    const search = getSearch();

    // Session-aware exploratory browse (no query required): mirrors find_courses session sorts.
    const isSessionSort =
      sort === "students_desc" || sort === "students_asc" || sort === "average_desc" || sort === "average_asc";
    if (isSessionSort || (!q && !subject)) {
      const meiliSort =
        sort === "students_desc"
          ? ["reported:desc"]
          : sort === "students_asc"
            ? ["reported:asc"]
            : sort === "average_desc"
              ? ["average:desc"]
              : sort === "average_asc"
                ? ["average:asc"]
                : (["code:asc"] as string[]);
      const filters: string[] = [`session = '${session}'`];
      if (subject) filters.push(`subject = '${upSubject(subject)}'`);
      if (level && Number.isInteger(digit)) {
        // level filtering is code-based; fetch then filter to keep Meilisearch simple.
      }
      const filterStr = filters.join(" AND ");
      const res = await search.index("course_sessions").search(q, {
        filter: filterStr,
        sort: meiliSort,
        limit: 1000,
      });
      let hits = res.hits as unknown as Record<string, unknown>[];
      if (level && Number.isInteger(digit)) {
        hits = hits.filter((h) => matchesLevel(String(h.number ?? ""), level, digit));
      }
      if (number && subject) {
        hits = hits
          .filter((h) => String(h.number ?? "").includes(number))
          .sort((a, b) => String(a.number).localeCompare(String(b.number)));
        return json({ courses: hits.slice(0, 8), subject_total: hits.length, session });
      }
      return json({ courses: hits.slice(0, 200), subject_total: res.estimatedTotalHits ?? hits.length, session });
    }

    if (q) {
      const res = await search.index("courses").search(q, { limit: 50 });
      const courses = res.hits.map((h) => presentCourse(h as unknown as CourseDoc, 10));
      return json({ courses, session });
    }

    if (subject) {
      const res = await search.index("courses").search("", {
        filter: `subject = '${upSubject(subject)}'`,
        limit: 1000,
      });
      const allPresent = res.hits.map((h) => presentCourse(h as unknown as CourseDoc));
      if (number) {
        const matching = allPresent
          .filter((c) => c.number.includes(number))
          .sort((a, b) => a.number.localeCompare(b.number));
        return json({ courses: matching.slice(0, 8), subject_total: matching.length, session });
      }
      const matching = level ? allPresent.filter((c) => matchesLevel(c.number, level, digit)) : allPresent;
      const subject_total = level ? matching.length : (res.estimatedTotalHits ?? matching.length);
      return json({ courses: matching.slice(0, 200), subject_total, session });
    }

    return json({ error: "Provide a `q` or `subject` parameter, or a session sort." }, 400);
  } catch (e) {
    return serverError(e);
  }
}
