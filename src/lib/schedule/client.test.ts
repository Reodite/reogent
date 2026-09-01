import { describe, expect, it } from "vitest";
import { normalizePerson } from "./client";

describe("normalizePerson", () => {
  it("keeps a valid stored avatar and schedule", () => {
    const person = normalizePerson({
      id: "u1",
      handle: "Ada",
      avatar: { kind: "emoji", emoji: "🦫", color: "#123456" },
      schedule: { sections: [], importedAt: "2026-01-01T00:00:00Z" },
      updatedAt: "2026-01-01T00:00:00Z",
    });
    expect(person.avatar).toMatchObject({ kind: "emoji", emoji: "🦫" });
    expect(person.schedule?.sections).toEqual([]);
    expect(person.enabled).toBe(true);
  });

  it("gives a schedule-less member a usable initials avatar", () => {
    const person = normalizePerson({
      id: "u2",
      handle: "Grace Hopper",
      avatar: null,
      schedule: { malformed: true },
      updatedAt: "2026-01-01T00:00:00Z",
    });
    expect(person.avatar).toMatchObject({ kind: "initials", initials: "GH" });
    expect(person.schedule).toBeNull();
  });
});
