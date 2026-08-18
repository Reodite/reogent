import { requireUser } from "@/src/server/auth";
import { findByCode, presentCourse } from "@/src/server/modules/courses";
import { getSearch } from "@/src/server/search";
import { isOkanagan } from "@/src/shared/course-code";
import { json, serverError } from "../../http";

/** GET /api/courses/{code} — exact lookup of one UBC Vancouver course. Returns the presentCourse record, 404 on miss, 400 for an `_O` (Okanagan) code. */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  try {
    const user = await requireUser(_request);
    if (user instanceof Response) return user;

    const { code } = await params;
    const decoded = decodeURIComponent(code).trim();
    if (isOkanagan(decoded)) {
      return json({ error: "Okanagan campus codes aren't in this catalog." }, 400);
    }

    const search = getSearch();
    const doc = await findByCode(search, decoded);
    if (!doc) return json({ error: `No course found with code "${decoded}"` }, 404);
    return json(presentCourse(doc));
  } catch (e) {
    return serverError(e);
  }
}
