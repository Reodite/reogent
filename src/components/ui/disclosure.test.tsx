// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { StrictMode, type ComponentPropsWithRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Disclosure } from "./disclosure";

const motionState = vi.hoisted(() => ({
  reduce: false,
  entries: [] as { closing: boolean; complete: () => void }[],
}));

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  const { createElement, useLayoutEffect, useRef } = await import("react");
  type FrameProps = ComponentPropsWithRef<"div"> & {
    initial?: unknown;
    animate?: unknown;
    exit?: unknown;
    transition?: unknown;
    onAnimationComplete?: (definition: unknown) => void;
  };
  function Frame({
    initial: _initial,
    animate,
    exit,
    transition: _transition,
    onAnimationComplete,
    ...props
  }: FrameProps) {
    const [present] = actual.usePresence();
    const latest = useRef(onAnimationComplete);
    latest.current = onAnimationComplete;
    const definition = present ? animate : exit;
    useLayoutEffect(() => {
      motionState.entries.push({
        closing: !present,
        complete: () => {
          latest.current?.(definition);
        },
      });
    }, [definition, present]);
    return createElement("div", props);
  }
  return { ...actual, useReducedMotion: () => motionState.reduce, motion: { ...actual.motion, div: Frame } };
});

const frames = new Map<number, FrameRequestCallback>();
let frameId = 0;

beforeEach(() => {
  motionState.reduce = false;
  motionState.entries = [];
  frames.clear();
  frameId = 0;
  vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
    const id = ++frameId;
    frames.set(id, callback);
    return id;
  });
  vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id);
  });
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
    new DOMRect(0, 0, 120, 44),
  ] as unknown as DOMRectList);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function flushFrame() {
  const pending = [...frames.values()];
  frames.clear();
  act(() => {
    for (const callback of pending) callback(0);
  });
}

function Fixture({
  open,
  label = "Winter",
  replace = false,
  hidden = false,
  autoFocus = true,
}: {
  open: boolean;
  label?: string;
  replace?: boolean;
  hidden?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div hidden={hidden}>
      <button type="button">Outside</button>
      <Disclosure open={open}>
        <select
          key={String(replace)}
          aria-label="Destination"
          // biome-ignore lint/a11y/noAutofocus: Exercises the placement field's native autofocus during entry.
          autoFocus={autoFocus}
          defaultValue=""
        >
          <option value="">Choose</option>
          <option value="winter">{label}</option>
        </select>
        <button type="button">Next field</button>
      </Disclosure>
    </div>
  );
}

function expand() {
  const view = render(<Fixture open={false} />);
  view.rerender(<Fixture open />);
  const select = view.getByRole("combobox");
  const scroll = vi.spyOn(select, "scrollIntoView").mockImplementation(() => {});
  const focus = vi.spyOn(select, "focus");
  return { ...view, select, scroll, focus, opening: motionState.entries.at(-1)! };
}

