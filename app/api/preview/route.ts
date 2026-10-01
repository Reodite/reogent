import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import type { IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import { getRateLimitIdentity, rateLimitResponse } from "@/src/server/rate-limit";

const cache = new Map<string, { image: string; cachedAt: number }>();
const PREVIEW_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 128;
const MAX_REDIRECTS = 3;
const MAX_PAGE_BYTES = 300_000;
const PREVIEW_TIMEOUT_MS = 5000;
const PREVIEW_LIMIT = { windowMs: 60_000, maxRequests: 60 };

const blockedAddresses = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedAddresses.addSubnet(address, prefix, "ipv4");
}
// Admit IPv6 global unicast, excluding special-use and transition ranges.
const globalIpv6 = new BlockList();
globalIpv6.addSubnet("2000::", 3, "ipv6");
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3ffe::", 16],
  ["3fff::", 20],
] as const) {
  blockedAddresses.addSubnet(address, prefix, "ipv6");
}

class UnsafePreviewUrl extends Error {}

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "ubc.ca" || host.endsWith(".ubc.ca");
}

function publicAddress({ address, family }: LookupAddress): boolean {
  if (address.includes("%") || isIP(address) !== family) return false;
  if (family === 4) return !blockedAddresses.check(address, "ipv4");
  return family === 6 && globalIpv6.check(address, "ipv6") && !blockedAddresses.check(address, "ipv6");
}

async function validateUrl(value: string, signal: AbortSignal): Promise<{ url: URL; addresses: LookupAddress[] }> {
  signal.throwIfAborted();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UnsafePreviewUrl("Invalid URL");
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password || !isAllowedHost(url.hostname)) {
    throw new UnsafePreviewUrl("Unapproved preview host");
  }
  const addresses = await new Promise<LookupAddress[]>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    // OS DNS lookup cannot be cancelled; discard late answers after the deadline.
    lookup(url.hostname, { all: true, order: "verbatim" })
      .then(resolve, () => reject(new UnsafePreviewUrl("Preview DNS lookup failed")))
      .finally(() => signal.removeEventListener("abort", abort));
  });
  signal.throwIfAborted();
  if (addresses.length === 0 || !addresses.every(publicAddress)) {
    throw new UnsafePreviewUrl("Preview host resolved to a nonpublic address");
  }
  return { url, addresses: addresses.map(({ address, family }) => ({ address, family })) };
}

function fetchPage(
  { url, addresses }: Awaited<ReturnType<typeof validateUrl>>,
  signal: AbortSignal,
): Promise<{ status: number; location?: string; body: string }> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    let response: IncomingMessage | undefined;
    let finished = false;
    const finish = (error?: Error, body = "") => {
      if (finished) return;
      finished = true;
      signal.removeEventListener("abort", abort);
      response?.destroy();
      outgoing.destroy();
      if (error) reject(error);
      else resolve({ status: response?.statusCode ?? 0, location: response?.headers.location, body });
    };
    const abort = () => finish(signal.reason);
    const outgoing = httpsRequest(
      url,
      {
        agent: false,
        servername: url.hostname,
        rejectUnauthorized: true,
        headers: { "Accept-Encoding": "identity" },
        lookup(hostname, options, callback) {
          const family = options.family === "IPv4" ? 4 : options.family === "IPv6" ? 6 : options.family;
          const matches = addresses.filter((entry) => !family || entry.family === family);
          if (hostname !== url.hostname || matches.length === 0) {
            callback(new UnsafePreviewUrl("No validated address for preview host"), "", 0);
          } else if (options.all) {
            callback(null, matches);
          } else {
            callback(null, matches[0].address, matches[0].family);
          }
        },
      },
      (incoming) => {
        response = incoming;
        incoming.on("error", finish);
        incoming.on("aborted", () => finish(new Error("Preview body aborted")));
        incoming.on("close", () => {
          if (!finished) finish(new Error("Preview body closed early"));
        });
        const status = incoming.statusCode ?? 0;
        if (status < 200 || status >= 300) {
          finish();
          return;
        }
        const encoding = incoming.headers["content-encoding"];
        if (encoding && encoding !== "identity") {
          finish(new Error("Unsupported preview encoding"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        incoming.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_PAGE_BYTES) {
            finish(new Error("Preview body exceeds byte limit"));
            return;
          }
          if (chunk.length) chunks.push(chunk);
        });
        incoming.on("end", () => {
          if (!finished) finish(undefined, Buffer.concat(chunks, size).toString("utf8"));
        });
      },
    );
    outgoing.on("error", finish);
    signal.addEventListener("abort", abort, { once: true });
    outgoing.end();
  });
}

