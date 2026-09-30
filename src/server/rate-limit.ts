import { isIP } from "node:net";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

const MAX_BUCKETS = 10_000;
const buckets = new Map<string, { timestamps: number[]; expiresAt: number }>();

/** Uses a proxy-overwritten single-IP header only when explicitly configured. */
export function getRateLimitIdentity(request: Request): string {
  const header = process.env.TRUSTED_CLIENT_IP_HEADER;
  const value = header ? request.headers.get(header)?.trim() : undefined;
  if (!value || !isIP(value) || value.includes("%")) return "unknown";
  // Normalize alternate IPv6 spellings so they share the same bucket.
  return isIP(value) === 6 ? new URL(`http://[${value}]/`).hostname : value;
}

/** Checks a process-local sliding window; refuses new keys at capacity. */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const windowStart = now - config.windowMs;

  let bucket = buckets.get(key);
  if (!bucket) {
    if (buckets.size >= MAX_BUCKETS) return { allowed: false, retryAfterMs: 60_000 };
    bucket = { timestamps: [], expiresAt: now + config.windowMs };
    buckets.set(key, bucket);
  }
  const { timestamps } = bucket;
  while (timestamps.length > 0 && timestamps[0] <= windowStart) {
    timestamps.shift();
  }

  if (timestamps.length >= config.maxRequests) {
    return { allowed: false, retryAfterMs: Math.max(timestamps[0] + config.windowMs - now, 1000) };
  }

  timestamps.push(now);
  bucket.expiresAt = now + config.windowMs;
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

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.expiresAt <= now) buckets.delete(key);
  }
}, 60_000).unref?.();
