// In-memory sliding-window rate limiter. Tracks request timestamps per key
// and rejects when the count within the window exceeds the threshold.
// Stale entries are evicted on each check to bound memory.

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

const buckets = new Map<string, number[]>();

/** Checks whether a request from `key` is allowed under `config`. */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  let timestamps = buckets.get(key);
  if (!timestamps) {
    timestamps = [];
    buckets.set(key, timestamps);
  }

  // Evict timestamps outside the window
  while (timestamps.length > 0 && timestamps[0] < windowStart) {
    timestamps.shift();
  }

  if (timestamps.length >= config.maxRequests) {
    const oldestInWindow = timestamps[0];
    const retryAfterMs = oldestInWindow + config.windowMs - now;
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
  }

  timestamps.push(now);
  return { allowed: true, retryAfterMs: 0 };
}

/** Returns a 429 Response if the key is rate-limited, otherwise null. */
export function rateLimitResponse(key: string, config: RateLimitConfig): Response | null {
  const result = checkRateLimit(key, config);
  if (result.allowed) return null;
  const retryAfter = Math.ceil(result.retryAfterMs / 1000);
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfter),
    },
  });
}

// Periodic cleanup: evict empty buckets every 60s to prevent unbounded Map growth
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, timestamps] of buckets) {
      // If the most recent timestamp is older than any reasonable window (5 min), evict
      if (timestamps.length === 0 || timestamps[timestamps.length - 1] < now - 300_000) {
        buckets.delete(key);
      }
    }
  }, 60_000).unref?.();
}
