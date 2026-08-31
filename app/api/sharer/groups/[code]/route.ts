import { requireUser } from "@/src/server/auth";
import { CODE_PATTERN, getGroup, joinGroup, leaveGroup } from "@/src/server/sharer/store";
import { json, serverError } from "../../../http";

type Ctx = { params: Promise<{ code: string }> };

/** GET /api/sharer/groups/[code] — the group with its members' person records. */
export async function GET(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    const { code } = await params;
    if (!CODE_PATTERN.test(code)) return json({ error: "Invalid group code" }, 400);

    const group = await getGroup(code);
    if (!group) return json({ error: "Unknown group" }, 404);
    return json({ group });
  } catch (e) {
    return serverError(e);
  }
}

/** POST /api/sharer/groups/[code] — joins the caller to the group. */
export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    const { code } = await params;
    if (!CODE_PATTERN.test(code)) return json({ error: "Invalid group code" }, 400);

    const group = await joinGroup(user.sub, code);
    if (!group) return json({ error: "Unknown group" }, 404);
    return json({ group });
  } catch (e) {
    return serverError(e);
  }
}

/** DELETE /api/sharer/groups/[code] — the caller leaves the group. */
export async function DELETE(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const user = await requireUser(request);
    if (user instanceof Response) return user;
    const { code } = await params;
    if (!CODE_PATTERN.test(code)) return json({ error: "Invalid group code" }, 400);

    const left = await leaveGroup(user.sub, code);
    if (!left) return json({ error: "Not a member of this group" }, 404);
    return new Response(null, { status: 204 });
  } catch (e) {
    return serverError(e);
  }
}
