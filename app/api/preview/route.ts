import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const cache = new Map<string, { image: string; cachedAt: number }>();
const PREVIEW_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 128;
const MAX_REDIRECTS = 3;
const MAX_PAGE_BYTES = 300_000;

class UnsafePreviewUrl extends Error {}

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "ubc.ca" || host.endsWith(".ubc.ca");
}

function privateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function privateIp(address: string): boolean {
  const normalized = address.toLowerCase();
  const family = isIP(normalized);
  if (family === 4) return privateIpv4(normalized);
  if (family !== 6) return true;
  if (normalized.startsWith("::ffff:")) return privateIpv4(normalized.slice(7));
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith("2001:db8:")
  );
}

async function validateUrl(value: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new UnsafePreviewUrl("Invalid URL");
  }
  if (url.protocol !== "https:" || url.username || url.password || !isAllowedHost(url.hostname)) {
    throw new UnsafePreviewUrl("Unapproved preview host");
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true }).catch(() => []);
  if (addresses.length === 0 || addresses.some(({ address }) => privateIp(address))) {
    throw new UnsafePreviewUrl("Preview host resolved to a private address");
  }
  return url;
}

async function safeFetch(value: string): Promise<{ response: Response; url: URL }> {
  let url = await validateUrl(value);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "manual" });
    if (response.status < 300 || response.status >= 400) return { response, url };
    const location = response.headers.get("location");
    if (!location || redirects === MAX_REDIRECTS) throw new UnsafePreviewUrl("Invalid preview redirect");
    url = await validateUrl(new URL(location, url).href);
  }
  throw new UnsafePreviewUrl("Preview redirect limit exceeded");
}

function findMeta(html: string, name: string): string | undefined {
  return (
    html.match(new RegExp(`(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`, "i"))?.[1] ??
    html.match(new RegExp(`content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`, "i"))?.[1]
  );
}

async function resolvePreview(value: string): Promise<string | null> {
  const page = await safeFetch(value);
  if (!page.response.ok) return null;
  const html = (await page.response.text()).slice(0, MAX_PAGE_BYTES);
  let image = findMeta(html, "og:image") ?? findMeta(html, "twitter:image");
  if (!image) {
    const oembed = html.match(/<link[^>]*json\+oembed[^>]*href=["']([^"']+)["']/i)?.[1];
    if (oembed) {
      const endpoint = oembed.replace(/&(amp|#0?38);/g, "&");
      const response = await safeFetch(new URL(endpoint, page.url).href).catch(() => null);
      if (response?.response.ok) {
        const body = (await response.response.json().catch(() => null)) as { thumbnail_url?: unknown } | null;
        image = typeof body?.thumbnail_url === "string" ? body.thumbnail_url : undefined;
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
  return (await validateUrl(new URL(image, page.url).href)).href;
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
  const value = new URL(request.url).searchParams.get("url");
  if (!value || value.length > 2048) return Response.json({ error: "bad url" }, { status: 400 });
  try {
    await validateUrl(value);
    const hit = cache.get(value);
    if (hit && Date.now() - hit.cachedAt < PREVIEW_TTL_MS) return Response.redirect(hit.image, 302);
    const image = await resolvePreview(value);
    if (!image) return new Response(null, { status: 404 });
    cachePreview(value, image);
    return Response.redirect(image, 302);
  } catch (error) {
    if (error instanceof UnsafePreviewUrl) return Response.json({ error: "bad url" }, { status: 400 });
    return new Response(null, { status: 404 });
  }
}
