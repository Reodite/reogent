// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canRestoreFocus, DialogActions, DialogHeader, DialogPanel, DialogRoot } from "./dialog";

beforeEach(() => {
  // HappyDOM has no layout; model rects only within the dialog fixtures.
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    return (this.closest("[data-dialog-root]") && !this.closest("details:not([open]) > :not(summary)")
      ? [new DOMRect(0, 0, 100, 44)]
      : []) as unknown as DOMRectList;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.style.overflow = "";
});

function DialogHarness({ dismissDisabled = false }: { dismissDisabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      {open ? (
        <DialogRoot
          onDismiss={() => setOpen(false)}
          dismissDisabled={dismissDisabled}
          backdropLabel="Close test dialog"
        >
          <DialogPanel aria-label="Test dialog" className="p-4">
            <button type="button" data-dialog-initial-focus>
              First action
            </button>
            <button type="button">Last action</button>
          </DialogPanel>
        </DialogRoot>
      ) : null}
    </>
  );
}

describe("canRestoreFocus", () => {
  it("accepts a native summary without a tabindex attribute", () => {
    render(
      <details>
        <summary>Return to course</summary>
      </details>,
    );
    const summary = screen.getByText("Return to course");
    expect(summary.hasAttribute("tabindex")).toBe(false);
    expect(canRestoreFocus(summary)).toBe(true);
  });

  it.each(["hidden", "inert", "aria-hidden"])("rejects a summary under %s ancestry", (attribute) => {
    const { container } = render(
      <details>
        <summary>Unavailable course</summary>
      </details>,
    );
    container.setAttribute(attribute, "true");
    expect(canRestoreFocus(screen.getByText("Unavailable course"))).toBe(false);
  });
});

