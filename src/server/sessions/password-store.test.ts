import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPasswordUser, getPasswordUser } from "./store";

const mocks = vi.hoisted(() => ({ create: vi.fn(), findOne: vi.fn() }));
vi.mock("../db/models", () => ({ User: mocks }));

beforeEach(() => {
  mocks.create.mockReset();
  mocks.findOne.mockReset();
});

describe("password account persistence", () => {
  it("stores a supplied hash without retaining the plaintext password", async () => {
    mocks.create.mockResolvedValue([{ _id: "user-1" }]);
    await expect(createPasswordUser("student", "bcrypt-hash")).resolves.toBe("user-1");
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith([{ username: "student", passwordHash: "bcrypt-hash" }]);
  });

  it("returns null for an unknown username", async () => {
    mocks.findOne.mockReturnValue({ select: () => ({ lean: async () => null }) });
    await expect(getPasswordUser("missing")).resolves.toBeNull();
  });

  it("returns an OAuth-only account with a null password hash", async () => {
    mocks.findOne.mockReturnValue({ select: () => ({ lean: async () => ({ _id: "user-2", passwordHash: null }) }) });
    await expect(getPasswordUser("oauth-user")).resolves.toEqual({ id: "user-2", passwordHash: null });
  });
});
