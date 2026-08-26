import { beforeEach, describe, expect, it, vi } from "vitest";

const buildPrereqGraph = vi.fn();
vi.mock("@/src/server/prereq/build-graph", () => ({
  buildPrereqGraph: (...args: unknown[]) => buildPrereqGraph(...args),
}));
vi.mock("@/src/server/search", () => ({ getSearch: () => ({}) }));

const { GET } = await import("./route");

const req = (query = "", headers: Record<string, string> = {}) =>
  new Request(`http://localhost/api/prereq-tree${query}`, { headers });

beforeEach(() => {
  buildPrereqGraph.mockReset();
});

describe("GET /api/prereq-tree", () => {

  it("200 without auth — public endpoint", async () => {
    buildPrereqGraph.mockResolvedValue({
      rootCode: "CPSC 110",
      nodes: [],
      edges: [],
      selectionKeys: [],
      hasPrereqs: false,
      hasCoreqs: false,
      found: true,
    });
    const res = await GET(req("?root=CPSC+110"));
    expect(res.status).toBe(200);
  });

  it("400 when root is missing", async () => {
    const res = await GET(req(""));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/root is required/);
  });

  it("400 on an Okanagan code (REQ-1.3)", async () => {
    const res = await GET(req("?root=HES_O+120"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Okanagan/i);
    expect(buildPrereqGraph).not.toHaveBeenCalled();
  });

  it("400 on a bare subject (REQ-1.4)", async () => {
    const res = await GET(req("?root=CPSC"));
    expect(res.status).toBe(400);
    expect(buildPrereqGraph).not.toHaveBeenCalled();
  });

  it("200 with the graph on a valid canonical code", async () => {
    buildPrereqGraph.mockResolvedValue({
      rootCode: "CPSC 110",
      nodes: [],
      edges: [],
      selectionKeys: [],
      hasPrereqs: false,
      hasCoreqs: false,
      found: true,
    });
    const res = await GET(req("?root=CPSC+110"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.found).toBe(true);
    expect(body.rootCode).toBe("CPSC 110");
  });

  it("429 after 10 requests from the same IP", async () => {
    buildPrereqGraph.mockResolvedValue({
      rootCode: "CPSC 110",
      nodes: [],
      edges: [],
      selectionKeys: [],
      hasPrereqs: false,
      hasCoreqs: false,
      found: true,
    });
    const ipReq = () =>
      new Request("http://localhost/api/prereq-tree?root=CPSC+110", {
        headers: { "x-forwarded-for": "10.0.0.7" },
      });
    for (let i = 0; i < 10; i++) {
      const res = await GET(ipReq());
      expect(res.status).toBe(200);
    }
    const res = await GET(ipReq());
    expect(res.status).toBe(429);
  });
});
