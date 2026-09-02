import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lookup = vi.hoisted(() => vi.fn());
vi.mock("node:dns/promises", () => ({ lookup }));

const { GET } = await import("./route");

beforeEach(() => {
  lookup.mockReset().mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response('<meta property="og:image" content="https://images.ubc.ca/building.jpg">', {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/preview", () => {
  it("rejects non-HTTPS and non-UBC page hosts", async () => {
    const response = await GET(
      new Request(`http://localhost/api/preview?url=${encodeURIComponent("http://lvh.me:5432/private")}`),
    );
    expect(response.status).toBe(400);
  });

  it("rejects allowlisted names that resolve to private addresses", async () => {
    lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const response = await GET(
      new Request(
        `http://localhost/api/preview?url=${encodeURIComponent("https://learningspaces.ubc.ca/classrooms/test")}`,
      ),
    );
    expect(response.status).toBe(400);
  });

  it("rejects a redirect that leaves the UBC host allowlist", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "https://lvh.me/internal" } }),
    );
    const response = await GET(
      new Request(
        `http://localhost/api/preview?url=${encodeURIComponent("https://learningspaces.ubc.ca/classrooms/redirect")}`,
      ),
    );
    expect(response.status).toBe(400);
  });

  it("redirects only to an allowlisted HTTPS image", async () => {
    const response = await GET(
      new Request(
        `http://localhost/api/preview?url=${encodeURIComponent("https://learningspaces.ubc.ca/classrooms/test")}`,
      ),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://images.ubc.ca/building.jpg");
  });
});
