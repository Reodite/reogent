// @vitest-environment happy-dom

import { WorkspaceHostProvider } from "@/src/components/shell/workspace-host";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToastProvider, useToast } from "./toast";

const preference = vi.hoisted(() => ({ reduce: false }));
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => preference.reduce,
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function ToastTrigger() {
  const toast = useToast();
  const next = useRef(0);
  return (
    <button type="button" onClick={() => toast(`Saved ${++next.current}`, next.current === 2 ? "error" : "info")}>
      Notify
    </button>
  );
}

function currentMessages(stack: HTMLElement) {
  return [...stack.children]
    .filter((item) => item.getAttribute("aria-hidden") !== "true")
    .map((item) => item.textContent);
}

async function advance(milliseconds: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

function setup() {
  preference.reduce = true;
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  const view = render(
    <ToastProvider>
      <ToastTrigger />
    </ToastProvider>,
  );
  return { ...view, stack: screen.getByRole("status"), trigger: screen.getByRole("button", { name: "Notify" }) };
}

describe("ToastProvider motion", () => {
  it.each([false, true])("keeps the timer and three-message limit with reduced motion %s", async (reduce) => {
    preference.reduce = reduce;
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>,
    );
    const stack = screen.getByRole("status");
    const trigger = screen.getByRole("button", { name: "Notify" });
    expect(stack.className).toContain("app-notification-stack");
    expect(stack.className).not.toContain("bottom-5");
    for (let index = 0; index < 4; index++) fireEvent.click(trigger);
    expect(
      [...stack.children].filter((item) => item.getAttribute("aria-hidden") !== "true").map((item) => item.textContent),
    ).toEqual(["Saved 2", "Saved 3", "Saved 4"]);
    expect(screen.getByText("Saved 2").className).toContain("text-error");
    if (reduce) expect(screen.getByText("Saved 4").style.opacity).toBe("1");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4199);
    });
    expect(screen.getByText("Saved 4").getAttribute("aria-hidden")).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect([...stack.children].filter((item) => item.getAttribute("aria-hidden") !== "true")).toHaveLength(0);
  });
});

