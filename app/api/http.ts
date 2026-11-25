/** Shared helpers for the route handlers. */
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export const serverError = (e: unknown) => {
  console.error(e);
  return json({ error: "Internal server error" }, 500);
};

/** Returns a 415 response if the request lacks application/json content-type. Null means valid. */
export function requireJson(request: Request): Response | null {
  const ct = request.headers.get("content-type") ?? "";
  if (ct.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return json({ error: "Content-Type must be application/json" }, 415);
  }
  return null;
}

/**
 * Reads JSON within a byte ceiling and a fixed 15-second deadline.
 * Returns 415 for a non-JSON media type, or 400, 408, or 413 when the body is rejected.
 */
export async function readJson(request: Request, maxBytes = 4096): Promise<{ body: unknown } | Response> {
  const mediaTypeError = requireJson(request);
  if (mediaTypeError) return mediaTypeError;
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Invalid JSON body" }, 400);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    try {
      const deadline = new Promise<Response>((resolve) => {
        timer = setTimeout(() => resolve(json({ error: "Request body timed out" }, 408)), 15_000);
      });
      const reading = (async () => {
        const decoder = new TextDecoder();
        let bytes = 0;
        let text = "";
        while (true) {
          const { done, value } = await reader.read();
          if (stopped) throw new Error("Body read stopped");
          if (done) {
            text += decoder.decode();
            return { body: JSON.parse(text) as unknown };
          }
          bytes += value.byteLength;
          if (bytes > maxBytes) return json({ error: "Request body too large" }, 413);
          text += decoder.decode(value, { stream: true });
        }
      })();
      return await Promise.race([reading, deadline]);
    } finally {
      stopped = true;
      clearTimeout(timer);
      // Cancellation can stall in the source; do not wait for its cleanup.
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
}

/** Reads a JSON object body with readJson's limits. Returns 400 when the body is not a plain object. */
export async function readJsonObject(
  request: Request,
  maxBytes?: number,
): Promise<{ body: Record<string, unknown> } | Response> {
  const result = await readJson(request, maxBytes);
  if (result instanceof Response) return result;
  const { body } = result;
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Body must be an object" }, 400);
  return { body: body as Record<string, unknown> };
}
