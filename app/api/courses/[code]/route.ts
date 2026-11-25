import { defaultSession, isSession, type Session } from "@/src/server/course-records";
import { findByCode, getSessionRecord, presentCourse } from "@/src/server/modules/courses";
import { getSearch } from "@/src/server/search";
import { isOkanagan } from "@/src/shared/course-code";
import { json, serverError } from "../../http";

/** Returns a public course record, defaulting to latest winter; session scopes grade and distribution fields. */
export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  try {
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
    const session = (sessionRaw || defaultSession()) as Session;

    const search = getSearch();
    const doc = await findByCode(search, decoded);
    if (!doc) return json({ error: `No course found with code "${decoded}"` }, 404);
    const base = presentCourse(doc);
    // Session document overlays per-session stats (average, reported, buckets,
    // high/low/percentiles) and carries a clean code without the campus suffix.
    const sess = await getSessionRecord(search, doc.code, session);
    return json(sess ? { ...base, ...sess, session } : { ...base, session, note: `Not offered in ${session}` });
  } catch (e) {
    return serverError(e);
  }
}
