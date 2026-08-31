import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
vi.mock("../db", () => ({ getPool: () => ({ query: queryMock }) }));

const { createGroup, getGroup, joinGroup, leaveGroup, listGroups, savePerson, CODE_PATTERN } = await import("./store");

beforeEach(() => queryMock.mockReset());

describe("savePerson", () => {
  it("upserts a person owned by the caller with server-set identity", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const saved = await savePerson("u1", {
      handle: "ada",
      avatar: { kind: "emoji", emoji: "🦫", color: "#f00" },
      schedule: { sections: [] },
    });
    expect(saved.id).toBe("u1");
    expect(saved.handle).toBe("ada");
    expect(queryMock.mock.calls[0][0]).toContain("ON CONFLICT (user_id)");
    const stored = JSON.parse(queryMock.mock.calls[0][1][1]);
    expect(stored.id).toBe("u1");
    expect(stored.updatedAt).toBeTruthy();
  });
});

describe("createGroup", () => {
  it("draws a 6-char base62 code, inserts the group, and joins the creator", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }); // insert group
    queryMock.mockResolvedValueOnce({ rows: [] }); // insert membership
    queryMock.mockResolvedValueOnce({
      rows: [{ code: "aB12cD", name: "Crew", created_by: "u1", created_at: new Date() }],
    });
    queryMock.mockResolvedValueOnce({ rows: [] }); // members
    const group = await createGroup("u1", "Crew");
    expect(group?.name).toBe("Crew");
    expect(queryMock.mock.calls[0][1][0]).toMatch(CODE_PATTERN);
    expect(queryMock.mock.calls[1][1][1]).toBe("u1");
  });

  it("retries with a fresh code on unique violation", async () => {
    queryMock.mockRejectedValueOnce({ code: "23505" });
    queryMock.mockResolvedValueOnce({ rows: [] });
    queryMock.mockResolvedValueOnce({ rows: [] });
    queryMock.mockResolvedValueOnce({ rows: [{ code: "x", name: "", created_by: "u1", created_at: new Date() }] });
    queryMock.mockResolvedValueOnce({ rows: [] });
    const group = await createGroup("u1", "");
    expect(group).not.toBeNull();
    expect(queryMock).toHaveBeenCalledTimes(5);
  });

  it("gives up after the max attempts instead of looping forever", async () => {
    for (let i = 0; i < 8; i++) queryMock.mockRejectedValueOnce({ code: "23505" });
    expect(await createGroup("u1", "")).toBeNull();
    expect(queryMock).toHaveBeenCalledTimes(8);
  });
});

describe("getGroup", () => {
  it("returns null for an unknown code without querying members", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    expect(await getGroup("zzzzzz")).toBeNull();
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to the username for members without an uploaded schedule", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ code: "aB12cD", name: "Crew", created_by: "u1", created_at: new Date("2026-01-01") }],
    });
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          user_id: "u1",
          username: "ada",
          joined_at: new Date("2026-01-01"),
          person: { id: "u1", handle: "Ada", avatar: {}, schedule: {}, updatedAt: "x" },
        },
        { user_id: "u2", username: "grace", joined_at: new Date("2026-01-02"), person: null },
      ],
    });
    const group = await getGroup("aB12cD");
    expect(group?.members).toHaveLength(2);
    expect(group?.members[0].handle).toBe("Ada");
    expect(group?.members[1]).toMatchObject({ id: "u2", handle: "grace", schedule: null });
  });
});

describe("joinGroup", () => {
  it("returns null for an unknown code", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0 }); // insert skipped by WHERE EXISTS
    queryMock.mockResolvedValueOnce({ rowCount: 0 }); // group probe
    expect(await joinGroup("u1", "zzzzzz")).toBeNull();
  });

  it("is idempotent for an existing member", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0 }); // ON CONFLICT no-op
    queryMock.mockResolvedValueOnce({ rowCount: 1 }); // group exists
    queryMock.mockResolvedValueOnce({
      rows: [{ code: "aB12cD", name: "C", created_by: "u1", created_at: new Date() }],
    });
    queryMock.mockResolvedValueOnce({ rows: [] });
    expect(await joinGroup("u1", "aB12cD")).toMatchObject({ code: "aB12cD" });
  });
});

describe("leaveGroup", () => {
  it("reports false when the caller was not a member", async () => {
    queryMock.mockResolvedValueOnce({ rowCount: 0 });
    expect(await leaveGroup("u1", "aB12cD")).toBe(false);
  });
});

describe("listGroups", () => {
  it("scopes to groups the caller belongs to", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ code: "aB12cD", name: "Crew", created_at: new Date("2026-01-01"), member_count: 3 }],
    });
    const groups = await listGroups("u1");
    expect(groups).toEqual([{ code: "aB12cD", name: "Crew", memberCount: 3, updatedAt: "2026-01-01T00:00:00.000Z" }]);
    expect(queryMock.mock.calls[0][0]).toContain("m.user_id = $1");
  });
});
