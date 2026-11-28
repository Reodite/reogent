import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connectDatabase: vi.fn(),
  personFindById: vi.fn(),
  personFindOneAndUpdate: vi.fn(),
  groupStartSession: vi.fn(),
  groupCreate: vi.fn(),
  groupFindById: vi.fn(),
  groupFind: vi.fn(),
  groupExists: vi.fn(),
  memberCreate: vi.fn(),
  memberFind: vi.fn(),
  memberAggregate: vi.fn(),
  memberExists: vi.fn(),
  memberDeleteOne: vi.fn(),
  userFind: vi.fn(),
  peopleFind: vi.fn(),
}));
const mongoSession = {
  withTransaction: vi.fn(async (callback: () => Promise<void>) => callback()),
  endSession: vi.fn(),
};
vi.mock("../db", () => ({ connectDatabase: mocks.connectDatabase }));
vi.mock("../db/models", () => ({
  SharerPerson: {
    findById: mocks.personFindById,
    findOneAndUpdate: mocks.personFindOneAndUpdate,
    find: mocks.peopleFind,
  },
  SharerGroup: {
    startSession: mocks.groupStartSession,
    create: mocks.groupCreate,
    findById: mocks.groupFindById,
    find: mocks.groupFind,
    exists: mocks.groupExists,
  },
  SharerGroupMember: {
    create: mocks.memberCreate,
    find: mocks.memberFind,
    aggregate: mocks.memberAggregate,
    exists: mocks.memberExists,
    deleteOne: mocks.memberDeleteOne,
  },
  User: { find: mocks.userFind },
}));

function lean(value: unknown) {
  return { lean: async () => value };
}

const { createGroup, getGroup, getGroupForMember, joinGroup, leaveGroup, listGroups, savePerson, CODE_PATTERN } =
  await import("./store");

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.connectDatabase.mockResolvedValue(undefined);
  mocks.groupStartSession.mockResolvedValue(mongoSession);
  mongoSession.withTransaction.mockReset().mockImplementation(async (callback) => callback());
  mongoSession.endSession.mockReset().mockResolvedValue(undefined);
});

describe("person persistence", () => {
  it("upserts a person with caller identity and server-set timestamp", async () => {
    mocks.personFindOneAndUpdate.mockResolvedValue(undefined);
    const saved = await savePerson("u1", { handle: "ada", avatar: { kind: "emoji" }, schedule: { sections: [] } });
    expect(saved).toMatchObject({ id: "u1", handle: "ada", schedule: { sections: [] } });
    expect(saved.updatedAt).toBeTruthy();
    expect(mocks.personFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: "u1" },
      { $set: { person: saved, updatedAt: expect.any(Date) } },
      { upsert: true, runValidators: true },
    );
  });
});

