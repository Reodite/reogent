import { sessionCookie } from "@/src/server/auth";
import { getAuthMode } from "@/src/server/auth-mode";
import { getRateLimitIdentity, rateLimitResponse } from "@/src/server/rate-limit";
import { createPasswordUser } from "@/src/server/sessions/store";
import bcrypt from "bcryptjs";
import { json, readJsonObject, serverError } from "../../http";

const REGISTER_LIMIT = { windowMs: 60_000, maxRequests: 5 };

export async function POST(request: Request): Promise<Response> {
  if (getAuthMode() === "oauth") return json({ error: "Password registration is disabled" }, 404);
  try {
    const limited = rateLimitResponse(`register:${getRateLimitIdentity(request)}`, REGISTER_LIMIT);
    if (limited) return limited;

    const result = await readJsonObject(request);
    if (result instanceof Response) return result;
    const { username, password } = result.body;
    if (!username || !password) return json({ error: "Username and password required" }, 400);
    if (typeof username !== "string" || typeof password !== "string") {
      return json({ error: "Username and password must be strings" }, 400);
    }
    if (password.length < 12) return json({ error: "Password must be at least 12 characters" }, 400);
    if (username.length > 64) return json({ error: "Username must be 64 characters or fewer" }, 400);
    if (Buffer.byteLength(password, "utf8") > 72) {
      return json({ error: "Password must be 72 UTF-8 bytes or fewer" }, 400);
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return json({ error: "Username may only contain letters, numbers, underscores, and hyphens" }, 400);
    }

    const userId = await createPasswordUser(username, await bcrypt.hash(password, 10));
    const response = json({ userId, username }, 201);
    response.headers.append("set-cookie", await sessionCookie(userId, username));
    return response;
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return json({ error: "Username already taken" }, 409);
    return serverError(error);
  }
}
