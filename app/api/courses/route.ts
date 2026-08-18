import { requireUser } from "@/src/server/auth";
import { presentCourse, type CourseDoc } from "@/src/server/modules/courses";
import { getSearch } from "@/src/server/search";
import { matchesLevel, type LevelOp } from "@/src/shared/course-code";
import { json, serverError } from "../../http";

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
    const level = LEVEL_OPS[url.searchParams.get("level") ?? ""] ?? null;
    const digitRaw = url.searchParams.get("digit");
    const digit = digitRaw === null ? NaN : Number(digitRaw);

    if (level && !(subject && Number.isInteger(digit) && digit >= 1 && digit <= 5)) {
      return json({ error: "level requires a subject and a digit between 1 and 5." }, 400);
    }

    const search = getSearch();

    if (q) {
      // ponytail: 50 is a generous cap for autocomplete + did-you-mean chips; the pane slices to 8 chips.
      const res = await search.index("courses").search(q, { limit: 50 });
      const courses = res.hits.map((h) => presentCourse(h as unknown as CourseDoc, 10));
      return json({ courses });
    }

    if (subject) {
      const res = await search.index("courses").search("", {
        filter: `subject = '${upSubject(subject)}'`,
        limit: 1000,
      });
      const allPresent = res.hits.map((h) => presentCourse(h as unknown as CourseDoc));
      const matching = level ? allPresent.filter((c) => matchesLevel(c.number, level, digit)) : allPresent;
      const subject_total = level ? matching.length : (res.estimatedTotalHits ?? matching.length);
      return json({ courses: matching.slice(0, 200), subject_total });
    }

    return json({ error: "Provide a `q` or `subject` parameter." }, 400);
  } catch (e) {
    return serverError(e);
  }
}
