// @vitest-environment happy-dom
import { SHELL_MODE_STORAGE_KEY } from "@/src/lib/shell-mode";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ value: "/tools/planner" }));
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

const { useShellMode } = await import("./use-shell-mode");

afterEach(() => {
  pathname.value = "/tools/planner";
  memory.clear();
  cleanup();
});

describe("useShellMode", () => {
  it("keeps the current mode while Settings is active", () => {
    const { result, rerender } = renderHook(() => useShellMode("tools"));
    expect(result.current[0]).toBe("tools");

    pathname.value = "/settings";
    rerender();
    expect(result.current[0]).toBe("tools");

    pathname.value = "/pulse";
    rerender();
    expect(result.current[0]).toBe("unity");
  });

  it("persists only explicit mode navigation", () => {
    const { result } = renderHook(() => useShellMode("ai"));
    act(() => result.current[1]("tools"));
    expect(localStorage.getItem(SHELL_MODE_STORAGE_KEY)).toBe("tools");
  });
});
