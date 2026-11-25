import * as jose from "jose";

interface AuthedUser {
  sub: string;
  username: string;
}

/** Name of the httpOnly cookie that carries the signed session token. */
const SESSION_COOKIE = "reodite_session";
const SESSION_SECONDS = 7 * 24 * 60 * 60;

const unauthorized = (error: string) =>
  new Response(JSON.stringify({ error }), { status: 401, headers: { "content-type": "application/json" } });

/** Returns the JWT signing secret. Throws when unset, or shorter than 32 bytes in production. */
export function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET env var is not set");
  const bytes = new TextEncoder().encode(secret);
  if (process.env.NODE_ENV === "production" && bytes.byteLength < 32) {
    throw new Error("JWT_SECRET must contain at least 32 bytes in production");
  }
  return bytes;
}

/** Signs a JWT for the given user. Expires in 7 days. */
export async function signToken(userId: string, username: string): Promise<string> {
  return new jose.SignJWT({ username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

/** Formats an httpOnly, SameSite=Lax Set-Cookie value; production adds Secure. A zero maxAge deletes the cookie. */
export function cookieHeader(name: string, value: string, maxAge: number, path = "/"): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}

/** Returns a Set-Cookie value that starts a 7-day session. Page scripts cannot read the token. */
export async function sessionCookie(userId: string, username: string): Promise<string> {
  return cookieHeader(SESSION_COOKIE, await signToken(userId, username), SESSION_SECONDS);
}

/** Returns a Set-Cookie value that ends the session in this browser. */
export const clearedSessionCookie = () => cookieHeader(SESSION_COOKIE, "", 0);

/** Returns one cookie value from the request, or undefined. */
export function readCookie(request: Request, name: string): string | undefined {
  for (const part of request.headers.get("cookie")?.split(";") ?? []) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return undefined;
}

// Auth bypass only in non-production environments
const authBypassed = () => process.env.AUTH_ENABLED === "false" && process.env.NODE_ENV !== "production";
const LOCAL_USER: AuthedUser = { sub: "default", username: "local" };

/** Verifies the session cookie and returns its user, or null when absent, expired, or invalid. */
export async function readSession(request: Request): Promise<AuthedUser | null> {
  if (authBypassed()) return LOCAL_USER;
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;
  try {
    const { payload } = await jose.jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
      requiredClaims: ["sub", "iat", "exp"],
      maxTokenAge: "7d",
    });
    if (!payload.sub || typeof payload.username !== "string") return null;
    return { sub: payload.sub, username: payload.username };
  } catch {
    return null;
  }
}

/**
 * Returns the session's user, or a 401 Response. The request must echo the
 * signed-in user id in X-Reodite-User. Browsers cannot attach that header to a
 * cross-site request without CORS approval, which blocks CSRF, and a request
 * queued under another account fails instead of writing to the current one.
 */
export async function requireUser(request: Request): Promise<AuthedUser | Response> {
  if (authBypassed()) return LOCAL_USER;
  const user = await readSession(request);
  if (!user) return unauthorized("Not signed in");
  if (request.headers.get("x-reodite-user") !== user.sub) return unauthorized("Session changed. Reload the page.");
  return user;
}