describe("ToastProvider reading access", () => {
  it.each(["tools", "answer-canvas"] as const)(
    "marks the local %s stack for bounded keyboard scrolling",
    async (host) => {
      preference.reduce = true;
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
      const { container } = render(
        <WorkspaceHostProvider host={host}>
          <ToastProvider>
            <ToastTrigger />
          </ToastProvider>
        </WorkspaceHostProvider>,
      );
      const stack = screen.getByRole("status", { name: "Notifications" });
      const trigger = screen.getByRole("button", { name: "Notify" });
      expect(container.contains(stack)).toBe(true);
      expect(stack.getAttribute("aria-live")).toBe("polite");
      expect(stack.getAttribute("data-toast-host")).toBe(host);
      for (const name of [
        "app-notification-stack",
        "schedule-toast-stack",
        "fixed",
        "w-max",
        "overflow-y-auto",
        "overscroll-y-contain",
        "p-2",
        "gap-2",
      ]) {
        expect(stack.classList.contains(name)).toBe(true);
      }
      expect(stack.hasAttribute("tabindex")).toBe(false);
      expect(stack.classList.contains("pointer-events-none")).toBe(true);
      trigger.focus();
      fireEvent.click(trigger);
      expect(document.activeElement).toBe(trigger);
      expect(stack.tabIndex).toBe(0);
      expect(stack.classList.contains("pointer-events-auto")).toBe(true);
      expect(stack.classList.contains("pointer-events-none")).toBe(false);
      expect(screen.getByText("Saved 1").classList.contains("max-w-sm")).toBe(true);
      expect(screen.getByText("Saved 1").classList.contains("shrink-0")).toBe(true);
      await advance(4200);
      expect(stack.hasAttribute("tabindex")).toBe(false);
      expect(stack.classList.contains("pointer-events-none")).toBe(true);
    },
  );

  it.each(["pointer", "focus"])(
    "holds overdue messages during %s reading and removes them on departure",
    async (reading) => {
      const { stack, trigger } = setup();
      fireEvent.click(trigger);
      if (reading === "pointer") fireEvent.pointerEnter(stack);
      else act(() => stack.focus());
      await advance(5000);
      expect(currentMessages(stack)).toEqual(["Saved 1"]);
      if (reading === "pointer") fireEvent.pointerLeave(stack);
      else act(() => trigger.focus());
      expect(currentMessages(stack)).toEqual([]);
    },
  );

  it.each(["pointer", "focus"])("waits for both reading modes when %s leaves first", async (first) => {
    const { stack, trigger } = setup();
    fireEvent.click(trigger);
    act(() => stack.focus());
    fireEvent.pointerEnter(stack);
    await advance(4200);
    expect(currentMessages(stack)).toEqual(["Saved 1"]);
    if (first === "pointer") fireEvent.pointerLeave(stack);
    else act(() => trigger.focus());
    expect(currentMessages(stack)).toEqual(["Saved 1"]);
    if (first === "pointer") act(() => trigger.focus());
    else fireEvent.pointerLeave(stack);
    expect(currentMessages(stack)).toEqual([]);
  });

  it("ignores internal blur and retains unexpired original deadlines on release", async () => {
    const { stack, trigger } = setup();
    fireEvent.click(trigger);
    act(() => stack.focus());
    await advance(2000);
    fireEvent.click(trigger);
    await advance(2200);
    fireEvent.blur(stack, { relatedTarget: screen.getByText("Saved 2") });
    expect(currentMessages(stack)).toEqual(["Saved 1", "Saved 2"]);
    fireEvent.focus(screen.getByText("Saved 2"));
    fireEvent.blur(screen.getByText("Saved 2"), { relatedTarget: stack });
    expect(currentMessages(stack)).toEqual(["Saved 1", "Saved 2"]);
    act(() => trigger.focus());
    expect(currentMessages(stack)).toEqual(["Saved 2"]);
    await advance(1999);
    expect(currentMessages(stack)).toEqual(["Saved 2"]);
    await advance(1);
    expect(currentMessages(stack)).toEqual([]);
  });

  it("evicts the oldest while reading without moving stack focus or scroll", async () => {
    const { stack, trigger } = setup();
    fireEvent.click(trigger);
    act(() => stack.focus());
    stack.scrollTop = 48;
    fireEvent.pointerEnter(stack);
    await advance(4200);
    for (let index = 0; index < 3; index++) fireEvent.click(trigger);
    expect(currentMessages(stack)).toEqual(["Saved 2", "Saved 3", "Saved 4"]);
    expect(document.activeElement).toBe(stack);
    expect(stack.scrollTop).toBe(48);
    fireEvent.pointerLeave(stack);
    expect(stack.scrollTop).toBe(48);
    expect(currentMessages(stack)).toEqual(["Saved 2", "Saved 3", "Saved 4"]);
  });

  it("clears evicted and unmounted deadline timers", () => {
    const { trigger, unmount } = setup();
    const schedule = vi.spyOn(globalThis, "setTimeout");
    const cancel = vi.spyOn(globalThis, "clearTimeout");
    for (let index = 0; index < 4; index++) fireEvent.click(trigger);
    const deadlines = schedule.mock.calls.flatMap((call, index) =>
      call[1] === 4200 ? [schedule.mock.results[index].value] : [],
    );
    expect(deadlines).toHaveLength(4);
    expect(cancel).toHaveBeenCalledWith(deadlines[0]);
    for (const timer of deadlines.slice(1)) expect(cancel).not.toHaveBeenCalledWith(timer);
    unmount();
    for (const timer of deadlines) expect(cancel).toHaveBeenCalledWith(timer);
  });
});
