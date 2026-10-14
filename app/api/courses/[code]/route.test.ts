import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const search = vi.fn();
const getDocument = vi.fn();
vi.mock("@/src/server/search", () => ({ getSearch: () => ({ index: () => ({ search, getDocument }) }) }));

const { GET } = await import("./route");

const course = {
  code: "CPSC_V 110",
  subject: "CPSC_V",
  number: "110",
  title: "Computation, Programs, and Programming",
  sections: [],
  terms: [],
};

function request(code: string, session = "2025W", token?: string) {
  return GET(
    new Request(`http://localhost/api/courses/${encodeURIComponent(code)}?session=${session}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    }),
    { params: Promise.resolve({ code }) },
  );
}

beforeEach(() => {
  vi.stubEnv("AUTH_ENABLED", "true");
  search.mockReset().mockResolvedValue({ hits: [course] });
  getDocument.mockReset().mockResolvedValue({ code: "CPSC 110", average: 75, reported: 100 });
});

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/courses/{code}", () => {
  it.each([
    { name: "anonymous", token: undefined },
    { name: "guest", token: "guest" },
  ])("serves course details to $name visitors", async ({ token }) => {
    const response = await request("CPSC 110", "2025W", token);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      code: "CPSC 110",
      title: course.title,
      session: "2025W",
      average: 75,
      reported: 100,
    });
    expect(getDocument).toHaveBeenCalledWith("CPSC_110__2025W");
  });

  it.each([
    { code: "CPSC_O 110", session: "2025W" },
    { code: "CPSC 110", session: "invalid" },
  ])("rejects unsupported course or session inputs: $code, $session", async ({ code, session }) => {
    expect((await request(code, session)).status).toBe(400);
    expect(search).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown course", async () => {
    search.mockResolvedValue({ hits: [] });
    expect((await request("CPSC 999")).status).toBe(404);
    expect(getDocument).not.toHaveBeenCalled();
  });

  it("returns the catalog record when session grades are unavailable", async () => {
    getDocument.mockRejectedValue(new Error("Document not found"));
    const response = await request("CPSC 110");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ...course, session: "2025W", note: "Not offered in 2025W" });
  });
});
