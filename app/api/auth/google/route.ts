import { safeAuthRedirect } from "@/src/lib/auth-redirect";
import { cookieHeader } from "@/src/server/auth";
import { googleConfig, OAUTH_COOKIE, startGoogleSignIn } from "@/src/server/google";

/** GET /api/auth/google?redirect=/app: sends the browser to Google's consent screen. */
export function GET(request: Request): Response {
  const config = googleConfig();
  if (!config) {
    return new Response(null, { status: 302, headers: { location: "/login?error=google_unavailable" } });
  }
  const destination = safeAuthRedirect(new URL(request.url).searchParams.get("redirect"));
  const { url, state, verifier } = startGoogleSignIn(config);
  const value = `${state}.${verifier}.${Buffer.from(destination).toString("base64url")}`;
  return new Response(null, {
    status: 302,
    headers: {
      location: url,
      "set-cookie": cookieHeader(OAUTH_COOKIE, value, 600, "/api/auth/google"),
      "cache-control": "no-store",
    },
  });
}
