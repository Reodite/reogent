import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateSessionTitle } from "./title";

const mocks = vi.hoisted(() => ({ converse: vi.fn(), updateSessionTitle: vi.fn() }));
vi.mock("../llm", () => ({ converse: mocks.converse }));
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
});
