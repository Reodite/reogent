import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let generateSessionTitle: typeof import("./title").generateSessionTitle;

const mocks = vi.hoisted(() => ({ converse: vi.fn(), updateSessionTitle: vi.fn() }));
vi.mock("../llm", () => ({ converse: mocks.converse }));
vi.mock("../sessions/store", () => ({ updateSessionTitle: mocks.updateSessionTitle }));

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv("TITLE_MAX_CONCURRENT", "1");
  vi.stubEnv("TITLE_TIMEOUT_MS", "1000");
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.spyOn(console, "error").mockImplementation(() => {});
  ({ generateSessionTitle } = await import("./title"));
  mocks.converse.mockResolvedValue({ message: { content: [{ text: '"Course planning"' }] } });
  mocks.updateSessionTitle.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("generated session titles", () => {
  it("skips title work at capacity and admits another title after completion", async () => {
    const pending = Promise.withResolvers<{ message: { content: { text: string }[] } }>();
    mocks.converse.mockReturnValueOnce(pending.promise);
    generateSessionTitle("u1", "first", "question", "answer");
    generateSessionTitle("u1", "busy", "question", "answer");
    expect(mocks.converse).toHaveBeenCalledOnce();
    expect(mocks.updateSessionTitle).not.toHaveBeenCalled();
    pending.resolve({ message: { content: [{ text: "First title" }] } });
    await vi.waitFor(() =>
      expect(mocks.updateSessionTitle).toHaveBeenCalledExactlyOnceWith("u1", "first", "First title"),
    );
    expect(mocks.converse.mock.calls[0][0].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    generateSessionTitle("u1", "next", "question", "answer");
    await vi.waitFor(() => expect(mocks.updateSessionTitle).toHaveBeenCalledWith("u1", "next", "Course planning"));
  });

  it("cancels an overdue title and refuses its late result before releasing capacity", async () => {
    const pending = Promise.withResolvers<{ message: { content: { text: string }[] } }>();
    mocks.converse.mockReturnValueOnce(pending.promise);
    generateSessionTitle("u1", "late", "question", "answer");
    const signal = mocks.converse.mock.calls[0][0].signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    await vi.advanceTimersByTimeAsync(1000);
    expect(signal.aborted).toBe(true);
    generateSessionTitle("u1", "still-busy", "question", "answer");
    expect(mocks.converse).toHaveBeenCalledOnce();
    pending.resolve({ message: { content: [{ text: "Late title" }] } });
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.updateSessionTitle).not.toHaveBeenCalled();
    generateSessionTitle("u1", "next", "question", "answer");
    await vi.waitFor(() =>
      expect(mocks.updateSessionTitle).toHaveBeenCalledExactlyOnceWith("u1", "next", "Course planning"),
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["provider", "write"])("releases capacity after a %s failure without retrying a write", async (failure) => {
    if (failure === "provider") mocks.converse.mockRejectedValueOnce(new Error("Provider failed"));
    else mocks.updateSessionTitle.mockRejectedValueOnce(new Error("Write failed"));
    generateSessionTitle("u1", "failed", "question", "answer");
    await vi.waitFor(() => expect(console.error).toHaveBeenCalledOnce());
    expect(mocks.updateSessionTitle).toHaveBeenCalledTimes(failure === "provider" ? 0 : 1);
    expect(vi.getTimerCount()).toBe(0);
    generateSessionTitle("u1", "next", "question", "answer");
    await vi.waitFor(() => expect(mocks.updateSessionTitle).toHaveBeenCalledWith("u1", "next", "Course planning"));
  });

  it.each([
    ["TITLE_MAX_CONCURRENT", "0"],
    ["TITLE_TIMEOUT_MS", "2147483648"],
  ])("rejects invalid %s configuration", async (name, value) => {
    vi.stubEnv(name, value);
    vi.resetModules();
    await expect(import("./title")).rejects.toThrow(name);
  });
  it("carries the authenticated owner into the title write", async () => {
    generateSessionTitle("u1", "sid", "question", "answer");

    await vi.waitFor(() => {
      expect(mocks.updateSessionTitle).toHaveBeenCalledExactlyOnceWith("u1", "sid", "Course planning");
    });
  });
});
