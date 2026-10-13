import * as jose from "jose";

interface AuthedUser {
  sub: string;
  username: string;
}

const unauthorized = (error: string) =>
  new Response(JSON.stringify({ error }), { status: 401, headers: { "content-type": "application/json" } });

function getSecret(): Uint8Array {
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

/** Verifies the Bearer token and returns user info, or a 401 Response. */
export async function requireUser(request: Request): Promise<AuthedUser | Response> {
  // Auth bypass only in non-production environments
  if (process.env.AUTH_ENABLED === "false" && process.env.NODE_ENV !== "production") {
    return { sub: "default", username: "local" };
  }

  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return unauthorized("Missing bearer token");

  try {
    const { payload } = await jose.jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
      requiredClaims: ["sub", "iat", "exp"],
      maxTokenAge: "7d",
    });
    if (!payload.sub || typeof payload.username !== "string") return unauthorized("Invalid token identity");
    return { sub: payload.sub, username: payload.username };
  } catch {
    return unauthorized("Invalid or expired token");
  }
}
