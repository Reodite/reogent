// @vitest-environment happy-dom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { AnimatePresence } from "motion/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DialogPanel, DialogRoot } from "./dialog";
import { Disclosure } from "./disclosure";

const preference = vi.hoisted(() => ({ reduce: false }));
vi.mock("motion/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("motion/react")>()),
  useReducedMotion: () => preference.reduce,
}));

function Fixture({ open }: { open: boolean }) {
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <DialogRoot key="dialog" onDismiss={() => {}} backdropLabel="Close dialog">
          <DialogPanel aria-label="Presence dialog">
            <button type="button">Action</button>
          </DialogPanel>
        </DialogRoot>
      ) : null}
    </AnimatePresence>
  );
}

afterEach(() => {
  cleanup();
  preference.reduce = false;
  vi.restoreAllMocks();
});

describe("real Disclosure presence lifecycle", () => {
  it.each([false, true])("reveals focused content and removes closing payload, reduced %s", async (reduce) => {
    preference.reduce = reduce;
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
      new DOMRect(0, 0, 120, 44),
    ] as unknown as DOMRectList);
    const fixture = (open: boolean) => (
      <Disclosure open={open}>
        <input
          aria-label="Disclosure field"
          // biome-ignore lint/a11y/noAutofocus: Exercises native autofocus with the real presence lifecycle.
          autoFocus
          defaultValue="Kept"
        />
      </Disclosure>
    );
    const view = render(fixture(false));
    view.rerender(fixture(true));
    const input = view.getByRole("textbox");
    const scroll = vi.spyOn(input, "scrollIntoView").mockImplementation(() => {});
    await waitFor(() => expect(scroll).toHaveBeenCalledOnce());
    expect(document.activeElement).toBe(input);
    expect(scroll).toHaveBeenCalledWith({ block: "nearest", inline: "nearest", behavior: "instant" });
    view.rerender(fixture(true));
    expect(view.getByRole("textbox")).toBe(input);
    expect((input as HTMLInputElement).value).toBe("Kept");
    view.rerender(fixture(false));
    expect(input.closest("[aria-hidden='true'][inert]")).not.toBeNull();
    await waitFor(() => expect(view.container.querySelector("[data-disclosure]")).toBeNull());
    view.rerender(fixture(true));
    const reopened = view.getByRole("textbox");
    expect(reopened).not.toBe(input);
    await act(async () => {});
  });
});

describe("real overlay presence lifecycle", () => {
  it("removes reduced-motion dialogs after the parent registers their exit", async () => {
    preference.reduce = true;
    const view = render(<Fixture open />);
    expect(document.querySelector("[data-dialog-root]")).not.toBeNull();
    view.rerender(<Fixture open={false} />);
    await waitFor(() => expect(document.querySelector("[data-dialog-root]")).toBeNull());
    expect(view.container.inert).toBe(false);
  });

  it("removes dialogs when native animation is unavailable", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "animate");
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: undefined });
    try {
      const view = render(<Fixture open />);
      view.rerender(<Fixture open={false} />);
      await waitFor(() => expect(document.querySelector("[data-dialog-root]")).toBeNull());
      expect(view.container.inert).toBe(false);
    } finally {
      if (descriptor) Object.defineProperty(HTMLElement.prototype, "animate", descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, "animate");
    }
  });
});
