const TIMEOUT_MS = 10_000;

const cache = new Map<string, { expires: number; value: Promise<unknown> }>();

async function request(url: string, init?: RequestInit): Promise<unknown> {
  const host = new URL(url).host;
  let response: Response;
  try {
    response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new Error(`${host} is unreachable`);
  }
  if (!response.ok) throw new Error(`${host} returned ${response.status}`);
  return response.json();
}

/**
 * Fetches JSON from a live upstream API and memoizes the parsed body per URL
 * and request body for `ttlMs`. Evicts failed requests so the next call
 * retries. Throws naming the upstream host on network failure, timeout, or a
 * non-2xx status.
 */
export function liveJson(
  url: string,
  ttlMs: number,
  init?: { method?: "POST"; body?: string; headers?: Record<string, string> },
): Promise<unknown> {
  const key = `${url}\n${init?.body ?? ""}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.value;
  for (const [k, entry] of cache) if (entry.expires <= now) cache.delete(k);

  const value = request(url, init);
  value.catch(() => {
    if (cache.get(key)?.value === value) cache.delete(key);
  });
  cache.set(key, { expires: now + ttlMs, value });
  return value;
}
