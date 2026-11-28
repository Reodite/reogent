import type { Citation, CitationKind } from "@/src/shared/citations/citation";
import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendExchange,
  canWriteSession,
  deleteSession,
  findOrCreateOAuthUser,
  getSessionMessages,
  renameSession,
  updateSessionTitle,
} from "./store";

const mocks = vi.hoisted(() => ({
  connectDatabase: vi.fn(),
  sessionFind: vi.fn(),
  sessionFindById: vi.fn(),
  sessionFindOneAndUpdate: vi.fn(),
  sessionExists: vi.fn(),
  sessionCreate: vi.fn(),
  sessionUpdateOne: vi.fn(),
  sessionDeleteOne: vi.fn(),
  sessionStartSession: vi.fn(),
  messageFind: vi.fn(),
  messageCreate: vi.fn(),
  messageDeleteMany: vi.fn(),
  userCreate: vi.fn(),
  userFindOne: vi.fn(),
  userFindById: vi.fn(),
}));
const mongoSession = {
  withTransaction: vi.fn(async (callback: () => Promise<void>) => callback()),
  endSession: vi.fn(),
};
vi.mock("../db", () => ({ connectDatabase: mocks.connectDatabase }));
vi.mock("../db/models", () => ({
  Session: {
    find: mocks.sessionFind,
    findById: mocks.sessionFindById,
    findOneAndUpdate: mocks.sessionFindOneAndUpdate,
    exists: mocks.sessionExists,
    create: mocks.sessionCreate,
    updateOne: mocks.sessionUpdateOne,
    deleteOne: mocks.sessionDeleteOne,
    startSession: mocks.sessionStartSession,
  },
  Message: { find: mocks.messageFind, create: mocks.messageCreate, deleteMany: mocks.messageDeleteMany },
  User: { create: mocks.userCreate, findOne: mocks.userFindOne, findById: mocks.userFindById },
  OAuthAccount: { findOne: vi.fn(), updateOne: vi.fn(), create: vi.fn() },
}));

const { OAuthAccount } = await import("../db/models");
const oauth = OAuthAccount as unknown as {
  findOne: ReturnType<typeof vi.fn>;
  updateOne: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};

const arbKind: fc.Arbitrary<CitationKind> = fc.constantFrom(
  "course",
  "program",
  "event",
  "calendar",
  "page",
  "generic",
);
const stampIndices = (arr: Omit<Citation, "index">[]): Citation[] =>
  arr.map((citation, index) => ({ ...citation, index: index + 1 }));
const arbCitation: fc.Arbitrary<Omit<Citation, "index">> = fc.record({
  label: fc.string({ minLength: 1, maxLength: 40 }),
  kind: arbKind,
  source_url: fc.option(fc.webUrl()),
  used: fc.boolean(),
  tool: fc.string({ minLength: 1, maxLength: 20 }),
  detail: fc.option(
    fc.record({
      subject: fc.option(fc.string({ minLength: 1 })),
      number: fc.option(fc.string({ minLength: 1 })),
      date: fc.option(fc.string({ minLength: 1 })),
    }),
  ),
});
const arbPersistedMessage = fc.oneof(fc.constant(null), fc.array(arbCitation, { maxLength: 8 }).map(stampIndices));

function lean(value: unknown) {
  return { lean: async () => value };
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  for (const mock of [oauth.findOne, oauth.updateOne, oauth.create]) mock.mockReset();
  mocks.connectDatabase.mockResolvedValue(undefined);
  mocks.sessionStartSession.mockResolvedValue(mongoSession);
  mongoSession.withTransaction.mockReset().mockImplementation(async (callback) => callback());
  mongoSession.endSession.mockReset().mockResolvedValue(undefined);
});

