import { requireUser } from "@/src/server/auth";
import { createGroup, listGroups } from "@/src/server/sharer/store";
import { json, requireJson, serverError } from "../../http";

/** GET /api/sharer/groups — groups the caller belongs to. */
export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    return json({ groups: await listGroups(user.sub) });
  } catch (e) {
    return serverError(e);
  }
}

/** POST /api/sharer/groups — creates a group, joins the caller, returns its short link code. */
export async function POST(request: Request): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    const ctError = requireJson(request);
    if (ctError) return ctError;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const { name } = body as { name?: unknown };
    if (typeof name !== "string" || name.trim().length === 0 || name.length > 80) {
      return json({ error: "name must be a 1-80 character string" }, 400);
    }

    const group = await createGroup(user.sub, name.trim());
    if (!group) return json({ error: "Could not allocate a share code; try again" }, 500);
    return json({ group }, 201);
  } catch (e) {
    return serverError(e);
  }
}
