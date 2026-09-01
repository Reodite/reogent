// @vitest-environment happy-dom
import type { CalendarEvent } from "@/src/shared/calendar/event";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCalendarEvents } from "./use-calendar-events";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function response(events: CalendarEvent[]): Response {
  return new Response(JSON.stringify(events), { status: 200, headers: { "content-type": "application/json" } });
}

const april: CalendarEvent = {
  kind: "academic",
  label: "April deadline",
  date: "2026-04-15",
  tags: [],
};
const may: CalendarEvent = {
  kind: "event",
  label: "May event",
  date: "2026-05-10",
  tags: [],
};

beforeEach(() => {
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useCalendarEvents", () => {
  it("distinguishes initial loading from a successful empty snapshot", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response([])),
    );
    const { result } = renderHook(() => useCalendarEvents("2026-04", ["academic"]));
    expect(result.current.state.status).toBe("loading");
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(result.current.state.events).toEqual([]);
  });

  it("rejects stale responses and never shows data from another request key", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { result, rerender } = renderHook(({ cursor }) => useCalendarEvents(cursor, ["academic", "event"]), {
      initialProps: { cursor: "2026-04" },
    });

    rerender({ cursor: "2026-05" });
    expect(result.current.state.status).toBe("loading");
    expect(result.current.state.events).toEqual([]);
    await act(async () => first.resolve(response([april])));
    expect(result.current.state.events).toEqual([]);
    await act(async () => second.resolve(response([may])));
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(result.current.state.events).toEqual([may]);
  });

  it("performs a real visibility refresh and retains same-key data on failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response([april]))
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useCalendarEvents("2026-04", ["academic"]));
    await waitFor(() => expect(result.current.state.status).toBe("ready"));

    fireVisibilityChange();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.state.status).toBe("stale"));
    expect(result.current.state.events).toEqual([april]);
    expect(result.current.state.error.message).toBe("offline");
  });

  it("retries a failed empty request and enables the ready state", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(response([april]));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useCalendarEvents("2026-04", ["academic"]));
    await waitFor(() => expect(result.current.state.status).toBe("failed"));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(result.current.state.events).toEqual([april]);
  });
});

function fireVisibilityChange() {
  act(() => document.dispatchEvent(new Event("visibilitychange")));
}