describe("Dialog", () => {
  it("keeps native summary navigation inside the dialog and wraps at its visible boundaries", () => {
    render(
      <DialogRoot onDismiss={() => {}} backdropLabel="Close courses">
        <DialogPanel aria-label="Courses">
          <button type="button" data-dialog-initial-focus>
            First course action
          </button>
          <details>
            <summary>Course details</summary>
            <button type="button">Closed course action</button>
          </details>
          <div hidden>
            <button type="button">Hidden action</button>
          </div>
          <div inert>
            <button type="button">Inert action</button>
          </div>
          <div aria-hidden="true">
            <button type="button">Aria-hidden action</button>
          </div>
        </DialogPanel>
      </DialogRoot>,
    );
    const first = screen.getByText("First course action");
    const summary = screen.getByText("Course details");
    // HappyDOM reports -1 for native summaries; browsers report 0.
    vi.spyOn(summary, "tabIndex", "get").mockReturnValue(0);
    expect(summary.hasAttribute("tabindex")).toBe(false);
    expect(document.activeElement).toBe(first);
    const interiorTab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    fireEvent(first, interiorTab);
    expect(interiorTab.defaultPrevented).toBe(false);
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(summary);
    fireEvent.keyDown(summary, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    const details = summary.closest("details")!;
    details.open = true;
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    const content = screen.getByText("Closed course action");
    expect(document.activeElement).toBe(content);
    fireEvent.keyDown(content, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });

  it("shares title semantics, responsive insets, and action spacing", async () => {
    render(
      <DialogRoot onDismiss={() => {}} backdropLabel="Close profile">
        <DialogPanel aria-labelledby="profile-title">
          <DialogHeader
            title="Profile"
            titleId="profile-title"
            description="Choose your display name."
            leading={<span aria-hidden="true">R</span>}
            closeAction={
              <button type="button" data-dialog-initial-focus>
                Close
              </button>
            }
          />
          <DialogActions>
            <button type="button">Save</button>
          </DialogActions>
        </DialogPanel>
      </DialogRoot>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Profile" });
    expect(screen.getByRole("heading", { name: "Profile", level: 2 }).className).toContain("text-base");
    expect(dialog.className).toContain("p-4 sm:p-6");
    expect(dialog.querySelector("[data-dialog-header]")?.className).toContain("gap-3");
    expect(dialog.querySelector("[data-dialog-actions]")?.className).toContain("mt-6");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Close" }));
  });

  it("supports contained bodies and stacked footer actions without duplicate insets", async () => {
    render(
      <DialogRoot onDismiss={() => {}} backdropLabel="Close import">
        <DialogPanel aria-label="Import" padding="none">
          <DialogActions layout="stack" spacing="none">
            <button type="button">Apply</button>
          </DialogActions>
        </DialogPanel>
      </DialogRoot>,
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog.className).toContain("p-0");
    expect(dialog.className).not.toContain("sm:p-6");
    const actions = dialog.querySelector("[data-dialog-actions]");
    expect(actions?.className).toContain("flex-col-reverse sm:flex-row");
    expect(actions?.className).not.toContain("mt-6");
  });

  it.each(["center", "mobile-sheet"] as const)(
    "bounds default panels to the padded %s root on short viewports",
    async (placement) => {
      render(
        <DialogRoot onDismiss={() => {}} backdropLabel="Close long dialog" placement={placement}>
          <DialogPanel aria-label="Long dialog" className="p-4">
            <div style={{ height: 1200 }}>Long content</div>
            <button type="button">Bottom action</button>
          </DialogPanel>
        </DialogRoot>,
      );
      const panel = await screen.findByRole("dialog");
      const root = panel.closest("[data-dialog-root]");
      expect(root?.classList.contains("fixed")).toBe(true);
      expect(root?.classList.contains("inset-0")).toBe(true);
      expect(root?.classList.contains("flex")).toBe(true);
      expect(panel.classList.contains("min-h-0")).toBe(true);
      expect(panel.classList.contains("[:where(&)]:max-h-full")).toBe(true);
      expect(panel.classList.contains("[:where(&)]:overflow-y-auto")).toBe(true);
      if (placement === "mobile-sheet") {
        expect(root?.classList.contains("pt-3")).toBe(true);
        expect(root?.classList.contains("pb-[max(0.75rem,env(safe-area-inset-bottom))]")).toBe(true);
        expect(root?.classList.contains("sm:p-6")).toBe(true);
      } else {
        expect(root?.classList.contains("p-4")).toBe(true);
      }
    },
  );

  it("preserves consumer height and contained scrolling classes", async () => {
    render(
      <DialogRoot onDismiss={() => {}} backdropLabel="Close contained dialog">
        <DialogPanel aria-label="Contained dialog" className="flex max-h-80 flex-col overflow-hidden">
          <header>Title</header>
          <div className="min-h-0 overflow-y-auto">Scrollable content</div>
          <footer>Actions</footer>
        </DialogPanel>
      </DialogRoot>,
    );
    const panel = await screen.findByRole("dialog");
    expect(panel.classList.contains("max-h-80")).toBe(true);
    expect(panel.classList.contains("overflow-hidden")).toBe(true);
    expect(panel.classList.contains("[:where(&)]:max-h-full")).toBe(true);
    expect(panel.classList.contains("[:where(&)]:overflow-y-auto")).toBe(true);
  });

  it.each(["Escape", "Tab"])("ignores %s already handled by a child control", async (key) => {
    const dismiss = vi.fn();
    render(
      <DialogRoot onDismiss={dismiss} backdropLabel="Close handled dialog">
        <DialogPanel aria-label="Handled dialog">
          <input aria-label="Handles keys" data-dialog-initial-focus onKeyDown={(event) => event.preventDefault()} />
          <button type="button">Other action</button>
        </DialogPanel>
      </DialogRoot>,
    );
    const input = screen.getByRole("textbox", { name: "Handles keys" });
    await waitFor(() => expect(document.activeElement).toBe(input));
    fireEvent.keyDown(input, { key, shiftKey: true });
    expect(dismiss).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
  });

  it.each([false, true])(
    "keeps keyboard handling in the upper dialog and restores the parent (dismissDisabled=%s)",
    async (dismissDisabled) => {
      function NestedHarness() {
        const [parentOpen, setParentOpen] = useState(false);
        const [childOpen, setChildOpen] = useState(false);
        return (
          <>
            <button type="button" onClick={() => setParentOpen(true)}>
              Open parent
            </button>
            {parentOpen ? (
              <DialogRoot onDismiss={() => setParentOpen(false)} backdropLabel="Close parent">
                <DialogPanel aria-label="Parent dialog">
                  <input aria-label="Parent input" data-dialog-initial-focus />
                  <button type="button" onClick={() => setChildOpen(true)}>
                    Open child
                  </button>
                  {childOpen ? (
                    <DialogRoot
                      onDismiss={() => setChildOpen(false)}
                      dismissDisabled={dismissDisabled}
                      backdropLabel="Close child"
                    >
                      <DialogPanel aria-label="Child dialog">
                        <input aria-label="Child input" data-dialog-initial-focus />
                        <button type="button" onClick={() => setChildOpen(false)}>
                          Finish child
                        </button>
                      </DialogPanel>
                    </DialogRoot>
                  ) : null}
                </DialogPanel>
              </DialogRoot>
            ) : null}
          </>
        );
      }

      document.body.style.overflow = "scroll";
      const { container } = render(<NestedHarness />);
      const trigger = screen.getByRole("button", { name: "Open parent" });
      trigger.focus();
      fireEvent.click(trigger);
      const parent = await screen.findByRole("dialog", { name: "Parent dialog" });
      const parentRoot = parent.closest<HTMLElement>("[data-dialog-root]");
      const parentInput = screen.getByRole("textbox", { name: "Parent input" });
      fireEvent.change(parentInput, { target: { value: "Unsaved parent input" } });
      parentInput.focus();
      fireEvent.click(screen.getByRole("button", { name: "Open child" }));
      const child = await screen.findByRole("dialog", { name: "Child dialog" });
      const childInput = screen.getByRole("textbox", { name: "Child input" });
      const finish = screen.getByRole("button", { name: "Finish child" });
      expect(document.activeElement).toBe(childInput);
      expect(parentRoot?.inert).toBe(true);
      expect(child.closest<HTMLElement>("[data-dialog-root]")?.inert).toBe(false);
      expect(container.inert).toBe(true);
      expect(document.body.style.overflow).toBe("hidden");

      const parentFocus = vi.fn();
      parentInput.addEventListener("focus", parentFocus);
      fireEvent.keyDown(childInput, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(finish);
      fireEvent.keyDown(finish, { key: "Tab" });
      expect(document.activeElement).toBe(childInput);
      expect(parentFocus).not.toHaveBeenCalled();
      parentInput.removeEventListener("focus", parentFocus);
      fireEvent.keyDown(childInput, { key: "Escape" });
      if (dismissDisabled) {
        expect(screen.getByRole("dialog", { name: "Child dialog" })).toBe(child);
        expect(parent.isConnected).toBe(true);
        fireEvent.click(finish);
      }

      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Child dialog" })).toBeNull());
      expect(screen.getByRole("dialog", { name: "Parent dialog" })).toBe(parent);
      expect(parentRoot?.inert).toBe(false);
      expect(container.inert).toBe(true);
      expect(document.body.style.overflow).toBe("hidden");
      expect((parentInput as HTMLInputElement).value).toBe("Unsaved parent input");
      expect(document.activeElement).toBe(parentInput);
      fireEvent.keyDown(parentInput, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open child" }));
      fireEvent.keyDown(screen.getByRole("button", { name: "Open child" }), { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(container.inert).toBe(false);
      expect(document.body.style.overflow).toBe("scroll");
      expect(document.activeElement).toBe(trigger);
    },
  );

  it("retains page locks when an earlier modal closes before a later one", () => {
    function Layers({ first, second }: { first: boolean; second: boolean }) {
      return (
        <>
          <button type="button">Page action</button>
          {first ? (
            <DialogRoot onDismiss={() => {}} backdropLabel="Close first">
              <DialogPanel aria-label="First">
                <button type="button">First action</button>
              </DialogPanel>
            </DialogRoot>
          ) : null}
          {second ? (
            <DialogRoot onDismiss={() => {}} backdropLabel="Close second">
              <DialogPanel aria-label="Second">
                <button type="button">Second action</button>
              </DialogPanel>
            </DialogRoot>
          ) : null}
        </>
      );
    }
    document.body.style.overflow = "scroll";
    const view = render(<Layers first second={false} />);
    view.rerender(<Layers first second />);
    view.rerender(<Layers first={false} second />);
    expect.soft(document.body.style.overflow).toBe("hidden");
    expect.soft(view.container.inert).toBe(true);
    view.rerender(<Layers first={false} second={false} />);
    expect.soft(document.body.style.overflow).toBe("scroll");
    expect.soft(view.container.inert).toBe(false);
  });

  it.each([false, true])("uses a visible return-focus fallback only when the trigger hides (%s)", (hidden) => {
    const origin = createRef<HTMLButtonElement>();
    const fallback = createRef<HTMLButtonElement>();
    function ReturnFocus({ open, hide }: { open: boolean; hide: boolean }) {
      return (
        <>
          <div style={{ display: hide ? "none" : "block" }}>
            <button ref={origin} type="button">
              Original trigger
            </button>
          </div>
          <button ref={fallback} type="button">
            Visible fallback
          </button>
          {open ? (
            <DialogRoot
              onDismiss={() => {}}
              backdropLabel="Close responsive dialog"
              returnFocusFallback={() => fallback.current}
            >
              <DialogPanel aria-label="Responsive dialog">
                <button type="button">Dialog action</button>
              </DialogPanel>
            </DialogRoot>
          ) : null}
        </>
      );
    }
    const view = render(<ReturnFocus open={false} hide={false} />);
    origin.current?.focus();
    view.rerender(<ReturnFocus open hide={false} />);
    view.rerender(<ReturnFocus open hide={hidden} />);
    view.rerender(<ReturnFocus open={false} hide={hidden} />);
    expect(document.activeElement).toBe(hidden ? fallback.current : origin.current);
    expect(view.container.inert).toBe(false);
  });

  it("traps focus, inerts the page, locks scrolling, and restores the trigger", async () => {
    const { container } = render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Open dialog" });
    trigger.focus();
    fireEvent.click(trigger);

    const first = screen.getByRole("button", { name: "First action" });
    const last = screen.getByRole("button", { name: "Last action" });
    await waitFor(() => expect(document.activeElement).toBe(first));
    expect(container.inert).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(container.inert).toBe(false);
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(trigger);
  });

  it("blocks Escape and backdrop dismissal while disabled", async () => {
    render(<DialogHarness dismissDisabled />);
    fireEvent.click(screen.getByRole("button", { name: "Open dialog" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog")).not.toBeNull();
    const backdrop = screen.getByRole("button", { name: "Close test dialog", hidden: true });
    expect((backdrop as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(backdrop);
    expect(screen.getByRole("dialog")).not.toBeNull();
  });

  it("supports a form panel and mobile-sheet placement", async () => {
    const submit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <DialogRoot onDismiss={() => {}} backdropLabel="Close form" placement="mobile-sheet">
        <DialogPanel as="form" aria-label="Profile" onSubmit={submit} className="max-h-80 overflow-y-auto">
          <button type="submit" data-dialog-initial-focus>
            Save
          </button>
        </DialogPanel>
      </DialogRoot>,
    );
    const dialog = await screen.findByRole("dialog", { name: "Profile" });
    fireEvent.submit(dialog);
    expect(submit).toHaveBeenCalledOnce();
    const root = document.querySelector("[data-dialog-root]");
    expect(root?.className).toContain("items-end");
    expect(root?.className).toContain("pb-[max(0.75rem,env(safe-area-inset-bottom))]");
    expect(dialog.className).toContain("overflow-y-auto");
  });

  it("restores page state when the dialog unmounts immediately", async () => {
    const { unmount } = render(
      <DialogRoot onDismiss={() => {}} backdropLabel="Close dialog">
        <DialogPanel aria-label="Transient dialog" />
      </DialogRoot>,
    );
    await screen.findByRole("dialog");
    unmount();
    expect(document.body.style.overflow).toBe("");
    expect(Array.from(document.body.children).every((element) => !(element as HTMLElement).inert)).toBe(true);
  });
});