describe("createGroup", () => {
  it("draws a 6-char base62 code and inserts the creator membership transactionally", async () => {
    mocks.groupCreate.mockResolvedValue([{ _id: "aB12cD", name: "Crew", createdBy: "u1", createdAt: new Date() }]);
    mocks.memberCreate.mockResolvedValue([{ groupCode: "aB12cD", userId: "u1" }]);
    mocks.groupFindById.mockReturnValue(lean({ _id: "aB12cD", name: "Crew", createdBy: "u1", createdAt: new Date() }));
    mocks.memberFind.mockReturnValue({
      sort: () => lean([{ groupCode: "aB12cD", userId: "u1", joinedAt: new Date() }]),
    });
    mocks.userFind.mockReturnValue({ select: () => lean([{ _id: "u1", username: "ada" }]) });
    mocks.peopleFind.mockReturnValue(lean([]));
    const group = await createGroup("u1", "Crew");
    expect(group?.name).toBe("Crew");
    expect(mocks.groupCreate.mock.calls[0][0][0]._id).toMatch(CODE_PATTERN);
    expect(mocks.memberCreate).toHaveBeenCalledWith(
      [expect.objectContaining({ groupCode: mocks.groupCreate.mock.calls[0][0][0]._id, userId: "u1" })],
      { ordered: true, session: mongoSession },
    );
  });

  it("retries code collisions and stops after the configured attempts", async () => {
    mocks.groupCreate.mockRejectedValueOnce({ code: 11000 });
    mocks.groupCreate.mockResolvedValueOnce([{ _id: "xY12cD", name: "", createdBy: "u1", createdAt: new Date() }]);
    mocks.memberCreate.mockResolvedValue([{ groupCode: "xY12cD", userId: "u1" }]);
    mocks.groupFindById.mockReturnValue(lean({ _id: "xY12cD", name: "", createdBy: "u1", createdAt: new Date() }));
    mocks.memberFind.mockReturnValue({
      sort: () => lean([{ groupCode: "xY12cD", userId: "u1", joinedAt: new Date() }]),
    });
    mocks.userFind.mockReturnValue({ select: () => lean([{ _id: "u1", username: "ada" }]) });
    mocks.peopleFind.mockReturnValue(lean([]));
    await expect(createGroup("u1", "")).resolves.not.toBeNull();
    expect(mocks.groupCreate).toHaveBeenCalledTimes(2);
  });

  it("gives up after the maximum number of code collisions", async () => {
    for (let attempt = 0; attempt < 8; attempt++) mocks.groupCreate.mockRejectedValueOnce({ code: 11000 });
    await expect(createGroup("u1", "")).resolves.toBeNull();
    expect(mocks.groupCreate).toHaveBeenCalledTimes(8);
  });
});

describe("group reads", () => {
  it("returns null for an unknown code without reading members", async () => {
    mocks.groupFindById.mockReturnValue(lean(null));
    await expect(getGroup("zzzzzz")).resolves.toBeNull();
    expect(mocks.memberFind).not.toHaveBeenCalled();
  });

  it("uses uploaded people or falls back to usernames for members", async () => {
    mocks.groupFindById.mockReturnValue(
      lean({ _id: "aB12cD", name: "Crew", createdBy: "u1", createdAt: new Date("2026-01-01") }),
    );
    mocks.memberFind.mockReturnValue({
      sort: () =>
        lean([
          { userId: "u1", joinedAt: new Date("2026-01-01") },
          { userId: "u2", joinedAt: new Date("2026-01-02") },
        ]),
    });
    mocks.userFind.mockReturnValue({
      select: () =>
        lean([
          { _id: "u1", username: "ada" },
          { _id: "u2", username: "grace" },
        ]),
    });
    mocks.peopleFind.mockReturnValue(
      lean([{ _id: "u1", person: { id: "u1", handle: "Ada", avatar: {}, schedule: {}, updatedAt: "x" } }]),
    );
    const group = await getGroup("aB12cD");
    expect(group?.members).toHaveLength(2);
    expect(group?.members[0].handle).toBe("Ada");
    expect(group?.members[1]).toMatchObject({ id: "u2", handle: "grace", schedule: null });
  });

  it("reads detail only after membership authorization", async () => {
    mocks.memberExists.mockResolvedValue({ _id: "membership" });
    mocks.groupFindById.mockReturnValue(lean({ _id: "aB12cD", name: "Crew", createdBy: "u1", createdAt: new Date() }));
    mocks.memberFind.mockReturnValue({ sort: () => lean([]) });
    mocks.userFind.mockReturnValue({ select: () => lean([]) });
    mocks.peopleFind.mockReturnValue(lean([]));
    await expect(getGroupForMember("u1", "aB12cD")).resolves.toMatchObject({ code: "aB12cD" });
    mocks.memberExists.mockResolvedValue(null);
    mocks.groupFindById.mockClear();
    await expect(getGroupForMember("u2", "aB12cD")).resolves.toBeNull();
    expect(mocks.groupFindById).not.toHaveBeenCalled();
  });
});

