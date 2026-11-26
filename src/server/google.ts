import { createHash, randomBytes } from "node:crypto";
import * as jose from "jose";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const googleKeys = jose.createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

/** Name of the short-lived cookie that carries sign-in state between the start and callback routes. */
export const OAUTH_COOKIE = "reodite_oauth";

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Reads Google OAuth settings, or null when GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET or APP_URL is unset. */
export function googleConfig(): GoogleConfig | null {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret, APP_URL: appUrl } = process.env;
  if (!clientId || !clientSecret || !appUrl) return null;
  return { clientId, clientSecret, redirectUri: new URL("/api/auth/google/callback", appUrl).href };
}

/**
 * Starts the authorization code flow with PKCE. Returns Google's consent URL plus
 * the state and code verifier the caller keeps in an httpOnly cookie. Requests
 * the `openid profile email` scopes.
 */
export function startGoogleSignIn(config: GoogleConfig): { url: string; state: string; verifier: string } {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
     scope: "openid profile email",
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { url: url.href, state, verifier };
}

/**
 * Exchanges the authorization code and verifies the returned ID token's
 * signature, issuer, audience and expiry. Returns the Google subject and given
 * name. Throws on any failure, including a 10-second exchange timeout.
 */
export async function finishGoogleSignIn(
  config: GoogleConfig,
  code: string,
  verifier: string,
): Promise<{ sub: string; email?: string; name?: string }> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Google token exchange returned ${response.status}`);
  const { id_token: idToken } = (await response.json()) as { id_token?: unknown };
  if (typeof idToken !== "string") throw new Error("Google returned no ID token");
  const { payload } = await jose.jwtVerify(idToken, googleKeys, { issuer: ISSUERS, audience: config.clientId });
  if (!payload.sub) throw new Error("Google ID token has no subject");
  return {
    sub: payload.sub,
    email: typeof payload.email === "string" && payload.email_verified === true ? payload.email : undefined,
    name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : undefined,
  };
}
