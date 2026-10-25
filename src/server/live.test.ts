import { afterEach, describe, expect, it, vi } from "vitest";
import { liveJson } from "./live";

afterEach(() => vi.unstubAllGlobals());

describe("liveJson", () => {
  it("reuses a response within its TTL and keys POSTs by body", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await liveJson("https://example.test/a", 60_000);
    await liveJson("https://example.test/a", 60_000);
    await liveJson("https://example.test/a", 60_000, { method: "POST", body: "x=1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("names the host on failure and retries on the next call", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 502 }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(liveJson("https://example.test/b", 60_000)).rejects.toThrow("example.test returned 502");
    await expect(liveJson("https://example.test/b", 60_000)).resolves.toEqual({ ok: true });
  });
});