describe("group membership", () => {
  it("does not join an unknown code", async () => {
    mocks.groupExists.mockReturnValue({ session: () => lean(null) });
    await expect(joinGroup("u1", "zzzzzz")).resolves.toBeNull();
    expect(mocks.memberCreate).not.toHaveBeenCalled();
  });

  it("adds membership transactionally and tolerates duplicate membership", async () => {
    mocks.groupExists.mockReturnValue({ session: () => lean({ _id: "aB12cD" }) });
    mocks.memberExists
      .mockReturnValueOnce({ session: () => lean(null) })
      .mockResolvedValueOnce({ groupCode: "aB12cD", userId: "u1" });
    mocks.memberCreate.mockRejectedValueOnce({ code: 11000, keyValue: { groupCode: "aB12cD", userId: "u1" } });
    mocks.groupFindById.mockReturnValue(lean({ _id: "aB12cD", name: "Crew", createdBy: "u1", createdAt: new Date() }));
    mocks.memberFind.mockReturnValue({ sort: () => lean([]) });
    mocks.userFind.mockReturnValue({ select: () => lean([]) });
    mocks.peopleFind.mockReturnValue(lean([]));
    await expect(joinGroup("u1", "aB12cD")).resolves.toMatchObject({ code: "aB12cD" });
    expect(mongoSession.withTransaction).toHaveBeenCalledOnce();
  });

  it("retries membership after a duplicate when the caller is no longer a member", async () => {
    mocks.groupExists
      .mockReturnValueOnce({ session: () => lean({ _id: "aB12cD" }) })
      .mockResolvedValueOnce({ _id: "aB12cD" })
      .mockReturnValueOnce({ session: () => lean({ _id: "aB12cD" }) });
    mocks.memberExists
      .mockReturnValueOnce({ session: () => lean(null) })
      .mockResolvedValueOnce(null)
      .mockReturnValueOnce({ session: () => lean(null) });
    mocks.memberCreate
      .mockRejectedValueOnce({ code: 11000, keyValue: { groupCode: "aB12cD", userId: "u1" } })
      .mockResolvedValueOnce([{ groupCode: "aB12cD", userId: "u1" }]);
    mocks.groupFindById.mockReturnValue(lean({ _id: "aB12cD", name: "Crew", createdBy: "u1", createdAt: new Date() }));
    mocks.memberFind.mockReturnValue({ sort: () => lean([]) });
    mocks.userFind.mockReturnValue({ select: () => lean([]) });
    mocks.peopleFind.mockReturnValue(lean([]));

    await expect(joinGroup("u1", "aB12cD")).resolves.toMatchObject({ code: "aB12cD" });
    expect(mocks.memberCreate).toHaveBeenCalledTimes(2);
    expect(mongoSession.withTransaction).toHaveBeenCalledTimes(2);
  });

  it("propagates duplicate errors for unrelated unique keys", async () => {
    mocks.groupExists.mockReturnValue({ session: () => lean({ _id: "aB12cD" }) });
    mocks.memberExists.mockReturnValue({ session: () => lean(null) });
    const conflict = { code: 11000, keyValue: { _id: "other" } };
    mocks.memberCreate.mockRejectedValueOnce(conflict);

    await expect(joinGroup("u1", "aB12cD")).rejects.toMatchObject(conflict);
    expect(mocks.groupFindById).not.toHaveBeenCalled();
  });

  it("reports whether membership was removed", async () => {
    mocks.memberDeleteOne.mockResolvedValue({ deletedCount: 0 });
    await expect(leaveGroup("u1", "aB12cD")).resolves.toBe(false);
    expect(mocks.memberDeleteOne).toHaveBeenCalledWith({ groupCode: "aB12cD", userId: "u1" });
  });
});

describe("listGroups", () => {
  it("returns only memberships and counts each listed group", async () => {
    mocks.memberFind.mockReturnValue({ sort: () => lean([{ groupCode: "aB12cD" }]) });
    mocks.groupFind.mockReturnValue({
      sort: () => lean([{ _id: "aB12cD", name: "Crew", createdAt: new Date("2026-01-01") }]),
    });
    mocks.memberAggregate.mockResolvedValue([{ _id: "aB12cD", count: 3 }]);
    await expect(listGroups("u1")).resolves.toEqual([
      { code: "aB12cD", name: "Crew", memberCount: 3, updatedAt: "2026-01-01T00:00:00.000Z" },
    ]);
  });
});
