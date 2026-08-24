import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_SECRET = "test-secret";

const verify = vi.fn();
vi.mock("jose", () => ({
  jwtVerify: (...args: unknown[]) => verify(...args),
  SignJWT: vi.fn(),
}));

const buildPrereqGraph = vi.fn();
vi.mock("@/src/server/prereq/build-graph", () => ({
  buildPrereqGraph: (...args: unknown[]) => buildPrereqGraph(...args),
}));
vi.mock("@/src/server/search", () => ({ getSearch: () => ({}) }));

const { GET } = await import("./route");

const req = (query = "", auth: boolean | string = true) =>
  new Request(`http://localhost/api/prereq-tree${query}`, {
    headers: auth === false ? {} : { authorization: `Bearer ${auth === true ? "token" : auth}` },
  });

beforeEach(() => {
  verify.mockReset().mockResolvedValue({ payload: { sub: "u1", username: "testuser" } });
  buildPrereqGraph.mockReset();
});

describe("GET /api/prereq-tree", () => {
  it("401 without a bearer token", async () => {
    const res = await GET(req("?root=CPSC+110", false));
    expect(res.status).toBe(401);
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

  it("429 after 10 requests from the same IP — rate limit fires before auth (per-IP cap)", async () => {
    buildPrereqGraph.mockResolvedValue({
      rootCode: "CPSC 110",
      nodes: [],
      edges: [],
      selectionKeys: [],
      hasPrereqs: false,
      hasCoreqs: false,
      found: true,
    });
    const ipReq = (auth = true) =>
      new Request("http://localhost/api/prereq-tree?root=CPSC+110", {
        headers: auth
          ? { authorization: "Bearer token", "x-forwarded-for": "10.0.0.7" }
          : { "x-forwarded-for": "10.0.0.7" },
      });
    for (let i = 0; i < 10; i++) {
      const res = await GET(ipReq(true));
      expect(res.status).toBe(200);
    }
    // 11th request from the same IP — no auth header — must be 429, not 401, proving rate-limit is pre-auth.
    const res = await GET(ipReq(false));
    expect(res.status).toBe(429);
  });
});
