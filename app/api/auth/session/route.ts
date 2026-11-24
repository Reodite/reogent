import { readSession } from "@/src/server/auth";
import { json } from "../../http";

/** GET /api/auth/session: the account signed in through the session cookie, or 401. */
export async function GET(request: Request): Promise<Response> {
  const user = await readSession(request);
  return user ? json({ userId: user.sub, username: user.username }) : json({ error: "Not signed in" }, 401);
}
