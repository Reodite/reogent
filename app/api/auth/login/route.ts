import { signToken } from "@/src/server/auth";
import { getRateLimitIdentity, rateLimitResponse } from "@/src/server/rate-limit";
import { getUserByUsername } from "@/src/server/sessions/store";
import bcrypt from "bcryptjs";
import { json, readJson, requireJson, serverError } from "../../http";

const LOGIN_LIMIT = { windowMs: 60_000, maxRequests: 10 };

export async function POST(request: Request): Promise<Response> {
  try {
    const ip = getRateLimitIdentity(request);
    const limited = rateLimitResponse(`login:${ip}`, LOGIN_LIMIT);
    if (limited) return limited;

    const ctError = requireJson(request);
    if (ctError) return ctError;

    const result = await readJson(request);
    if (result instanceof Response) return result;
    const { body } = result;

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ error: "Body must be an object" }, 400);
    }
    const { username, password } = body as Record<string, unknown>;
    if (!username || !password) return json({ error: "Username and password required" }, 400);
    if (typeof username !== "string" || typeof password !== "string")
      return json({ error: "Username and password must be strings" }, 400);

    if (username.length > 64 || password.length > 128) return json({ error: "Invalid credentials" }, 401);
    const accountLimit = rateLimitResponse(`login-account:${username}`, LOGIN_LIMIT);
    if (accountLimit) return accountLimit;

    const user = await getUserByUsername(username);
    if (!user) return json({ error: "Invalid credentials" }, 401);

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return json({ error: "Invalid credentials" }, 401);

    const token = await signToken(user.id, username);
    return json({ token, userId: user.id, username });
  } catch (e) {
    return serverError(e);
  }
}
