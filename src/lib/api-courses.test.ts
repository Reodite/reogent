import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatApi } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("public course API client", () => {
  it.each([null, "guest", "account-token"])("loads course data without consulting the %s session", async (token) => {
    const getToken = vi.fn(async () => token);
    const onUnauthorized = vi.fn();
    const course = { code: "CPSC 110", title: "Computation, Programs, and Programming" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ courses: [course], session: "2025W" })))
      .mockResolvedValueOnce(new Response(JSON.stringify(course)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ courses: [course] })));
    vi.stubGlobal("fetch", fetchMock);
    const api = createChatApi({ getToken, onUnauthorized });

    expect(await api.searchCourses({ session: "2025W", sort: "students_desc" })).toEqual({
      courses: [course],
      session: "2025W",
    });
    expect(await api.getCourse("CPSC 110", "2025W")).toEqual(course);
    expect(await api.getCourseIndex()).toEqual({ courses: [course] });

    expect(getToken).not.toHaveBeenCalled();
    expect(onUnauthorized).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/courses?session=2025W&sort=students_desc",
      "/api/courses/CPSC%20110?session=2025W",
      "/api/course-index",
    ]);
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init.headers).has("Authorization")).toBe(false);
    }
  });
});
