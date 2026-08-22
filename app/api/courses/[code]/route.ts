import { requireUser } from "@/src/server/auth";
import { defaultSession, isSession } from "@/src/server/course-records";
import { findByCode, presentCourse } from "@/src/server/modules/courses";
import { getSearch } from "@/src/server/search";
import { isOkanagan } from "@/src/shared/course-code";
import { json, serverError } from "../../http";

/** GET /api/courses/{code}?session= — exact lookup. Defaults to latest winter; session scopes the grade/distribution fields. */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;

    const { code } = await params;
    const decoded = decodeURIComponent(code).trim();
    if (isOkanagan(decoded)) {
      return json({ error: "Okanagan campus codes aren't in this catalog." }, 400);
    }
    const url = new URL(request.url);
    const sessionRaw = (url.searchParams.get("session") ?? "").trim();
    if (sessionRaw && !isSession(sessionRaw)) {
      return json({ error: `Unknown session "${sessionRaw}"` }, 400);
    }
    const session = (sessionRaw || defaultSession()) as string;

    const search = getSearch();
    const doc = await findByCode(search, decoded);
    if (!doc) return json({ error: `No course found with code "${decoded}"` }, 404);
    const base = presentCourse(doc);
    // Try session document for average/reported/buckets
    try {
      const sid = `${decoded.toUpperCase().replace(/\s+/g, "_")}__${session}`.replace(/[^a-zA-Z0-9_-]/g, "_");
      const sess = (await search.index("course_sessions").getDocument(sid)) as unknown as Record<string, unknown>;
      return json({
        ...base,
        session,
        average: sess.average,
        reported: sess.reported,
        buckets: sess.buckets,
        grade_avg: sess.average,
      });
    } catch {
      // Not offered in this session — return base with note and pooled fallback where available
      return json({ ...base, session, note: `Not offered in ${session}` });
    }
  } catch (e) {
    return serverError(e);
  }
}
