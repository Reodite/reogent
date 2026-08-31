// Resolve a link to a preview image: og:image (what Discord etc. use), else
// oEmbed thumbnail, else the page's first content image (room pages carry
// fresh photo URLs — the stored thumbnails are signed and go stale). 404 if
// nothing resolves.
//
// Unauthenticated by design: <img src> can't send a bearer token. It only ever
// redirects to an image URL discovered on a public page.

const cache = new Map<string, { img: string; t: number }>(); // per-instance; signed URLs re-resolve hourly
const PREVIEW_TTL = 60 * 60 * 1000;

/** Reject obvious internal targets — this endpoint fetches caller-supplied URLs. */
// Hostname-literal blocklist only; add DNS resolution checks if this is ever exposed beyond a trusted dev tool.
function isPrivateHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.|\[?::1)/.test(hostname)
  );
}

function findMeta(html: string, name: string): string | undefined {
  return (
    html.match(new RegExp(`(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`, "i"))?.[1] ??
    html.match(new RegExp(`content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`, "i"))?.[1]
  );
}

async function resolvePreview(url: string): Promise<string | null> {
  const page = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "follow" });
  const html = (await page.text()).slice(0, 300_000);
  let img = findMeta(html, "og:image") ?? findMeta(html, "twitter:image");
  if (!img) {
    // WordPress etc. expose the preview via oEmbed (what Discord falls back to)
    const oembed = html.match(/<link[^>]*json\+oembed[^>]*href=["']([^"']+)["']/i)?.[1];
    if (oembed) {
      const o = await fetch(oembed.replace(/&(amp|#0?38);/g, "&"), { signal: AbortSignal.timeout(5000) })
        .then((r) => r.json() as Promise<{ thumbnail_url?: string }>)
        .catch(() => null);
      img = o?.thumbnail_url;
    }
  }
  if (!img) {
    const candidates = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/g)]
      .map((m) => m[1])
      .filter((s) => !s.startsWith("data:") && !/\.svg|facebook\.com\/tr|\/pixel|1x1/i.test(s));
    img =
      candidates.find((s) => /upload|cdn|content|media|photo|image/i.test(s) && !/icon|logo|avatar|sprite/i.test(s)) ??
      candidates[0];
  }
  return img ? new URL(img, page.url).href : null;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url).searchParams.get("url");
  if (!url || !/^https?:\/\//.test(url) || isPrivateHost(new URL(url).hostname)) {
    return Response.json({ error: "bad url" }, { status: 400 });
  }
  const hit = cache.get(url);
  if (hit && Date.now() - hit.t < PREVIEW_TTL) return Response.redirect(hit.img, 302);

  const img = await resolvePreview(url).catch(() => null);
  if (!img) return new Response(null, { status: 404 }); // never cache failures — retry next request
  cache.set(url, { img, t: Date.now() });
  return Response.redirect(img, 302);
}
