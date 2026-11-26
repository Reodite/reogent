import { safeAuthRedirect } from "@/src/lib/auth-redirect";
import { cookieHeader } from "@/src/server/auth";
import { getAuthMode } from "@/src/server/auth-mode";
import { OAUTH_COOKIE } from "@/src/server/oauth/constants";
import { getOAuthProvider } from "@/src/server/oauth/providers";

/** GET /api/auth/:provider: sends the browser to a configured OAuth provider. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }): Promise<Response> {
  if (getAuthMode() === "password") {
    return new Response(null, { status: 302, headers: { location: "/login?error=oauth_unavailable" } });
  }
  const { provider: providerId } = await params;
  const provider = getOAuthProvider(providerId);
  const config = provider?.getConfig();
  if (!provider || !config) {
    return new Response(null, { status: 302, headers: { location: "/login?error=oauth_unavailable" } });
  }

  const destination = safeAuthRedirect(new URL(request.url).searchParams.get("redirect"));
  const { url, state, verifier } = provider.start(config);
  const value = `${state}.${verifier}.${Buffer.from(destination).toString("base64url")}`;
  return new Response(null, {
    status: 302,
    headers: {
      location: url,
      "set-cookie": cookieHeader(OAUTH_COOKIE, value, 600, `/api/auth/${provider.id}`),
      "cache-control": "no-store",
    },
  });
}
