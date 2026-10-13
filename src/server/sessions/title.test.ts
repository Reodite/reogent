import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateSessionTitle } from "./title";

const mocks = vi.hoisted(() => ({ converse: vi.fn(), recordTokenUsage: vi.fn(), updateSessionTitle: vi.fn() }));
vi.mock("../llm", () => ({ converse: mocks.converse }));
vi.mock("../account", () => ({ recordTokenUsage: mocks.recordTokenUsage }));
vi.mock("../sessions/store", () => ({ updateSessionTitle: mocks.updateSessionTitle }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.converse.mockResolvedValue({ message: { content: [{ text: '"Course planning"' }] } });
  mocks.updateSessionTitle.mockResolvedValue(undefined);
});

describe("generated session titles", () => {
  it("carries the authenticated owner into the title write", async () => {
    generateSessionTitle("u1", "sid", "question", "answer");

    await vi.waitFor(() => {
      expect(mocks.updateSessionTitle).toHaveBeenCalledExactlyOnceWith("u1", "sid", "Course planning");
    });
  });

  it("records title generation usage for the account before saving the title", async () => {
    mocks.converse.mockResolvedValue({ message: { content: [{ text: "Course planning" }] }, totalTokens: 42 });
    generateSessionTitle("u1", "s1", "Plan my courses", "Your plan");
    await vi.waitFor(() =>
      expect(mocks.updateSessionTitle).toHaveBeenCalledExactlyOnceWith("u1", "s1", "Course planning"),
    );
    expect(mocks.recordTokenUsage).toHaveBeenCalledExactlyOnceWith("u1", 42);
    expect(mocks.recordTokenUsage.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.updateSessionTitle.mock.invocationCallOrder[0],
    );
  });
});
