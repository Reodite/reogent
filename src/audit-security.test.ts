import { afterEach, expect, it, vi } from "vitest";
import { GET as preview } from "../app/api/preview/route";
import { appendExchange } from "./server/sessions/store";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/src/server/db", () => ({ getPool: () => ({ query }) }));

afterEach(() => vi.unstubAllGlobals());

it("audit: a rejected ownership upsert still inserts messages", async () => {
  query.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
  await appendExchange("attacker", "victim-session", "injected question", "injected answer");
  expect(query).toHaveBeenCalledTimes(2);
  expect(query.mock.calls[1][0]).toContain("INSERT INTO messages");
  expect(query.mock.calls[1][1][0]).toBe("victim-session");
});

it("audit: preview fetches IPv4-mapped IPv6 loopback", async () => {
  const fetchMock = vi.fn(async () => ({
    url: "http://[::ffff:7f00:1]/",
    text: async () => '<meta property="og:image" content="https://example.test/image.png">',
  }));
  vi.stubGlobal("fetch", fetchMock);
  const response = await preview(
    new Request("http://app.test/api/preview?url=" + encodeURIComponent("http://[::ffff:127.0.0.1]/")),
  );
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(response.status).toBe(302);
});

it("audit: a public preview can request an internal oEmbed endpoint", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      url: "https://example.test/page",
      text: async () => '<link type="application/json+oembed" href="http://127.0.0.1:7700/internal">',
    })
    .mockResolvedValueOnce({ json: async () => ({ thumbnail_url: "https://example.test/image.png" }) });
  vi.stubGlobal("fetch", fetchMock);
  const response = await preview(new Request("http://app.test/api/preview?url=https://example.test/page"));
  expect(fetchMock.mock.calls[1][0]).toBe("http://127.0.0.1:7700/internal");
  expect(response.status).toBe(302);
});