async function safeFetch(target: Awaited<ReturnType<typeof validateUrl>>, signal: AbortSignal) {
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const response = await fetchPage(target, signal);
    if (response.status < 300 || response.status >= 400) return { ...response, url: target.url };
    if (!response.location || redirects === MAX_REDIRECTS) throw new UnsafePreviewUrl("Invalid preview redirect");
    target = await validateUrl(new URL(response.location, target.url).href, signal);
  }
  throw new UnsafePreviewUrl("Preview redirect limit exceeded");
}

function findMeta(html: string, name: string): string | undefined {
  return (
    html.match(new RegExp(`(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`, "i"))?.[1] ??
    html.match(new RegExp(`content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`, "i"))?.[1]
  );
}

async function resolvePreview(
  target: Awaited<ReturnType<typeof validateUrl>>,
  signal: AbortSignal,
): Promise<string | null> {
  const page = await safeFetch(target, signal);
  if (page.status < 200 || page.status >= 300) return null;
  const html = page.body;
  let image = findMeta(html, "og:image") ?? findMeta(html, "twitter:image");
  if (!image) {
    const oembed = html.match(/<link[^>]*json\+oembed[^>]*href=["']([^"']+)["']/i)?.[1];
    if (oembed) {
      const endpoint = oembed.replace(/&(amp|#0?38);/g, "&");
      try {
        const response = await safeFetch(await validateUrl(new URL(endpoint, page.url).href, signal), signal);
        if (response.status >= 200 && response.status < 300) {
          const body = JSON.parse(response.body) as { thumbnail_url?: unknown } | null;
          image = typeof body?.thumbnail_url === "string" ? body.thumbnail_url : undefined;
        }
      } catch {
        signal.throwIfAborted();
      }
    }
  }
  if (!image) {
    const candidates = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/g)]
      .map((match) => match[1])
      .filter((source) => !source.startsWith("data:") && !/\.svg|facebook\.com\/tr|\/pixel|1x1/i.test(source));
    image =
      candidates.find(
        (source) => /upload|cdn|content|media|photo|image/i.test(source) && !/icon|logo|avatar|sprite/i.test(source),
      ) ?? candidates[0];
  }
  if (!image) return null;
  return (await validateUrl(new URL(image, page.url).href, signal)).url.href;
}

function cachePreview(url: string, image: string): void {
  while (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (typeof oldest !== "string") break;
    cache.delete(oldest);
  }
  cache.set(url, { image, cachedAt: Date.now() });
}

/** Resolves an allowlisted UBC page to an allowlisted UBC preview image. */
export async function GET(request: Request): Promise<Response> {
  const limited = rateLimitResponse(`preview:${getRateLimitIdentity(request)}`, PREVIEW_LIMIT);
  if (limited) return limited;
  const value = new URL(request.url).searchParams.get("url");
  if (!value || value.length > 2048) return Response.json({ error: "bad url" }, { status: 400 });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("Preview deadline exceeded")), PREVIEW_TIMEOUT_MS);
  const signal = AbortSignal.any([controller.signal, request.signal]);
  try {
    const target = await validateUrl(value, signal);
    const hit = cache.get(value);
    if (hit && Date.now() - hit.cachedAt < PREVIEW_TTL_MS) {
      const image = await validateUrl(hit.image, signal);
      return Response.redirect(image.url.href, 302);
    }
    const image = await resolvePreview(target, signal);
    if (!image) return new Response(null, { status: 404 });
    cachePreview(value, image);
    return Response.redirect(image, 302);
  } catch (error) {
    if (error instanceof UnsafePreviewUrl) return Response.json({ error: "bad url" }, { status: 400 });
    return new Response(null, { status: 404 });
  } finally {
    clearTimeout(timer);
  }
}
