import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatApi } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("public course API client", () => {
  it.each([null, "guest", "account-id"])("loads course data without consulting the %s session", async (userId) => {
    const getUserId = vi.fn(async () => userId);
    const onUnauthorized = vi.fn();
    const course = { code: "CPSC 110", title: "Computation, Programs, and Programming" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ courses: [course], session: "2025W" })))
      .mockResolvedValueOnce(new Response(JSON.stringify(course)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ courses: [course] })));
    vi.stubGlobal("fetch", fetchMock);
    const api = createChatApi({ getUserId, onUnauthorized });

    expect(await api.searchCourses({ session: "2025W", sort: "students_desc" })).toEqual({
      courses: [course],
      session: "2025W",
    });
    expect(await api.getCourse("CPSC 110", "2025W")).toEqual(course);
    expect(await api.getCourseIndex()).toEqual({ courses: [course] });

    expect(getUserId).not.toHaveBeenCalled();
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/courses?session=2025W&sort=students_desc",
      "/api/courses/CPSC%20110?session=2025W",
      "/api/course-index",
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init.headers).has("X-Reodite-User")).toBe(false);
    }
  });

  it("coalesces course-index requests and refreshes the per-client cache after one hour", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = createChatApi({ getUserId: async () => null });
    const first = api.getCourseIndex();
    const concurrent = api.getCourseIndex();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(Response.json({ courses: [] }));
    await expect(Promise.all([first, concurrent])).resolves.toEqual([{ courses: [] }, { courses: [] }]);

    vi.setSystemTime(3_600_999);
    await api.getCourseIndex();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.setSystemTime(3_601_000);
    fetchMock.mockResolvedValueOnce(Response.json({ courses: [{ code: "CPSC 110" }] }));
    await expect(api.getCourseIndex()).resolves.toEqual({ courses: [{ code: "CPSC 110" }] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("evicts a failed course-index request so the caller can retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(Response.json({ courses: [] }));
    vi.stubGlobal("fetch", fetchMock);
    const api = createChatApi({ getUserId: async () => null });

    await expect(api.getCourseIndex()).rejects.toThrow("Request failed with status 503");
    await expect(api.getCourseIndex()).resolves.toEqual({ courses: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
