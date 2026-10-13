import type { LookupAddress, LookupOptions } from "node:dns";
import { EventEmitter } from "node:events";
import type { IncomingHttpHeaders, IncomingMessage } from "node:http";
import type { RequestOptions } from "node:https";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { lookup, httpsRequest, identity, limit } = vi.hoisted(() => ({
  lookup: vi.fn(),
  httpsRequest: vi.fn(),
  identity: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("node:dns/promises", () => ({ lookup }));
vi.mock("node:https", () => ({ request: httpsRequest }));
vi.mock("@/src/server/rate-limit", () => ({ getRateLimitIdentity: identity, rateLimitResponse: limit }));

const PAGE = "https://learningspaces.ubc.ca/classrooms/test";
const IMAGE = "https://images.ubc.ca/building.jpg";
const PUBLIC = [
  { address: "8.8.8.8", family: 4 },
  { address: "2606:4700:4700::1111", family: 6 },
];
const META = `<meta property="og:image" content="${IMAGE}">`;
const OEMBED = '<link type="application/json+oembed" href="https://embed.ubc.ca/data?x=1&amp;y=2">';

type Reply = {
  status?: number;
  headers?: IncomingHttpHeaders;
  chunks?: Array<string | Buffer>;
  stall?: "headers" | "body";
  error?: Error;
};
const replies: Reply[] = [];
const connections: Array<{
  url: URL;
  options: RequestOptions;
  request: EventEmitter & { end: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> };
  response: PassThrough & { statusCode: number; headers: IncomingHttpHeaders };
  delivered: number;
}> = [];
let GET: typeof import("./route").GET;

function preview(url = PAGE): Promise<Response> {
  return GET(new Request(`http://localhost/api/preview?url=${encodeURIComponent(url)}`));
}

function pinnedLookup(options: LookupOptions, index = 0, hostname = connections[index].url.hostname) {
  return new Promise<{ address: string | LookupAddress[]; family?: number }>((resolve, reject) => {
    const lookup = connections[index].options.lookup;
    if (!lookup) throw new Error("Missing pinned lookup");
    lookup(hostname, options, (error, address, family) => {
      if (error) reject(error);
      else resolve({ address, family });
    });
  });
}

beforeEach(async () => {
  vi.resetModules();
  replies.length = 0;
  connections.length = 0;
  lookup.mockReset().mockImplementation(async () => PUBLIC.map((entry) => ({ ...entry })));
  identity.mockReset().mockReturnValue("test-client");
  limit.mockReset().mockReturnValue(null);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unpinned global fetch is forbidden");
    }),
  );
  httpsRequest
    .mockReset()
    .mockImplementation((url: URL, options: RequestOptions, callback: (res: IncomingMessage) => void) => {
      const reply = replies.shift() ?? { chunks: [META] };
      const response = Object.assign(new PassThrough(), {
        statusCode: reply.status ?? 200,
        headers: reply.headers ?? {},
      });
      const request = Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn() });
      let destroyed = false;
      request.destroy.mockImplementation((error?: Error) => {
        destroyed = true;
        response.destroy();
        if (error) queueMicrotask(() => request.emit("error", error));
        return request;
      });
      const connection = { url, options, request, response, delivered: 0 };
      connections.push(connection);
      request.end.mockImplementation(() => {
        queueMicrotask(async () => {
          try {
            await pinnedLookup({ all: true, family: 0 }, connections.indexOf(connection));
          } catch (error) {
            request.emit("error", error);
            return;
          }
          if (destroyed) return;
          if (reply.error) {
            request.emit("error", reply.error);
            return;
          }
          if (reply.stall === "headers") return;
          callback(response as unknown as IncomingMessage);
          for (const chunk of reply.chunks ?? []) {
            if (response.destroyed) break;
            connection.delivered++;
            response.write(chunk);
          }
          if (!response.destroyed && reply.stall !== "body") response.end();
        });
        return request;
      });
      return request;
    });
  ({ GET } = await import("./route"));
});

