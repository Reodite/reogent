import { clearedSessionCookie } from "@/src/server/auth";

/** POST /api/auth/logout: removes the session cookie from this browser. */
export function POST(): Response {
  return new Response(null, {
    status: 204,
    headers: { "set-cookie": clearedSessionCookie(), "cache-control": "no-store" },
  });
}
