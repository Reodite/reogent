/** Shared helpers for the route handlers. */
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const serverError = (e: unknown) => {
  console.error(e);
  return json({ error: "Internal server error" }, 500);
};

/** Returns a 415 response if the request lacks application/json content-type. Null means valid. */
export function requireJson(request: Request): Response | null {
  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    return json({ error: "Content-Type must be application/json" }, 415);
  }
  return null;
}
