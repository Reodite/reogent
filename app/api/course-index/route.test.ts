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

  it("coalesces concurrent requests and reuses the serialized response", async () => {
    let resolveDocuments!: (value: { results: { code: string; title: string }[]; total: number }) => void;
    getDocuments.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveDocuments = resolve;
        }),
    );
    const { GET } = await import("./route");
    const first = GET(request());
    const second = GET(request());
    await vi.waitFor(() => expect(getDocuments).toHaveBeenCalledTimes(1));
    resolveDocuments({ results: [{ code: "CPSC_V 110", title: "Computation" }], total: 1 });

    const [firstResponse, secondResponse] = await Promise.all([first, second]);
    expect(await firstResponse.json()).toEqual(await secondResponse.json());
    expect(getDocuments).toHaveBeenCalledTimes(1);
  });

  it("refreshes the server cache at the one-hour expiry and coalesces concurrent refreshes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    getDocuments
      .mockResolvedValueOnce({ results: [{ code: "CPSC_V 110", title: "Old title" }], total: 1 })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ results: [{ code: "CPSC_V 110", title: "New title" }], total: 1 }), 10);
          }),
      );
    const { GET } = await import("./route");

    const first = await GET(request());
    expect((await first.json()).courses[0].title).toBe("Old title");
    vi.setSystemTime(3_600_999);
    const beforeExpiry = await GET(request());
    expect((await beforeExpiry.json()).courses[0].title).toBe("Old title");
    expect(getDocuments).toHaveBeenCalledTimes(1);
    vi.setSystemTime(3_601_000);

    const refreshA = GET(request());
    const refreshB = GET(request());
    await vi.waitFor(() => expect(getDocuments).toHaveBeenCalledTimes(2));
    await vi.advanceTimersByTimeAsync(10);
    const [responseA, responseB] = await Promise.all([refreshA, refreshB]);

    expect((await responseA.json()).courses[0].title).toBe("New title");
    expect((await responseB.json()).courses[0].title).toBe("New title");
    expect(getDocuments).toHaveBeenCalledTimes(2);
  });

  it("evicts a failed cache refresh and permits another refresh", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    vi.spyOn(console, "error").mockImplementation(() => {});
    getDocuments
      .mockResolvedValueOnce({ results: [{ code: "CPSC_V 110", title: "Old title" }], total: 1 })
      .mockRejectedValueOnce(new Error("Search unavailable"))
      .mockResolvedValueOnce({ results: [{ code: "CPSC_V 110", title: "New title" }], total: 1 });
    const { GET } = await import("./route");
    await GET(request());
    vi.setSystemTime(3_601_000);

    const failed = await GET(request());
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "Internal server error" });
    expect((await (await GET(request())).json()).courses[0].title).toBe("New title");
    expect(getDocuments).toHaveBeenCalledTimes(3);
  });
});
