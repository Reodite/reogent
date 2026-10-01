import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getDocuments, index, rateLimitResponse } = vi.hoisted(() => ({
  getDocuments: vi.fn(),
  index: vi.fn(),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@/src/server/search", () => ({ getSearch: () => ({ index }) }));
vi.mock("@/src/server/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/server/rate-limit")>()),
  rateLimitResponse,
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "");
  index.mockReset().mockReturnValue({ getDocuments });
  getDocuments.mockReset();
  rateLimitResponse.mockReset().mockReturnValue(null);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const request = () =>
  new Request("http://localhost/api/course-index", { headers: { "x-forwarded-for": "192.0.2.1, 192.0.2.2" } });

describe("GET /api/course-index", () => {
  it("normalizes and sorts paginated records, retains nulls, and reuses the completed cache", async () => {
    getDocuments
      .mockResolvedValueOnce({
        results: [{ code: "MATH_V 100", title: "Calculus", credits: 3, prerequisite: "MATH 12" }],
        total: 5001,
      })
      .mockResolvedValueOnce({ results: [{ code: "CPSC_V 110", title: "Computation" }], total: 5001 });
    const { GET } = await import("./route");
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    const body = await response.json();
    expect(body).toEqual({
      courses: [
        { code: "CPSC 110", title: "Computation", credits: null, prerequisite: null, corequisite: null },
        { code: "MATH 100", title: "Calculus", credits: 3, prerequisite: "MATH 12", corequisite: null },
      ],
    });
    expect(index).toHaveBeenCalledWith("courses");
    expect(getDocuments.mock.calls.map(([options]) => options)).toEqual([
      { fields: ["code", "title", "credits", "prerequisite", "corequisite"], limit: 5000, offset: 0 },
      { fields: ["code", "title", "credits", "prerequisite", "corequisite"], limit: 5000, offset: 5000 },
    ]);
    expect(await (await GET(request())).json()).toEqual(body);
    expect(getDocuments).toHaveBeenCalledTimes(2);
    expect(rateLimitResponse).toHaveBeenCalledTimes(2);
    expect(rateLimitResponse).toHaveBeenCalledWith(
      "course-index:unknown",
      expect.objectContaining({ windowMs: 60000 }),
    );
  });

  it("returns a rate-limit response without querying search", async () => {
    const limited = new Response("limited", { status: 429 });
    rateLimitResponse.mockReturnValue(limited);
    const { GET } = await import("./route");
    expect(await GET(request())).toBe(limited);
    expect(index).not.toHaveBeenCalled();
  });

  it("keeps failed loads out of the cache and permits a subsequent request", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getDocuments
      .mockRejectedValueOnce(new Error("Search unavailable"))
      .mockResolvedValueOnce({ results: [], total: 0 });
    const { GET } = await import("./route");
    const failed = await GET(request());
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "Internal server error" });
    expect(await (await GET(request())).json()).toEqual({ courses: [] });
    expect(getDocuments).toHaveBeenCalledTimes(2);
  });
});
