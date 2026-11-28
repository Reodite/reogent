import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
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

  it("limits concurrent title requests and aborts work at its deadline", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    let resolveFirst!: (value: { message: { content: { text: string }[] } }) => void;
    mocks.converse.mockImplementation(({ signal }: { signal: AbortSignal }) => {
      signals.push(signal);
      return new Promise((resolve) => {
        resolveFirst ??= resolve;
      });
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    generateSessionTitle("u1", "s1", "q1", "a1");
    generateSessionTitle("u1", "s2", "q2", "a2");
    generateSessionTitle("u1", "s3", "q3", "a3");
    expect(mocks.converse).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    generateSessionTitle("u1", "s4", "q4", "a4");
    expect(mocks.converse).toHaveBeenCalledTimes(3);
    resolveFirst({ message: { content: [{ text: "Late title" }] } });
    await vi.runAllTimersAsync();
    expect(mocks.updateSessionTitle).not.toHaveBeenCalled();
  });

  it.each(["usage recording", "title update"])("releases model capacity before a stalled %s", async (stage) => {
    let releaseWrite!: () => void;
    const pendingWrite = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    if (stage === "usage recording") {
      mocks.converse.mockResolvedValueOnce({
        message: { content: [{ text: "Course planning" }] },
        totalTokens: 42,
      });
      mocks.recordTokenUsage.mockReturnValueOnce(pendingWrite);
    } else {
      mocks.updateSessionTitle.mockReturnValueOnce(pendingWrite);
    }

    generateSessionTitle("u1", "s1", "question", "answer");
    await vi.waitFor(() =>
      expect(stage === "usage recording" ? mocks.recordTokenUsage : mocks.updateSessionTitle).toHaveBeenCalledOnce(),
    );

    generateSessionTitle("u1", "s2", "question", "answer");
    await vi.waitFor(() => expect(mocks.converse).toHaveBeenCalledTimes(2));

    releaseWrite();
    await vi.waitFor(() => expect(mocks.updateSessionTitle).toHaveBeenCalled());
  });
});