describe("session write ownership", () => {
  it("rejects an existing session owned by another user without inserting messages", async () => {
    mocks.sessionFindOneAndUpdate.mockResolvedValue(null);
    mocks.sessionExists.mockReturnValue({ session: () => lean({ _id: "sid" }) });
    await expect(appendExchange("attacker", "sid", "q", "a")).rejects.toThrow("Session not found");
    expect(mocks.messageCreate).not.toHaveBeenCalled();
    expect(mongoSession.withTransaction).toHaveBeenCalledOnce();
    expect(mongoSession.endSession).toHaveBeenCalledOnce();
  });

  it("creates a session and stores a paired exchange with ordered messages", async () => {
    mocks.sessionFindOneAndUpdate.mockResolvedValue(null);
    mocks.sessionExists.mockReturnValue({ session: () => lean(null) });
    mocks.sessionCreate.mockResolvedValue([{ _id: "sid" }]);
    mocks.messageCreate.mockResolvedValue([]);
    const activity = [{ type: "thinking" as const, content: "Looking up courses" }];
    const citations: Citation[] = [{ index: 1, label: "CPSC 110", kind: "course", used: true, tool: "search" }];
    const question = "q".repeat(90);
    await appendExchange("u1", "sid", question, "answer", activity, citations);
    expect(mocks.sessionCreate).toHaveBeenCalledWith(
      [expect.objectContaining({ _id: "sid", userId: "u1", title: question.slice(0, 80), nextMessageOrder: 2 })],
      { ordered: true, session: mongoSession },
    );
    expect(mocks.messageCreate).toHaveBeenCalledWith(
      [
        expect.objectContaining({ sessionId: "sid", order: 0, role: "user", content: question }),
        expect.objectContaining({
          sessionId: "sid",
          order: 1,
          role: "assistant",
          content: "answer",
          activity,
          citations,
        }),
      ],
      { ordered: true, session: mongoSession },
    );
  });

  it.each([
    { session: null, allowed: true },
    { session: { userId: "u1" }, allowed: true },
    { session: { userId: "someone-else" }, allowed: false },
  ])("preflights ownership: $allowed", async ({ session, allowed }) => {
    mocks.sessionFindById.mockReturnValue({ select: () => lean(session) });
    await expect(canWriteSession("u1", "sid")).resolves.toBe(allowed);
  });

  it("checks ownership before reading ordered messages", async () => {
    mocks.sessionExists.mockImplementation(({ userId }: { userId: string }) => ({
      session: () => lean(userId === "u1" ? { _id: "sid" } : null),
    }));
    mocks.messageFind.mockReturnValue({
      sort: () => ({ session: () => lean([{ role: "assistant", content: "a", activity: null, citations: null }]) }),
    });
    await expect(getSessionMessages("u1", "sid")).resolves.toEqual([
      { role: "assistant", content: "a", citations: null },
    ]);
    expect(mocks.sessionExists).toHaveBeenCalledWith({ _id: "sid", userId: "u1" });
    expect(mocks.messageFind).toHaveBeenCalledWith({ sessionId: "sid" });
    await expect(getSessionMessages("attacker", "sid")).resolves.toBeNull();
  });

  it("deletes owned session messages in the same transaction", async () => {
    mocks.sessionDeleteOne.mockResolvedValue({ deletedCount: 1 });
    mocks.messageDeleteMany.mockResolvedValue({ deletedCount: 2 });
    await expect(deleteSession("u1", "sid")).resolves.toBe(true);
    expect(mocks.sessionDeleteOne).toHaveBeenCalledWith({ _id: "sid", userId: "u1" }, { session: mongoSession });
    expect(mocks.messageDeleteMany).toHaveBeenCalledWith({ sessionId: "sid" }, { session: mongoSession });
  });

  it("scopes generated title writes to the owner", async () => {
    mocks.sessionUpdateOne.mockResolvedValue({ matchedCount: 0 });
    await updateSessionTitle("u1", "sid", "Title");
    expect(mocks.sessionUpdateOne).toHaveBeenCalledWith({ _id: "sid", userId: "u1" }, { $set: { title: "Title" } });
    await expect(renameSession("u1", "sid", "Renamed")).resolves.toBe(false);
  });
});

describe("history rehydration preserves stored citation data", () => {
  it("round trips null and citation arrays without normalization", async () => {
    await fc.assert(
      fc.asyncProperty(arbPersistedMessage, async (citations) => {
        mocks.sessionExists.mockReturnValue({ session: () => lean({ _id: "sid" }) });
        mocks.messageFind.mockReturnValue({
          sort: () => ({ session: () => lean([{ role: "assistant", content: "answer", citations, activity: null }]) }),
        });
        const messages = await getSessionMessages("u1", "sid");
        expect(JSON.stringify(messages?.[0].citations)).toEqual(JSON.stringify(citations));
      }),
    );
  });
});

describe("OAuth identity storage", () => {
  it("returns the existing identity and only updates supplied non-empty claims", async () => {
    oauth.findOne.mockReturnValueOnce(lean({ _id: "oa1", userId: "user-1" }));
    oauth.updateOne.mockResolvedValue(undefined);
    mocks.userFindById.mockReturnValue({ select: () => lean({ _id: "user-1", username: "ada-1234" }) });
    await expect(findOrCreateOAuthUser("google", "subject-1", { displayName: " Ada Lovelace " })).resolves.toEqual({
      id: "user-1",
      username: "ada-1234",
    });
    expect(oauth.updateOne).toHaveBeenCalledWith(
      { _id: "oa1" },
      { $set: expect.objectContaining({ displayName: "Ada Lovelace" }) },
    );
  });

  it.each([
    ["invalid provider", "Google", "subject", {}],
    ["empty subject", "google", " ", {}],
    ["oversized display name", "google", "subject", { displayName: "x".repeat(201) }],
    ["non-HTTPS avatar", "google", "subject", { avatarUrl: "http://images.example/avatar.png" }],
  ])("rejects %s before database writes", async (_label, provider, subject, profile) => {
    await expect(findOrCreateOAuthUser(provider, subject, profile)).rejects.toThrow();
    expect(oauth.findOne).not.toHaveBeenCalled();
  });
});
