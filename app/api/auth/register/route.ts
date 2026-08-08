import { signToken } from "@/src/server/auth";
import { createUser, getUserByUsername } from "@/src/server/sessions/store";
import bcrypt from "bcryptjs";
import { json, requireJson, serverError } from "../../http";

export async function POST(request: Request): Promise<Response> {
  try {
    const ctError = requireJson(request);
    if (ctError) return ctError;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const { username, password } = body as Record<string, unknown>;
    if (!username || !password) return json({ error: "Username and password required" }, 400);
    if (typeof username !== "string" || typeof password !== "string")
      return json({ error: "Username and password must be strings" }, 400);
    if (password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);
    if (username.length > 64) return json({ error: "Username must be 64 characters or fewer" }, 400);
    if (password.length > 128) return json({ error: "Password must be 128 characters or fewer" }, 400);
    if (!/^[a-zA-Z0-9_-]+$/.test(username))
      return json({ error: "Username may only contain letters, numbers, underscores, and hyphens" }, 400);

    const existing = await getUserByUsername(username);
    if (existing) return json({ error: "Username already taken" }, 409);

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = await createUser(username, passwordHash);
    const token = await signToken(userId, username);

    return json({ token, userId, username }, 201);
  } catch (e) {
    return serverError(e);
  }
}