afterEach(() => {
  for (const { response } of connections) response.destroy();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("GET /api/preview", () => {
  it("pins validated public addresses without resolving again and preserves TLS identity", async () => {
    let pageLookups = 0;
    lookup.mockImplementation(async (host: string) => {
      if (host === "learningspaces.ubc.ca" && ++pageLookups > 1) return [{ address: "127.0.0.1", family: 4 }];
      return PUBLIC;
    });
    const response = await preview();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(IMAGE);
    expect(pageLookups).toBe(1);
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(httpsRequest).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(connections[0].url.href).toBe(PAGE);
    expect(connections[0].options).toMatchObject({
      servername: "learningspaces.ubc.ca",
      rejectUnauthorized: true,
      agent: false,
    });
    expect(await pinnedLookup({ all: true })).toEqual({ address: PUBLIC, family: undefined });
    expect(await pinnedLookup({ family: 4 })).toEqual({ address: PUBLIC[0].address, family: 4 });
    expect(await pinnedLookup({ family: "IPv6" })).toEqual({ address: PUBLIC[1].address, family: 6 });
    expect(await pinnedLookup({ all: true, family: 6 })).toEqual({ address: [PUBLIC[1]], family: undefined });
    expect(await pinnedLookup({ all: false })).toEqual({ address: PUBLIC[0].address, family: 4 });
    await expect(pinnedLookup({ family: 5 })).rejects.toThrow();
    await expect(pinnedLookup({}, 0, "attacker.ubc.ca")).rejects.toThrow();
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it("fails lookup for an unavailable family without falling back to DNS", async () => {
    lookup.mockResolvedValue([PUBLIC[0]]);
    expect((await preview()).status).toBe(302);
    await expect(pinnedLookup({ family: 6 })).rejects.toThrow();
    await expect(pinnedLookup({ all: true, family: 6 })).rejects.toThrow();
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it.each([
    "http://ubc.ca/page",
    "https://ubc.ca:444/page",
    "https://user:pass@ubc.ca/page",
    "https://user@ubc.ca/page",
    "https://ubc.ca.evil.test/page",
    "https://notubc.ca/page",
    "https://127.0.0.1/page",
    "https://[::1]/page",
    "not a url",
  ])("rejects unsafe URL %s before DNS or transport", async (url) => {
    expect((await preview(url)).status).toBe(400);
    expect(lookup).not.toHaveBeenCalled();
    expect(httpsRequest).not.toHaveBeenCalled();
  });

  it("accepts the apex host and explicit default HTTPS port", async () => {
    expect((await preview("https://ubc.ca:443/page")).status).toBe(302);
    expect(connections[0].url.port).toBe("");
  });

  it.each([
    "0.1.2.3",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "192.0.0.9",
    "192.0.2.1",
    "192.88.99.1",
    "192.168.0.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fe80::1",
    "fec0::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:8.8.8.8",
    "::127.0.0.1",
    "64:ff9b::7f00:1",
    "64:ff9b:1::1",
    "100::1",
    "2001::1",
    "2001:2::1",
    "2001:10::1",
    "2001:20::1",
    "2001:db8::1",
    "2002:7f00:1::1",
    "3ffe::1",
    "3fff::1",
    "4000::1",
    "2606:4700::1%eth0",
    "invalid",
  ])("rejects nonpublic or transition address %s", async (address) => {
    lookup.mockResolvedValue([{ address, family: address.includes(":") ? 6 : 4 }]);
    expect((await preview()).status).toBe(400);
    expect(httpsRequest).not.toHaveBeenCalled();
  });

  it.each([
    { addresses: [] },
    { addresses: [PUBLIC[0], { address: "10.0.0.1", family: 4 }] },
    { addresses: [PUBLIC[1], { address: "::1", family: 6 }] },
    { addresses: [{ address: "8.8.8.8", family: 6 }] },
  ])("rejects empty, mixed or inconsistent DNS answers $addresses", async ({ addresses }) => {
    lookup.mockResolvedValue(addresses);
    expect((await preview()).status).toBe(400);
    expect(httpsRequest).not.toHaveBeenCalled();
  });

  it("fails closed on DNS errors", async () => {
    lookup.mockRejectedValue(new Error("DNS unavailable"));
    expect((await preview()).status).toBe(400);
    expect(httpsRequest).not.toHaveBeenCalled();
  });

  it("destroys redirect bodies before independently validating and pinning the next hop", async () => {
    replies.push(
      { status: 302, headers: { location: "https://redirect.ubc.ca/next" }, stall: "body" },
      { chunks: [META] },
    );
    lookup.mockImplementation(async (host: string) => {
      if (host === "redirect.ubc.ca") expect(connections[0].response.destroyed).toBe(true);
      return [host === "redirect.ubc.ca" ? PUBLIC[1] : PUBLIC[0]];
    });
    expect((await preview()).status).toBe(302);
    expect(connections[1].url.hostname).toBe("redirect.ubc.ca");
    expect((await pinnedLookup({ all: true }, 1)).address).toEqual([PUBLIC[1]]);
    expect(connections[1].options.servername).toBe("redirect.ubc.ca");
    expect(lookup).toHaveBeenCalledTimes(3);
  });

  it.each([
    "https://evil.test/internal",
    "http://ubc.ca/internal",
    "https://ubc.ca:444/internal",
    "https://x@ubc.ca/internal",
  ])("rejects unsafe redirect %s and closes its body", async (location) => {
    replies.push({ status: 302, headers: { location }, stall: "body" });
    expect((await preview()).status).toBe(400);
    expect(httpsRequest).toHaveBeenCalledTimes(1);
    expect(connections[0].response.destroyed).toBe(true);
  });

  it("rejects private DNS on a same-host redirect", async () => {
    replies.push({ status: 302, headers: { location: "/next" }, stall: "body" });
    lookup.mockResolvedValueOnce(PUBLIC).mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    expect((await preview()).status).toBe(400);
    expect(httpsRequest).toHaveBeenCalledTimes(1);
    expect(connections[0].response.destroyed).toBe(true);
  });

  it("limits redirects and destroys each abandoned response", async () => {
    for (let i = 0; i < 4; i++) replies.push({ status: 302, headers: { location: `/hop-${i}` }, stall: "body" });
    expect((await preview()).status).toBe(400);
    expect(httpsRequest).toHaveBeenCalledTimes(4);
    expect(connections.every(({ response }) => response.destroyed)).toBe(true);
  });

  it("rejects redirects without a location", async () => {
    replies.push({ status: 302, stall: "body" });
    expect((await preview()).status).toBe(400);
    expect(connections[0].response.destroyed).toBe(true);
  });

  it("validates and pins oEmbed requests and redirects", async () => {
    replies.push(
      { chunks: [OEMBED] },
      { status: 302, headers: { location: "/final" }, stall: "body" },
      { chunks: [JSON.stringify({ thumbnail_url: IMAGE })] },
    );
    expect((await preview()).status).toBe(302);
    expect(connections.map(({ url }) => url.href)).toEqual([
      PAGE,
      "https://embed.ubc.ca/data?x=1&y=2",
      "https://embed.ubc.ca/final",
    ]);
    expect(connections[1].response.destroyed).toBe(true);
    expect(lookup).toHaveBeenCalledTimes(4);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["https://evil.test/data", "https://embed.ubc.ca:444/data", "https://u@embed.ubc.ca/data"])(
    "does not fetch unsafe oEmbed endpoint %s",
    async (endpoint) => {
      replies.push({ chunks: [`<link type="application/json+oembed" href="${endpoint}">`] });
      expect((await preview()).status).not.toBe(302);
      expect(httpsRequest).toHaveBeenCalledTimes(1);
    },
  );

  it("rejects private oEmbed DNS", async () => {
    replies.push({ chunks: [OEMBED] });
    lookup.mockResolvedValueOnce(PUBLIC).mockResolvedValue([{ address: "10.0.0.1", family: 4 }]);
    expect((await preview()).status).not.toBe(302);
    expect(httpsRequest).toHaveBeenCalledTimes(1);
  });

  it("rejects an oEmbed redirect to private DNS", async () => {
    replies.push(
      { chunks: [OEMBED] },
      { status: 302, headers: { location: "https://private.ubc.ca/data" }, stall: "body" },
    );
    lookup
      .mockResolvedValueOnce(PUBLIC)
      .mockResolvedValueOnce(PUBLIC)
      .mockResolvedValue([{ address: "10.0.0.1", family: 4 }]);
    expect((await preview()).status).not.toBe(302);
    expect(httpsRequest).toHaveBeenCalledTimes(2);
    expect(connections[1].response.destroyed).toBe(true);
  });

  it.each([false, true])("bounds streamed bytes before parsing, oEmbed=%s", async (oembed) => {
    if (oembed) replies.push({ chunks: [OEMBED] });
    replies.push({ chunks: [oembed ? '{"thumbnail_url":"' : META, "é".repeat(150_000), "unread"], stall: "body" });
    expect((await preview()).status).not.toBe(302);
    const connection = connections[oembed ? 1 : 0];
    expect(connection.response.destroyed).toBe(true);
    expect(connection.request.destroy).toHaveBeenCalled();
    expect(connection.delivered).toBe(2);
    expect(lookup).toHaveBeenCalledTimes(oembed ? 2 : 1);
  });

  it("accepts exactly the HTML byte limit", async () => {
    replies.push({ chunks: [META, " ".repeat(300_000 - Buffer.byteLength(META))] });
    expect((await preview()).status).toBe(302);
  });

  it("does not decompress encoded upstream bodies", async () => {
    replies.push({ headers: { "content-encoding": "gzip" }, chunks: [META] });
    expect((await preview()).status).toBe(404);
    expect(connections[0].response.destroyed).toBe(true);
  });

  it.each(["headers", "body"] as const)("destroys stalled %s at the deadline", async (stall) => {
    vi.useFakeTimers();
    replies.push({ stall });
    const pending = preview();
    await vi.advanceTimersByTimeAsync(5000);
    expect((await pending).status).toBe(404);
    expect(connections[0].request.destroy).toHaveBeenCalled();
    expect(connections[0].response.destroyed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("destroys stalled oEmbed bodies at the shared deadline", async () => {
    vi.useFakeTimers();
    replies.push({ chunks: [OEMBED] }, { chunks: ['{"thumbnail_url":"'], stall: "body" });
    const pending = preview();
    await vi.advanceTimersByTimeAsync(5000);
    expect((await pending).status).toBe(404);
    expect(connections).toHaveLength(2);
    expect(connections[1].request.destroy).toHaveBeenCalled();
    expect(connections[1].response.destroyed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([false, true])("bounds final image DNS, cached=%s", async (cached) => {
    vi.useFakeTimers();
    if (cached) expect((await preview()).status).toBe(302);
    lookup.mockImplementation((host: string) =>
      host === "images.ubc.ca" ? new Promise(() => {}) : Promise.resolve(PUBLIC),
    );
    const pending = preview();
    await vi.advanceTimersByTimeAsync(5000);
    expect((await pending).status).toBe(404);
    expect(httpsRequest).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels an active request when the client disconnects", async () => {
    vi.useFakeTimers();
    replies.push({ stall: "body" });
    const controller = new AbortController();
    const pending = GET(
      new Request(`http://localhost/api/preview?url=${encodeURIComponent(PAGE)}`, { signal: controller.signal }),
    );
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    expect((await pending).status).toBe(404);
    expect(connections[0].request.destroy).toHaveBeenCalled();
    expect(connections[0].response.destroyed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects a truncated body and destroys its request", async () => {
    vi.useFakeTimers();
    replies.push({ chunks: [META], stall: "body" });
    const pending = preview();
    await vi.advanceTimersByTimeAsync(0);
    connections[0].response.destroy();
    expect((await pending).status).toBe(404);
    expect(connections[0].request.destroy).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds stalled DNS and prevents late answers from starting a request", async () => {
    vi.useFakeTimers();
    let finish!: (addresses: LookupAddress[]) => void;
    lookup.mockImplementation(
      () =>
        new Promise<LookupAddress[]>((resolve) => {
          finish = resolve;
        }),
    );
    const pending = preview();
    await vi.advanceTimersByTimeAsync(5000);
    expect((await pending).status).toBe(404);
    finish(PUBLIC);
    await vi.advanceTimersByTimeAsync(0);
    expect(httpsRequest).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shares one deadline across DNS, redirects and body reads", async () => {
    vi.useFakeTimers();
    lookup.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(PUBLIC), 2000);
        }),
    );
    replies.push({ status: 302, headers: { location: "/next" }, stall: "body" }, { stall: "body" });
    const pending = preview();
    await vi.advanceTimersByTimeAsync(4999);
    expect(connections).toHaveLength(2);
    expect(connections[1].request.destroy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).status).toBe(404);
    expect(connections[1].request.destroy).toHaveBeenCalled();
  });

  it.each(["https://evil.test/image.jpg", "https://images.ubc.ca:444/image.jpg", "https://u@images.ubc.ca/image.jpg"])(
    "validates final image redirect %s",
    async (image) => {
      replies.push({ chunks: [`<meta property="og:image" content="${image}">`] });
      expect((await preview()).status).toBe(400);
    },
  );

  it("validates image DNS and revalidates cached image DNS", async () => {
    expect((await preview()).status).toBe(302);
    lookup.mockImplementation(async (host: string) =>
      host === "images.ubc.ca" ? [{ address: "127.0.0.1", family: 4 }] : PUBLIC,
    );
    expect((await preview()).status).toBe(400);
    expect(httpsRequest).toHaveBeenCalledTimes(1);
    expect(lookup.mock.calls.map(([host]) => host)).toEqual([
      "learningspaces.ubc.ca",
      "images.ubc.ca",
      "learningspaces.ubc.ca",
      "images.ubc.ca",
    ]);
  });

  it("rejects private DNS for an uncached image", async () => {
    lookup.mockResolvedValueOnce(PUBLIC).mockResolvedValue([{ address: "::1", family: 6 }]);
    expect((await preview()).status).toBe(400);
    expect(httpsRequest).toHaveBeenCalledTimes(1);
  });

  it("preserves relative image selection after a page redirect", async () => {
    replies.push(
      { status: 302, headers: { location: "https://redirect.ubc.ca/buildings/room" } },
      { chunks: ['<img src="/logo.svg"><img src="photos/room.jpg">'] },
    );
    const response = await preview();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://redirect.ubc.ca/buildings/photos/room.jpg");
  });

  it("keeps the cache bounded to 128 entries", async () => {
    for (let i = 0; i <= 128; i++) expect((await preview(`${PAGE}?page=${i}`)).status).toBe(302);
    expect(httpsRequest).toHaveBeenCalledTimes(129);
    expect((await preview(`${PAGE}?page=128`)).status).toBe(302);
    expect(httpsRequest).toHaveBeenCalledTimes(129);
    expect((await preview(`${PAGE}?page=0`)).status).toBe(302);
    expect(httpsRequest).toHaveBeenCalledTimes(130);
  });

  it("uses unexpired cache entries and refetches after one hour", async () => {
    vi.useFakeTimers();
    expect((await preview()).status).toBe(302);
    expect((await preview()).status).toBe(302);
    expect(httpsRequest).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect((await preview()).status).toBe(302);
    expect(httpsRequest).toHaveBeenCalledTimes(2);
  });

  it("returns upstream failure without reading its body", async () => {
    replies.push({ status: 500, stall: "body" });
    expect((await preview()).status).toBe(404);
    expect(connections[0].response.destroyed).toBe(true);
  });

  it("fails closed on TLS verification errors", async () => {
    replies.push({ error: new Error("certificate has expired") });
    expect((await preview()).status).toBe(404);
    expect(connections[0].options.rejectUnauthorized).toBe(true);
    expect(httpsRequest).toHaveBeenCalledTimes(1);
  });

  it("applies the existing rate limiter before DNS and cache work", async () => {
    const limited = new Response("limited", { status: 429, headers: { "Retry-After": "60" } });
    limit.mockReturnValue(limited);
    expect(await preview()).toBe(limited);
    expect(identity).toHaveBeenCalledOnce();
    expect(limit).toHaveBeenCalledWith("preview:test-client", { windowMs: 60_000, maxRequests: 60 });
    expect(lookup).not.toHaveBeenCalled();
    expect(httpsRequest).not.toHaveBeenCalled();
  });
});
