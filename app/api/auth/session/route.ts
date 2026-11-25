import { readSession } from "@/src/server/auth";
import { json } from "../../http";

/** GET /api/auth/session: the account signed in through the session cookie, or 204 when signed out. */
export async function GET(request: Request): Promise<Response> {
  const user = await readSession(request);
  // 204 rather than 401: browsers log every 401 as a console error on each signed-out page view.
  return user
    ? json({ userId: user.sub, username: user.username })
    : new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
