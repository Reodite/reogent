import { beforeEach, describe, expect, it, vi } from "vitest";
import { findOrCreateOAuthUser } from "./store";

const cryptoMocks = vi.hoisted(() => ({ randomInt: vi.fn() }));
vi.mock("node:crypto", () => ({ randomInt: cryptoMocks.randomInt }));

const mocks = vi.hoisted(() => ({
  connectDatabase: vi.fn(),
  oauthFindOne: vi.fn(),
  oauthUpdateOne: vi.fn(),
  oauthCreate: vi.fn(),
  userFindById: vi.fn(),
  userStartSession: vi.fn(),
  userCreate: vi.fn(),
}));
const mongoSession = {
  withTransaction: vi.fn(async (callback: () => Promise<void>) => callback()),
  endSession: vi.fn(),
};
vi.mock("../db", () => ({ connectDatabase: mocks.connectDatabase }));
vi.mock("../db/models", () => ({
  OAuthAccount: { findOne: mocks.oauthFindOne, updateOne: mocks.oauthUpdateOne, create: mocks.oauthCreate },
  User: { findById: mocks.userFindById, startSession: mocks.userStartSession, create: mocks.userCreate },
}));

function lean(value: unknown) {
  return { lean: async () => value };
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.connectDatabase.mockResolvedValue(undefined);
  cryptoMocks.randomInt.mockReset().mockReturnValue(4721);
  mocks.userStartSession.mockResolvedValue(mongoSession);
  mocks.userCreate.mockResolvedValue([{ _id: "user-2", username: "ada-lovelace-4721" }]);
  mocks.oauthCreate.mockResolvedValue([{ _id: "oa2" }]);
  mongoSession.withTransaction.mockReset().mockImplementation(async (callback) => callback());
  mongoSession.endSession.mockReset().mockResolvedValue(undefined);
});

