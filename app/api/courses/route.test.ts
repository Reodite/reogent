import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const search = vi.fn();
const getDocument = vi.fn();
vi.mock("@/src/server/search", () => ({ getSearch: () => ({ index: () => ({ search, getDocument }) }) }));

const { GET } = await import("./route");
const { GET: getCourseDetail } = await import("./[code]/route");

const req = (query: string, token?: string) =>
  new Request(`http://localhost/api/courses${query}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

function fakeCourse(code: string, subject: string, number: string) {
  return { code, subject, number, title: code, sections: [], terms: [] };
}

beforeEach(() => {
  vi.stubEnv("AUTH_ENABLED", "true");
  search.mockReset();
  getDocument.mockReset();
});

describe("GET /api/courses/[code]", () => {
  it.each(["CPSC 110", " cpsc_v   110 "])("uses the session record for the accepted alias %j", async (code) => {
    search.mockResolvedValue({ hits: [fakeCourse("CPSC_V 110", "CPSC_V", "110")] });
    getDocument.mockImplementation(async (id: string) => {
      if (id !== "CPSC_110__2025W") throw new Error("Not found");
      return { code: "CPSC 110", average: 83.9, reported: 234 };
    });
    const response = await getCourseDetail(req(`/${encodeURIComponent(code)}?session=2025W`), {
      params: Promise.resolve({ code }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ code: "CPSC 110", session: "2025W", average: 83.9, reported: 234 });
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/courses", () => {
  it.each([
    { name: "anonymous", token: undefined },
    { name: "guest", token: "guest" },
  ])("serves the catalog to $name visitors", async ({ token }) => {
    const course = { ...fakeCourse("CPSC 110", "CPSC_V", "110"), average: 75, reported: 100 };
    search.mockResolvedValue({ hits: [course], estimatedTotalHits: 1 });

    const res = await GET(req("?session=2025W&sort=students_desc", token));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ courses: [course], subject_total: 1, session: "2025W" });
    expect(search).toHaveBeenCalledWith("", {
      filter: "session = '2025W'",
      sort: ["reported:desc"],
      limit: 1000,
    });
  });

  it("400 when `number` is supplied without `subject`", async () => {
    const res = await GET(req("?number=11"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/number requires a subject/i);
  });

  it("filters subject courses by substring on `number`, ranks ascending, caps at 8 (partial-code)", async () => {
    // Subject search returns 200-of-CPSC courses; verify substring filter + sort + cap-8.
    search.mockResolvedValue({
      hits: [
        fakeCourse("CPSC_V 211", "CPSC_V", "211"),
        fakeCourse("CPSC_V 311", "CPSC_V", "311"),
        fakeCourse("CPSC_V 119", "CPSC_V", "119"),
        fakeCourse("CPSC_V 118", "CPSC_V", "118"),
        fakeCourse("CPSC_V 117", "CPSC_V", "117"),
        fakeCourse("CPSC_V 116", "CPSC_V", "116"),
        fakeCourse("CPSC_V 115", "CPSC_V", "115"),
        fakeCourse("CPSC_V 114", "CPSC_V", "114"),
        fakeCourse("CPSC_V 113", "CPSC_V", "113"),
        fakeCourse("CPSC_V 112", "CPSC_V", "112"),
        fakeCourse("CPSC_V 111", "CPSC_V", "111"),
        fakeCourse("CPSC_V 110", "CPSC_V", "110"),
        fakeCourse("CPSC_V 212", "CPSC_V", "212"), // excluded — "212" lacks "11"
        fakeCourse("CPSC_V 290", "CPSC_V", "290"), // excluded
      ],
      estimatedTotalHits: 14,
    });
    const res = await GET(req("?subject=CPSC&number=11"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.courses).toHaveLength(8);
    const codes = body.courses.map((c: { number: string }) => `CPSC_V ${c.number}`);
    // Ascending order; suffix-matches (211, 311) ranked after the 11x block.
    expect(codes.slice(0, 5)).toEqual(["CPSC_V 110", "CPSC_V 111", "CPSC_V 112", "CPSC_V 113", "CPSC_V 114"]);
    expect(body.subject_total).toBe(12); // 8 returned (capped), 12 matches across the catalog
    // Verify the search call carried the subject filter so the substring narrowing is server-side.
    expect(search).toHaveBeenCalledWith("", {
      filter: "subject = 'CPSC_V'",
      limit: 1000,
    });
  });

  it("keeps code-sorted exact searches on session records", async () => {
    search.mockResolvedValue({
      hits: [
        { ...fakeCourse("CPSC_V 320", "CPSC_V", "320"), session: "2025W", reported: 721, average: 74.8 },
        { ...fakeCourse("CPSC_V 321", "CPSC_V", "321"), session: "2025W", reported: 400, average: 78 },
      ],
      estimatedTotalHits: 2,
    });

    const res = await GET(req("?subject=CPSC&number=320&session=2025W&sort=code"));
    const body = await res.json();

    expect(body.courses).toHaveLength(1);
    expect(body.courses[0]).toMatchObject({ number: "320", reported: 721, average: 74.8 });
    expect(search).toHaveBeenCalledWith("", {
      filter: "session = '2025W' AND subject = 'CPSC_V'",
      sort: ["code:asc"],
      limit: 1000,
    });
  });

  it("preserves the subject-only 200-cap with estimated total", async () => {
    search.mockResolvedValue({ hits: [], estimatedTotalHits: 168 });
    const res = await GET(req("?subject=CPSC"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.courses).toHaveLength(0);
    expect(body.subject_total).toBe(168);
  });
});
