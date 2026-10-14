import { beforeEach, describe, expect, it, vi } from "vitest";
import { getProfile, saveProfile } from "./profile";

const query = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ getPool: () => ({ query }) }));

beforeEach(() => query.mockReset());

describe("profile persistence", () => {
  it("returns null when the account has no profile", async () => {
    query.mockResolvedValue({ rows: [] });
    expect(await getProfile("u1")).toBeNull();
    expect(query).toHaveBeenCalledWith(expect.stringContaining("WHERE user_id = $1"), ["u1"]);
  });

  it.each([undefined, "system", "invalid"])(
    "omits unsupported saved appearance %s without losing details",
    async (theme) => {
      const profile = { preferred_name: "Sam", year: 3, student_type: "domestic", onboarding_completed: true };
      query.mockResolvedValue({ rows: [{ data: { ...profile, theme } }] });
      expect(await getProfile("u1")).toStrictEqual(profile);
      expect(query).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["light", "dark"])("retains a saved %s preference", async (theme) => {
    const profile = { program: "Science", theme, onboarding_completed: true };
    query.mockResolvedValue({ rows: [{ data: profile }] });
    expect(await getProfile("u1")).toEqual(profile);
  });

  it("saves year ten and an explicit appearance with the completion flag", async () => {
    query.mockResolvedValue({ rows: [] });
    const profile = { year: 10, theme: "dark", onboarding_completed: true } as const;
    await saveProfile("u1", profile);
    expect(query).toHaveBeenCalledWith(expect.stringContaining("ON CONFLICT"), ["u1", JSON.stringify(profile)]);
  });
});
