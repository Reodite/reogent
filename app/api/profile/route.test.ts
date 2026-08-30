import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_SECRET = "test-secret";

const verify = vi.fn();
vi.mock("jose", () => ({
  jwtVerify: (...args: unknown[]) => verify(...args),
  SignJWT: vi.fn(),
}));

const getProfile = vi.fn();
const saveProfile = vi.fn();
vi.mock("@/src/server/profile", () => ({
  getProfile: (...args: unknown[]) => getProfile(...args),
  saveProfile: (...args: unknown[]) => saveProfile(...args),
}));

const { GET, PUT } = await import("./route");

const req = (init?: RequestInit, auth = true) =>
  new Request("http://localhost/api/profile", {
    ...init,
    headers: {
      ...(auth ? { authorization: "Bearer token" } : {}),
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });

const PROFILE = { program: "Computer Science", year: 3, student_type: "international" };
const put = (body: string) => PUT(req({ method: "PUT", body }));

beforeEach(() => {
  verify.mockReset().mockResolvedValue({ payload: { sub: "u1", username: "testuser" } });
  getProfile.mockReset();
  saveProfile.mockReset().mockResolvedValue(undefined);
});

describe("GET /api/profile", () => {
  it("401 without a bearer token", async () => {
    expect((await GET(req(undefined, false))).status).toBe(401);
  });

  it("returns the caller's profile, null when none saved", async () => {
    getProfile.mockResolvedValue(PROFILE);
    expect(await (await GET(req())).json()).toEqual({ profile: PROFILE });
    expect(getProfile).toHaveBeenCalledWith("u1");
    getProfile.mockResolvedValue(null);
    expect(await (await GET(req())).json()).toEqual({ profile: null });
  });
});

describe("PUT /api/profile", () => {
  it("401 without a bearer token", async () => {
    expect((await PUT(req({ method: "PUT", body: JSON.stringify(PROFILE) }, false))).status).toBe(401);
  });

  it("saves a valid profile for the caller and returns 204", async () => {
    expect((await put(JSON.stringify(PROFILE))).status).toBe(204);
    expect(saveProfile).toHaveBeenCalledWith("u1", PROFILE);
  });

  it("drops a blank program and accepts an empty profile", async () => {
    expect((await put(JSON.stringify({ program: "  " }))).status).toBe(204);
    expect(saveProfile).toHaveBeenCalledWith("u1", {});
  });

  it("400 on unknown keys, bad year, bad student type, or invalid JSON", async () => {
    expect((await put(JSON.stringify({ nope: 1 }))).status).toBe(400);
    expect((await put(JSON.stringify({ year: 9 }))).status).toBe(400);
    expect((await put(JSON.stringify({ year: 2.5 }))).status).toBe(400);
    expect((await put(JSON.stringify({ student_type: "alien" }))).status).toBe(400);
    expect((await put(JSON.stringify([1]))).status).toBe(400);
    expect((await put("not json")).status).toBe(400);
    expect(saveProfile).not.toHaveBeenCalled();
  });

  it("413 when the payload exceeds the size ceiling", async () => {
    expect((await put(JSON.stringify({ program: "x".repeat(5000) }))).status).toBe(413);
  });
});