describe("provider-neutral account persistence", () => {
  it("updates claims for an existing provider identity and retains its user id", async () => {
    mocks.oauthFindOne.mockReturnValueOnce(lean({ _id: "oa1", userId: "user-1" }));
    mocks.oauthUpdateOne.mockResolvedValue(undefined);
    mocks.userFindById.mockReturnValue({ select: () => lean({ _id: "user-1", username: "ada-1234" }) });
    await expect(
      findOrCreateOAuthUser("google", "subject-1", {
        email: "ada@example.com",
        emailVerified: true,
        displayName: "Ada Lovelace",
        avatarUrl: "https://images.example/ada.png",
      }),
    ).resolves.toEqual({ id: "user-1", username: "ada-1234" });
    expect(mocks.oauthUpdateOne).toHaveBeenCalledWith(
      { _id: "oa1" },
      {
        $set: expect.objectContaining({
          email: "ada@example.com",
          emailVerified: true,
          displayName: "Ada Lovelace",
          avatarUrl: "https://images.example/ada.png",
        }),
      },
    );
    expect(mongoSession.withTransaction).not.toHaveBeenCalled();
  });

  it("preserves the stored email and verification when the provider omits email", async () => {
    mocks.oauthFindOne.mockReturnValueOnce(lean({ _id: "oa1", userId: "user-1" }));
    mocks.oauthUpdateOne.mockResolvedValue(undefined);
    mocks.userFindById.mockReturnValue({ select: () => lean({ _id: "user-1", username: "ada-1234" }) });
    await findOrCreateOAuthUser("google", "subject-1", {});
    const claims = mocks.oauthUpdateOne.mock.calls[0][1].$set;
    expect(claims).not.toHaveProperty("email");
    expect(claims).not.toHaveProperty("emailVerified");
  });

  it("replaces the email claim and clears verification when the new email is unverified", async () => {
    mocks.oauthFindOne.mockReturnValueOnce(lean({ _id: "oa1", userId: "user-1" }));
    mocks.oauthUpdateOne.mockResolvedValue(undefined);
    mocks.userFindById.mockReturnValue({ select: () => lean({ _id: "user-1", username: "ada-1234" }) });
    await findOrCreateOAuthUser("google", "subject-1", { email: "new@example.com", emailVerified: false });
    expect(mocks.oauthUpdateOne.mock.calls[0][1].$set).toMatchObject({
      email: "new@example.com",
      emailVerified: false,
    });
  });

  it("preserves a verified email when the provider omits the email claim", async () => {
    mocks.oauthFindOne.mockReturnValueOnce(lean({ _id: "oa1", userId: "user-1" }));
    mocks.oauthUpdateOne.mockResolvedValue(undefined);
    mocks.userFindById.mockReturnValue({ select: () => lean({ _id: "user-1", username: "ada-1234" }) });
    await findOrCreateOAuthUser("google", "subject-1", {});
    const update = mocks.oauthUpdateOne.mock.calls[0][1].$set;
    expect(update).not.toHaveProperty("email");
    expect(update).not.toHaveProperty("emailVerified");
  });

  it("marks a changed email unverified when the provider omits verification", async () => {
    mocks.oauthFindOne.mockReturnValueOnce(lean({ _id: "oa1", userId: "user-1" }));
    mocks.oauthUpdateOne.mockResolvedValue(undefined);
    mocks.userFindById.mockReturnValue({ select: () => lean({ _id: "user-1", username: "ada-1234" }) });
    await findOrCreateOAuthUser("google", "subject-1", { email: "new@example.com" });
    expect(mocks.oauthUpdateOne.mock.calls[0][1].$set).toMatchObject({
      email: "new@example.com",
      emailVerified: false,
    });
  });

  it("creates a new user and one primary identity transactionally", async () => {
    mocks.oauthFindOne.mockReturnValueOnce(lean(null)).mockReturnValueOnce({ session: () => lean(null) });
    mocks.userFindById.mockReturnValue({ session: () => lean(null) });
    await expect(findOrCreateOAuthUser("microsoft", "subject-2", { displayName: "Ada Lovelace" })).resolves.toEqual({
      id: "user-2",
      username: "ada-lovelace-4721",
    });
    expect(mocks.userCreate.mock.calls[0][0][0].username).toMatch(/^adalovelace-\d{4}$/);
    expect(mocks.userCreate.mock.calls[0][1]).toEqual({ session: mongoSession });
    expect(mocks.oauthCreate).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          userId: "user-2",
          provider: "microsoft",
          providerSubject: "subject-2",
          isPrimary: true,
        }),
      ],
      { session: mongoSession },
    );
    expect(mongoSession.withTransaction).toHaveBeenCalledOnce();
    expect(mongoSession.endSession).toHaveBeenCalledOnce();
  });

  it("returns the winning identity after a concurrent duplicate-key race", async () => {
    let oauthLookups = 0;
    mocks.oauthFindOne.mockImplementation(() => {
      oauthLookups++;
      if (oauthLookups === 2) return { session: () => lean(null) };
      if (oauthLookups < 5) return lean(null);
      return lean({ _id: "oa-winner", userId: "winner" });
    });
    mocks.userFindById.mockImplementation(() => ({ select: () => lean({ _id: "winner", username: "student-1234" }) }));
    mocks.oauthCreate.mockRejectedValueOnce({
      code: 11000,
      keyValue: { provider: "google", providerSubject: "subject-3" },
    });
    await expect(findOrCreateOAuthUser("google", "subject-3", {})).resolves.toEqual({
      id: "winner",
      username: "student-1234",
    });
    expect(oauthLookups).toBe(5);
  });

  it("retries username conflicts in a fresh transaction", async () => {
    cryptoMocks.randomInt.mockReturnValueOnce(1234).mockReturnValueOnce(5678);
    const lookup = Object.assign(lean(null), { session: () => lean(null) });
    mocks.oauthFindOne.mockReturnValue(lookup);
    mocks.userFindById.mockReturnValue({ session: () => lean(null) });
    mocks.userCreate
      .mockRejectedValueOnce({ code: 11000, keyValue: { username: "adalovelace-1234" } })
      .mockResolvedValueOnce([{ _id: "user-2", username: "adalovelace-5678" }]);

    await expect(findOrCreateOAuthUser("google", "subject-4", { displayName: "Ada Lovelace" })).resolves.toEqual({
      id: "user-2",
      username: "adalovelace-5678",
    });
    expect(mongoSession.withTransaction).toHaveBeenCalledTimes(2);
    expect(mongoSession.endSession).toHaveBeenCalledTimes(2);
  });

  it("does not recover unrelated duplicate constraints as username or OAuth races", async () => {
    mocks.oauthFindOne.mockReturnValueOnce(lean(null)).mockReturnValueOnce({ session: () => lean(null) });
    const conflict = { code: 11000, keyValue: { unrelated: "collision" } };
    mocks.userCreate.mockRejectedValueOnce(conflict);

    await expect(findOrCreateOAuthUser("google", "subject-5", {})).rejects.toMatchObject(conflict);
    expect(mocks.oauthFindOne).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["invalid provider", "Google", "subject", {}],
    ["empty subject", "google", " ", {}],
    ["oversized email", "google", "subject", { email: "x".repeat(321) }],
    ["oversized display name", "google", "subject", { displayName: "x".repeat(201) }],
    ["non-HTTPS avatar", "google", "subject", { avatarUrl: "http://images.example/avatar.png" }],
  ])("rejects %s before database work", async (_label, provider, subject, profile) => {
    await expect(findOrCreateOAuthUser(provider, subject, profile)).rejects.toThrow();
    expect(mocks.connectDatabase).not.toHaveBeenCalled();
    expect(mocks.oauthFindOne).not.toHaveBeenCalled();
    expect(mocks.userStartSession).not.toHaveBeenCalled();
  });
});
