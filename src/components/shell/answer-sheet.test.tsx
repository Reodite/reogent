// @vitest-environment happy-dom
import { DialogPanel, DialogRoot } from "@/src/components/ui/dialog";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AnswerSheet, shouldDismissAnswerSheet } from "./answer-sheet";

afterEach(cleanup);

function SheetHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open canvas
      </button>
      <AnswerSheet open={open} onClose={() => setOpen(false)} view={{ paneId: "map", state: {} }}>
        <button type="button">First action</button>
        <button type="button">Last action</button>
      </AnswerSheet>
    </>
  );
}

function UpdatingSheetHarness() {
  const [open, setOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open updating canvas
      </button>
      <AnswerSheet open={open} onClose={() => setOpen(false)} view={{ paneId: "calendar", state: {} }}>
        <button type="button">First canvas action</button>
        <button type="button" onClick={() => setRevision((value) => value + 1)}>
          Update canvas {revision}
        </button>
      </AnswerSheet>
    </>
  );
}

function NestedDialogHarness() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setSheetOpen(true)}>
        Open nested canvas
      </button>
      <AnswerSheet open={sheetOpen} onClose={() => setSheetOpen(false)} view={{ paneId: "calendar", state: {} }}>
        <button type="button" onClick={() => setDialogOpen(true)}>
          Open event details
        </button>
        {dialogOpen ? (
          <DialogRoot onDismiss={() => setDialogOpen(false)} backdropLabel="Close event details">
            <DialogPanel aria-label="Event details">
              <button type="button" data-dialog-initial-focus>
                Event action
              </button>
            </DialogPanel>
          </DialogRoot>
        ) : null}
      </AnswerSheet>
    </>
  );
}

describe("AnswerSheet", () => {
  it("keeps active canvases inline from the small breakpoint upward", () => {
    const { container } = render(
      <AnswerSheet open={false} onClose={() => {}} view={{ paneId: "map", state: {} }}>
        <span>Map</span>
      </AnswerSheet>,
    );
    const sheet = container.querySelector("[data-answer-sheet]");
    const scrim = container.querySelector("[data-answer-scrim]");
    expect(sheet?.className).toContain("sm:grow");
    expect(sheet?.className).toContain("sm:min-w-72");
    expect(scrim?.className).toContain("sm:hidden");
  });

  it("uses the documented distance and velocity dismissal thresholds", () => {
    expect(shouldDismissAnswerSheet(99, 100, 500)).toBe(false);
    expect(shouldDismissAnswerSheet(100, 100, 500)).toBe(true);
    expect(shouldDismissAnswerSheet(10, 699, 500)).toBe(false);
    expect(shouldDismissAnswerSheet(10, 700, 500)).toBe(true);
  });

  it("traps focus, closes on Escape, and restores the trigger", async () => {
    render(<SheetHarness />);
    const trigger = screen.getByRole("button", { name: "Open canvas" });
    trigger.focus();
    fireEvent.click(trigger);

    const first = screen.getByRole("button", { name: "First action" });
    const last = screen.getByRole("button", { name: "Last action" });
    await waitFor(() => expect(document.activeElement).toBe(first));
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Answer canvas" })).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("");
  });

  it("keeps focus in place when canvas state rerenders with a new close callback", async () => {
    render(<UpdatingSheetHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open updating canvas" }));
    const update = await screen.findByRole("button", { name: "Update canvas 0" });
    update.focus();
    fireEvent.click(update);

    const updated = await screen.findByRole("button", { name: "Update canvas 1" });
    expect(document.activeElement).toBe(updated);
  });

  it("lets a nested dialog handle Escape without dismissing the sheet", async () => {
    render(<NestedDialogHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open nested canvas" }));
    fireEvent.click(await screen.findByRole("button", { name: "Open event details" }));
    const action = await screen.findByRole("button", { name: "Event action" });
    await waitFor(() => expect(document.activeElement).toBe(action));

    fireEvent.keyDown(action, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Event details" })).toBeNull());
    expect(screen.getByRole("dialog", { name: "Answer canvas" })).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open event details" }));
  });

  it("dismisses from the handle after crossing twenty percent of its height", async () => {
    render(<SheetHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open canvas" }));
    const sheet = await screen.findByRole("dialog", { name: "Answer canvas" });
    Object.defineProperty(sheet, "offsetHeight", { configurable: true, value: 500 });
    const handle = sheet.querySelector<HTMLElement>("[data-answer-drag-handle]");
    if (!handle) throw new Error("Missing answer sheet drag handle");

    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 20 });
    fireEvent.pointerMove(handle, { pointerId: 1, clientY: 140 });
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 140 });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Answer canvas" })).toBeNull());
  });
});
