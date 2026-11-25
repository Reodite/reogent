import { sessionCookie } from "@/src/server/auth";
import { getRateLimitIdentity, rateLimitResponse } from "@/src/server/rate-limit";
import { getUserByUsername } from "@/src/server/sessions/store";
import bcrypt from "bcryptjs";
import { json, readJsonObject, serverError } from "../../http";

const LOGIN_LIMIT = { windowMs: 60_000, maxRequests: 10 };

export async function POST(request: Request): Promise<Response> {
  try {
    const ip = getRateLimitIdentity(request);
    const limited = rateLimitResponse(`login:${ip}`, LOGIN_LIMIT);
    if (limited) return limited;

    const result = await readJsonObject(request);
    if (result instanceof Response) return result;
    const { username, password } = result.body;
    if (!username || !password) return json({ error: "Username and password required" }, 400);
    if (typeof username !== "string" || typeof password !== "string")
      return json({ error: "Username and password must be strings" }, 400);

    if (username.length > 64 || password.length > 128) return json({ error: "Invalid credentials" }, 401);
    const accountLimit = rateLimitResponse(`login-account:${username}`, LOGIN_LIMIT);
    if (accountLimit) return accountLimit;

    const user = await getUserByUsername(username);
    if (!user?.passwordHash) return json({ error: "Invalid credentials" }, 401);

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return json({ error: "Invalid credentials" }, 401);

    const response = json({ userId: user.id, username });
    response.headers.append("set-cookie", await sessionCookie(user.id, username));
    return response;
  } catch (e) {
    return serverError(e);
  }
}
