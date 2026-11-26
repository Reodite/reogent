import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPasswordUser, getPasswordUser } from "./store";

const query = vi.hoisted(() => vi.fn());
vi.mock("../db", () => ({ getPool: () => ({ query }) }));

beforeEach(() => query.mockReset());

describe("password account persistence", () => {
  it("stores a supplied hash without retaining the plaintext password", async () => {
    query.mockResolvedValue({ rows: [{ id: "user-1" }] });

    await expect(createPasswordUser("student", "bcrypt-hash")).resolves.toBe("user-1");
    expect(query).toHaveBeenCalledExactlyOnceWith(
      "INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id",
      ["student", "bcrypt-hash"],
    );
  });

  it("returns a null hash for an unknown username", async () => {
    query.mockResolvedValue({ rows: [] });

    await expect(getPasswordUser("missing")).resolves.toBeNull();
  });

  it("returns an OAuth-only account with a null password hash", async () => {
    query.mockResolvedValue({ rows: [{ id: "user-2", password_hash: null }] });

    await expect(getPasswordUser("oauth-user")).resolves.toEqual({ id: "user-2", passwordHash: null });
  });
});
