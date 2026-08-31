import { requireUser } from "@/src/server/auth";
import { getPerson, savePerson } from "@/src/server/sharer/store";
import { json, requireJson, serverError } from "../../http";

// A full Workday schedule serializes to a few KB; the cap blocks abuse of
// the JSONB column rather than any real schedule.
const MAX_SCHEDULE_BYTES = 262_144;

/** GET /api/sharer/schedule — the caller's person record, or `{ person: null }`. */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    return json({ person: await getPerson(user.sub) });
  } catch (e) {
    return serverError(e);
  }
}

/** PUT /api/sharer/schedule — replaces the caller's person record. */
export async function PUT(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    const ctError = requireJson(request);
    if (ctError) return ctError;

    const text = await request.text();
    if (text.length > MAX_SCHEDULE_BYTES) return json({ error: "Schedule too large" }, 413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const { handle } = body as { handle?: unknown };
    if (typeof handle !== "string" || handle.trim().length === 0 || handle.length > 64) {
      return json({ error: "handle must be a 1-64 character string" }, 400);
    }
    if (!("avatar" in (body as object))) return json({ error: "avatar is required" }, 400);

    const person = await savePerson(user.sub, {
      handle: handle.trim(),
      avatar: (body as { avatar: unknown }).avatar,
      schedule: (body as { schedule?: unknown }).schedule ?? null,
    });
    return json({ person });
  } catch (e) {
    return serverError(e);
  }
}
