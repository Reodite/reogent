import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_SECRET = "test-secret";

const verify = vi.fn();
vi.mock("jose", () => ({
  jwtVerify: (...args: unknown[]) => verify(...args),
  SignJWT: vi.fn(),
}));

const getPlan = vi.fn();
const savePlan = vi.fn();
vi.mock("@/src/server/plans", () => ({
  getPlan: (...args: unknown[]) => getPlan(...args),
  savePlan: (...args: unknown[]) => savePlan(...args),
}));

const { GET, PUT } = await import("./route");

const req = (init?: RequestInit, auth = true) =>
  new Request("http://localhost/api/plan", {
    ...init,
    headers: {
      ...(auth ? { authorization: "Bearer token" } : {}),
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });

const PLAN = { years: [{ id: "y1", label: "Year 1", terms: [] }], termsPerYear: 2 };

beforeEach(() => {
  verify.mockReset().mockResolvedValue({ payload: { sub: "u1", username: "testuser" } });
  getPlan.mockReset();
  savePlan.mockReset().mockResolvedValue(undefined);
});

describe("GET /api/plan", () => {
  it("401 without a bearer token", async () => {
    expect((await GET(req(undefined, false))).status).toBe(401);
  });

  it("returns the caller's plan, null when none saved", async () => {
    getPlan.mockResolvedValue(PLAN);
    expect(await (await GET(req())).json()).toEqual({ plan: PLAN });
    expect(getPlan).toHaveBeenCalledWith("u1");
    getPlan.mockResolvedValue(null);
    expect(await (await GET(req())).json()).toEqual({ plan: null });
  });
});

describe("PUT /api/plan", () => {
  it("401 without a bearer token", async () => {
    expect((await PUT(req({ method: "PUT", body: JSON.stringify(PLAN) }, false))).status).toBe(401);
  });

  it("saves a valid plan for the caller and returns 204", async () => {
    const res = await PUT(req({ method: "PUT", body: JSON.stringify(PLAN) }));
    expect(res.status).toBe(204);
    expect(savePlan).toHaveBeenCalledWith("u1", PLAN);
  });

  it("400 when the body isn't a plan object with a years array", async () => {
    expect((await PUT(req({ method: "PUT", body: JSON.stringify({ nope: 1 }) }))).status).toBe(400);
    expect(
      (await PUT(req({ method: "PUT", body: "not json", headers: { "content-type": "application/json" } }))).status,
    ).toBe(400);
    expect(savePlan).not.toHaveBeenCalled();
  });

  it("413 when the payload exceeds the size ceiling", async () => {
    const huge = JSON.stringify({ years: [], pad: "x".repeat(300_000) });
    expect((await PUT(req({ method: "PUT", body: huge }))).status).toBe(413);
  });
});
