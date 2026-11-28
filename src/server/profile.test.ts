import { beforeEach, describe, expect, it, vi } from "vitest";
import { getProfile, saveProfile } from "./profile";

const mocks = vi.hoisted(() => ({ connectDatabase: vi.fn(), findById: vi.fn(), findOneAndUpdate: vi.fn() }));
vi.mock("./db", () => ({ connectDatabase: mocks.connectDatabase }));
vi.mock("./db/models", () => ({ UserProfile: mocks }));

beforeEach(() => {
  mocks.findById.mockReset();
  mocks.findOneAndUpdate.mockReset().mockResolvedValue(undefined);
  mocks.connectDatabase.mockReset().mockResolvedValue(undefined);
});

describe("profile persistence", () => {
  it("returns null when the account has no profile", async () => {
    mocks.findById.mockReturnValue({ lean: () => null });
    expect(await getProfile("u1")).toBeNull();
    expect(mocks.findById).toHaveBeenCalledWith("u1");
  });

  it.each([undefined, "system", "invalid"])(
    "omits unsupported saved appearance %s without losing details",
    async (theme) => {
      const profile = { preferred_name: "Sam", year: 3, student_type: "domestic", onboarding_completed: true };
      mocks.findById.mockReturnValue({ lean: () => ({ data: { ...profile, theme } }) });
      expect(await getProfile("u1")).toStrictEqual(profile);
      expect(mocks.connectDatabase).toHaveBeenCalledOnce();
    },
  );

  it.each(["light", "dark"])("retains a saved %s preference", async (theme) => {
    const profile = { program: "Science", theme, onboarding_completed: true };
    mocks.findById.mockReturnValue({ lean: () => ({ data: profile }) });
    expect(await getProfile("u1")).toEqual(profile);
  });

  it("saves year ten and an explicit appearance with the completion flag", async () => {
    const profile = { year: 10, theme: "dark", onboarding_completed: true } as const;
    await saveProfile("u1", profile);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: "u1" },
      { $set: { data: profile, updatedAt: expect.any(Date) } },
      { upsert: true, runValidators: true },
    );
  });
});
