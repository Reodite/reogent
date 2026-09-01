// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DialogPanel, DialogRoot } from "./dialog";

afterEach(() => {
  cleanup();
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

describe("Dialog", () => {
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
    expect(document.querySelector("[data-dialog-root]")?.className).toContain("items-end");
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
