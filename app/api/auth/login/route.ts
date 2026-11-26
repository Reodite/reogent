import { sessionCookie } from "@/src/server/auth";
import { getAuthMode } from "@/src/server/auth-mode";
import { getRateLimitIdentity, rateLimitResponse } from "@/src/server/rate-limit";
import { getPasswordUser } from "@/src/server/sessions/store";
import bcrypt from "bcryptjs";
import { json, readJsonObject, serverError } from "../../http";

const LOGIN_LIMIT = { windowMs: 60_000, maxRequests: 10 };

export async function POST(request: Request): Promise<Response> {
  if (getAuthMode() === "oauth") return json({ error: "Password sign-in is disabled" }, 404);
  try {
    const ip = getRateLimitIdentity(request);
    const limited = rateLimitResponse(`login:${ip}`, LOGIN_LIMIT);
    if (limited) return limited;

    const result = await readJsonObject(request);
    if (result instanceof Response) return result;
    const { username, password } = result.body;
    if (!username || !password) return json({ error: "Username and password required" }, 400);
    if (typeof username !== "string" || typeof password !== "string") {
      return json({ error: "Username and password must be strings" }, 400);
    }
    if (username.length > 64 || password.length > 128) return json({ error: "Invalid credentials" }, 401);
    const accountLimit = rateLimitResponse(`login-account:${username}`, LOGIN_LIMIT);
    if (accountLimit) return accountLimit;

    const user = await getPasswordUser(username);
    if (!user?.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      return json({ error: "Invalid credentials" }, 401);
    }

    const response = json({ userId: user.id, username });
    response.headers.append("set-cookie", await sessionCookie(user.id, username));
    return response;
  } catch (error) {
    return serverError(error);
  }
}
