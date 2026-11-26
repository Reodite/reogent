import { safeAuthRedirect } from "@/src/lib/auth-redirect";
import { cookieHeader, readCookie, sessionCookie } from "@/src/server/auth";
import { OAUTH_COOKIE } from "@/src/server/oauth/constants";
import { getOAuthProvider } from "@/src/server/oauth/providers";
import { findOrCreateOAuthUser } from "@/src/server/sessions/store";

function redirect(location: string, cookiePath: string, ...cookies: string[]): Response {
  const headers = new Headers({ location, "cache-control": "no-store" });
  headers.append("set-cookie", cookieHeader(OAUTH_COOKIE, "", 0, cookiePath));
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
}

/** Completes provider sign-in after validating the browser's single-use state cookie. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }): Promise<Response> {
  const { provider: providerId } = await params;
  const provider = getOAuthProvider(providerId);
  const config = provider?.getConfig();
  if (!provider || !config) return redirect("/login?error=oauth_unavailable", "/api/auth");
  const cookiePath = `/api/auth/${provider.id}`;

  const paramsFromUrl = new URL(request.url).searchParams;
  const [state, verifier, destination] = (readCookie(request, OAUTH_COOKIE) ?? "").split(".");
  if (paramsFromUrl.has("error")) return redirect("/login?error=oauth_cancelled", cookiePath);
  const code = paramsFromUrl.get("code");
  if (!state || !verifier || !code || paramsFromUrl.get("state") !== state) {
    return redirect("/login?error=oauth_failed", cookiePath);
  }

  try {
    const identity = await provider.finish(config, code, verifier);
    const user = await findOrCreateOAuthUser(provider.id, identity.subject, identity);
    return redirect(
      safeAuthRedirect(Buffer.from(destination ?? "", "base64url").toString()),
      cookiePath,
      await sessionCookie(user.id, user.username),
    );
  } catch (error) {
    console.error("OAuth sign-in failed:", error instanceof Error ? error.message : error);
    return redirect("/login?error=oauth_failed", cookiePath);
  }
}