describe("Disclosure focus reveal", () => {
  it("keeps immediate focus and waits for its opening completion plus layout", () => {
    const view = expand();
    expect(document.activeElement).toBe(view.select);
    expect(view.select.parentElement?.hasAttribute("data-disclosure-content")).toBe(true);
    expect(view.select.parentElement?.classList.contains("overflow-hidden")).toBe(true);
    fireEvent.scroll(view.select.parentElement!);
    flushFrame();
    expect(view.scroll).not.toHaveBeenCalled();
    act(() => view.opening.complete());
    expect(view.scroll).not.toHaveBeenCalled();
    flushFrame();
    expect(view.scroll).toHaveBeenCalledOnce();
    expect(view.scroll).toHaveBeenCalledWith({ block: "nearest", inline: "nearest", behavior: "instant" });
    expect(view.focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(view.select);

    view.rerender(<Fixture open label="Updated winter" />);
    expect(view.getByRole("combobox")).toBe(view.select);
    act(() => view.opening.complete());
    flushFrame();
    expect(view.scroll).toHaveBeenCalledOnce();
  });

  it.each(["blur", "replace", "keydown", "pointerdown", "wheel", "touchmove", "close", "unmount", "hidden"])(
    "cancels pending reveal on %s",
    (reason) => {
      const view = expand();
      if (reason === "blur") act(() => view.getByRole("button", { name: "Outside" }).focus());
      else if (reason === "replace") view.rerender(<Fixture open replace />);
      else if (reason === "close") view.rerender(<Fixture open={false} />);
      else if (reason === "unmount") view.unmount();
      else if (reason === "hidden") view.rerender(<Fixture open hidden />);
      else fireEvent(document, new Event(reason, { bubbles: true }));
      act(() => view.opening.complete());
      flushFrame();
      expect(view.scroll).not.toHaveBeenCalled();
      expect(view.focus).not.toHaveBeenCalled();
    },
  );

  it("cancels input after completion but before the reveal frame", () => {
    const view = expand();
    act(() => view.opening.complete());
    const pending = [...frames.values()];
    fireEvent.keyDown(view.select, { key: "PageDown" });
    act(() => {
      for (const callback of pending) callback(0);
    });
    flushFrame();
    expect(view.scroll).not.toHaveBeenCalled();
  });

  it("rejects an older opening or closing completion after reopening", () => {
    const view = expand();
    view.rerender(<Fixture open={false} />);
    const closing = motionState.entries.at(-1)!;
    expect(closing.closing).toBe(true);
    expect(view.select.closest("[inert]")).not.toBeNull();
    view.rerender(<Fixture open />);
    const reopened = motionState.entries.at(-1)!;
    expect(view.getByRole("combobox")).toBe(view.select);
    expect(view.select.closest("[inert]")).toBeNull();
    act(() => {
      view.opening.complete();
      closing.complete();
    });
    flushFrame();
    expect(view.scroll).not.toHaveBeenCalled();
    act(() => reopened.complete());
    flushFrame();
    expect(view.scroll).toHaveBeenCalledOnce();
  });

  it.each([false, true])("settles an initially open disclosure without animation callbacks, strict %s", (strict) => {
    const tree = <Fixture open />;
    const view = render(strict ? <StrictMode>{tree}</StrictMode> : tree);
    const select = view.getByRole("combobox");
    const scroll = vi.spyOn(select, "scrollIntoView").mockImplementation(() => {});
    expect(document.activeElement).toBe(select);
    expect(scroll).not.toHaveBeenCalled();
    flushFrame();
    expect(scroll).toHaveBeenCalledOnce();
    view.rerender(
      strict ? (
        <StrictMode>
          <Fixture open label="Updated" />
        </StrictMode>
      ) : (
        <Fixture open label="Updated" />
      ),
    );
    flushFrame();
    expect(scroll).toHaveBeenCalledOnce();
  });

  it("settles reduced-motion entry after layout without an animation callback", () => {
    motionState.reduce = true;
    const view = expand();
    expect(document.activeElement).toBe(view.select);
    expect(view.scroll).not.toHaveBeenCalled();
    flushFrame();
    expect(view.scroll).toHaveBeenCalledOnce();
    expect(view.scroll).toHaveBeenCalledWith({ block: "nearest", inline: "nearest", behavior: "instant" });
  });

  it.each([false, true])("does not replay an opening when motion preference changes, settled %s", (settled) => {
    const view = expand();
    if (settled) {
      act(() => view.opening.complete());
      flushFrame();
    }
    motionState.reduce = true;
    view.rerender(<Fixture open />);
    act(() => view.opening.complete());
    flushFrame();
    expect(view.scroll).toHaveBeenCalledTimes(settled ? 1 : 0);
  });

  it("does not replay entry reveal for focus that arrives after settlement", () => {
    const view = render(<Fixture open autoFocus={false} />);
    const select = view.getByRole("combobox");
    const scroll = vi.spyOn(select, "scrollIntoView").mockImplementation(() => {});
    flushFrame();
    act(() => select.focus());
    flushFrame();
    expect(scroll).not.toHaveBeenCalled();
  });
});
