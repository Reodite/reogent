import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_SECRET = "test-secret";

const verify = vi.fn();
vi.mock("jose", () => ({
  jwtVerify: (...args: unknown[]) => verify(...args),
  SignJWT: vi.fn(),
}));

const getSchedule = vi.fn();
const saveSchedule = vi.fn();
vi.mock("@/src/server/schedules", () => ({
  getSchedule: (...args: unknown[]) => getSchedule(...args),
  saveSchedule: (...args: unknown[]) => saveSchedule(...args),
}));

const { GET, PUT } = await import("./route");

const req = (init?: RequestInit, auth = true) =>
  new Request("http://localhost/api/schedule", {
    ...init,
    headers: {
      ...(auth ? { authorization: "Bearer token" } : {}),
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });

const SCHEDULE = {
  entries: [{ code: "CPSC 110", section: "101", term: "2026-27 Winter Term 1" }],
  activeTerm: "2026-27 Winter Term 1",
};

beforeEach(() => {
  verify.mockReset().mockResolvedValue({ payload: { sub: "u1", username: "testuser" } });
  getSchedule.mockReset();
  saveSchedule.mockReset().mockResolvedValue(undefined);
});

describe("GET /api/schedule", () => {
  it("requires a bearer token", async () => {
    expect((await GET(req(undefined, false))).status).toBe(401);
  });

  it("returns the caller's saved schedule", async () => {
    getSchedule.mockResolvedValue(SCHEDULE);
    expect(await (await GET(req())).json()).toEqual({ schedule: SCHEDULE });
    expect(getSchedule).toHaveBeenCalledWith("u1");
  });
});

describe("PUT /api/schedule", () => {
  it("stores canonical identifiers and discards extra snapshot data", async () => {
    const input = {
      entries: [
        {
          code: "cpsc_v   110",
          section: " 101 ",
          term: " 2026-27 Winter Term 1 ",
          snapshot: { days: ["Mon"] },
        },
      ],
      activeTerm: " 2026-27 Winter Term 1 ",
      extra: "not persisted",
    };
    const response = await PUT(req({ method: "PUT", body: JSON.stringify(input) }));
    expect(response.status).toBe(204);
    expect(saveSchedule).toHaveBeenCalledWith("u1", SCHEDULE);
  });

  it("rejects malformed and oversized entries", async () => {
    const malformed = { entries: [{ code: "CPSC 110", section: "", term: "2026-27 Winter Term 1" }] };
    expect((await PUT(req({ method: "PUT", body: JSON.stringify(malformed) }))).status).toBe(400);

    const tooMany = {
      entries: Array.from({ length: 101 }, (_, i) => ({
        code: "CPSC 110",
        section: String(i),
        term: "2026-27 Winter Term 1",
      })),
    };
    expect((await PUT(req({ method: "PUT", body: JSON.stringify(tooMany) }))).status).toBe(400);
    expect(saveSchedule).not.toHaveBeenCalled();
  });

  it("requires JSON and rejects invalid JSON", async () => {
    const plain = req({ method: "PUT", body: JSON.stringify(SCHEDULE), headers: { "content-type": "text/plain" } });
    expect((await PUT(plain)).status).toBe(415);
    const invalid = req({ method: "PUT", body: "not json" });
    expect((await PUT(invalid)).status).toBe(400);
  });

  it("requires authentication", async () => {
    expect((await PUT(req({ method: "PUT", body: JSON.stringify(SCHEDULE) }, false))).status).toBe(401);
  });
});
