import { safeAuthRedirect } from "@/src/lib/auth-redirect";
import { cookieHeader, readCookie, sessionCookie } from "@/src/server/auth";
import { finishGoogleSignIn, googleConfig, OAUTH_COOKIE } from "@/src/server/google";
import { findOrCreateGoogleUser } from "@/src/server/sessions/store";

function redirect(location: string, ...cookies: string[]): Response {
  const headers = new Headers({ location, "cache-control": "no-store" });
  // The sign-in state is single-use: every outcome clears it.
  headers.append("set-cookie", cookieHeader(OAUTH_COOKIE, "", 0, "/api/auth/google"));
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
}

/**
 * GET /api/auth/google/callback: completes Google sign-in. Requires the state
 * issued with this browser's sign-in cookie before contacting Google, then
 * starts a session and returns to the requested page. Failures return to
 * /login with an error code and no detail.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const [state, verifier, destination] = (readCookie(request, OAUTH_COOKIE) ?? "").split(".");
  const config = googleConfig();
  if (!config) return redirect("/login?error=google_unavailable");
  if (params.has("error")) return redirect("/login?error=google_cancelled");
  const code = params.get("code");
  if (!state || !verifier || !code || params.get("state") !== state) return redirect("/login?error=google_failed");
  try {
    const account = await finishGoogleSignIn(config, code, verifier);
    const user = await findOrCreateGoogleUser(account.sub, account.givenName);
    return redirect(
      safeAuthRedirect(Buffer.from(destination ?? "", "base64url").toString()),
      await sessionCookie(user.id, user.username),
    );
  } catch (e) {
    console.error("Google sign-in failed:", e instanceof Error ? e.message : e);
    return redirect("/login?error=google_failed");
  }
}
