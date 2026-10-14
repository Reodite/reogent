// @vitest-environment happy-dom
import { SHELL_MODE_STORAGE_KEY } from "@/src/lib/shell-mode";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ value: "/app/tools/planner" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

const memory = new Map<string, string>();
const storage: Storage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => void memory.set(key, String(value)),
  removeItem: (key) => void memory.delete(key),
  clear: () => memory.clear(),
  key: (index) => Array.from(memory.keys())[index] ?? null,
  get length() {
    return memory.size;
  },
};
Object.defineProperty(window, "localStorage", { configurable: true, value: storage });

const { shellModeForPath, useShellMode } = await import("./use-shell-mode");

afterEach(() => {
  pathname.value = "/app/tools/planner";
  memory.clear();
  cleanup();
});

describe("useShellMode", () => {
  it.each([
    ["/app", "ai"],
    ["/app/chat/session-123", "ai"],
    ["/app/tools/map", "tools"],
    ["/app/pulse/schedule/ABC123", "unity"],
    ["/", null],
    ["/app/settings", null],
    ["/app/toolshed", null],
    ["/app/pulses", null],
  ] as const)("identifies the workspace mode for %s", (pathname, expected) => {
    expect(shellModeForPath(pathname)).toBe(expected);
  });

  it.each(["/app/settings", "/app/account", "/app/about"])(
    "keeps the current mode while %s is active",
    (utilityPath) => {
      const { result, rerender } = renderHook(() => useShellMode("tools"));
      expect(result.current[0]).toBe("tools");

      pathname.value = utilityPath;
      rerender();
      expect(result.current[0]).toBe("tools");

      pathname.value = "/app/pulse";
      rerender();
      expect(result.current[0]).toBe("unity");
    },
  );

  it("renders the latest navigation intent before the committed pathname", () => {
    const { result, rerender } = renderHook(
      ({ displayPathname }) => useShellMode("ai", { committedPathname: "/app", displayPathname }),
      { initialProps: { displayPathname: "/app/tools/map" } },
    );
    expect(result.current[0]).toBe("tools");

    rerender({ displayPathname: "/app/pulse" });
    expect(result.current[0]).toBe("unity");
  });

  it.each(["/app/settings", "/app/account", "/app/about"])(
    "hydrates the stored mode on a direct %s load",
    async (utilityPath) => {
      pathname.value = utilityPath;
      memory.set(SHELL_MODE_STORAGE_KEY, "unity");

      const { result } = renderHook(() => useShellMode("ai"));

      await waitFor(() => expect(result.current[0]).toBe("unity"));
    },
  );

  it.each(["/app/settings", "/app/account", "/app/about"])("keeps the explicit guest mode on %s", (utilityPath) => {
    pathname.value = utilityPath;
    memory.set(SHELL_MODE_STORAGE_KEY, "unity");

    const { result } = renderHook(() => useShellMode("tools"));

    expect(result.current[0]).toBe("tools");
  });

  it("persists only explicit mode navigation", () => {
    const { result } = renderHook(() => useShellMode("ai"));
    act(() => result.current[1]("tools"));
    expect(localStorage.getItem(SHELL_MODE_STORAGE_KEY)).toBe("tools");
  });
});
