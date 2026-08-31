import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.JWT_SECRET = "test-secret";

const store = vi.hoisted(() => ({
  getPerson: vi.fn(),
  savePerson: vi.fn(async (_sub: string, b: { handle: string }) => ({
    id: "u1",
    handle: b.handle,
    avatar: null,
    schedule: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  })),
  listGroups: vi.fn(async () => [
    { code: "aB12cD", name: "Crew", memberCount: 2, updatedAt: "2026-01-01T00:00:00.000Z" },
  ]),
  createGroup: vi.fn(async (_sub: string, name: string) => ({
    code: "aB12cD",
    name,
    createdBy: "u1",
    createdAt: "2026-01-01T00:00:00.000Z",
    members: [],
  })),
  getGroup: vi.fn(async (code: string) =>
    code === "zzzzzz" ? null : { code, name: "Crew", createdBy: "u1", createdAt: "x", members: [] },
  ),
  joinGroup: vi.fn(async (_sub: string, code: string) =>
    code === "zzzzzz" ? null : { code, name: "Crew", createdBy: "u1", createdAt: "x", members: [] },
  ),
  leaveGroup: vi.fn(async () => true),
}));
vi.mock("@/src/server/sharer/store", () => ({ ...store, CODE_PATTERN: /^[0-9A-Za-z]{6}$/ }));

const { GET: getSchedule, PUT: putSchedule } = await import("./schedule/route");
const { GET: getGroups, POST: postGroups } = await import("./groups/route");
const { GET: getGroup, POST: joinGroup, DELETE: leaveGroup } = await import("./groups/[code]/route");

const ctx = (code: string) => ({ params: Promise.resolve({ code }) });
const json = (body: unknown) =>
  new Request("http://x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const validPerson = {
  handle: "ada",
  avatar: { kind: "initials", initials: "AD", color: "#4d9de0" },
  schedule: { sections: [], importedAt: "2026-01-01T00:00:00.000Z" },
};

// AUTH_ENABLED=false bypasses JWT outside production; force production-style
// 401s out of scope — every test exercises the bypass user.
process.env.AUTH_ENABLED = "false";

beforeEach(() => vi.clearAllMocks());

describe("sharer schedule routes", () => {
  it("GET returns the stored person", async () => {
    store.getPerson.mockResolvedValueOnce({
      id: "u1",
      handle: "ada",
      avatar: {},
      schedule: { sections: [] },
      updatedAt: "x",
    });
    const res = await getSchedule(new Request("http://x"));
    expect(res.status).toBe(200);
    expect((await res.json()).person.handle).toBe("ada");
  });

  it("PUT rejects a missing handle", async () => {
    const res = await putSchedule(json({ avatar: {} }));
    expect(res.status).toBe(400);
    expect(store.savePerson).not.toHaveBeenCalled();
  });

  it("PUT saves a valid person", async () => {
    const res = await putSchedule(json(validPerson));
    expect(res.status).toBe(200);
    expect(store.savePerson).toHaveBeenCalledWith("default", expect.objectContaining({ handle: "ada" }));
  });

  it("PUT rejects null and malformed schedules", async () => {
    expect((await putSchedule(json(null))).status).toBe(400);
    expect((await putSchedule(json({ ...validPerson, schedule: { sections: [{}], importedAt: "x" } }))).status).toBe(
      400,
    );
    expect(store.savePerson).not.toHaveBeenCalled();
  });
});

describe("sharer group routes", () => {
  it("GET lists the caller's groups", async () => {
    const res = await getGroups(new Request("http://x"));
    expect((await res.json()).groups[0].code).toBe("aB12cD");
  });

  it("POST creates a group with the given name", async () => {
    const res = await postGroups(json({ name: "Weekend crew" }));
    expect(res.status).toBe(201);
    expect(store.createGroup).toHaveBeenCalledWith("default", "Weekend crew");
  });

  it("POST rejects an empty name or null body", async () => {
    expect((await postGroups(json({ name: "   " }))).status).toBe(400);
    expect((await postGroups(json(null))).status).toBe(400);
  });

  it("GET by code 404s unknown groups and 400s malformed codes", async () => {
    expect((await getGroup(new Request("http://x"), ctx("zzzzzz"))).status).toBe(404);
    expect((await getGroup(new Request("http://x"), ctx("nope!"))).status).toBe(400);
  });

  it("join and leave hit the store with the caller's id", async () => {
    expect((await joinGroup(new Request("http://x", { method: "POST" }), ctx("aB12cD"))).status).toBe(200);
    expect(store.joinGroup).toHaveBeenCalledWith("default", "aB12cD");
    expect((await leaveGroup(new Request("http://x", { method: "DELETE" }), ctx("aB12cD"))).status).toBe(204);
    expect(store.leaveGroup).toHaveBeenCalledWith("default", "aB12cD");
  });
});
