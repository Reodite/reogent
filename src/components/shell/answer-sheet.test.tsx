// @vitest-environment happy-dom
import { CourseSearchField } from "@/src/components/course-search/course-search";
import { DialogPanel, DialogRoot } from "@/src/components/ui/dialog";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnswerSheet } from "./answer-sheet";

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{} as DOMRect] as unknown as DOMRectList);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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
  it("deactivates collapsed exit content while leaving inline content available", () => {
    const content = (collapsed: boolean) => (
      <AnswerSheet open={false} collapsed={collapsed} onClose={() => {}} view={{ paneId: "map", state: {} }}>
        <button type="button">Canvas action</button>
      </AnswerSheet>
    );
    const { container, rerender } = render(content(true));
    const sheet = container.querySelector<HTMLElement>("[data-answer-sheet]")!;
    expect(sheet.hasAttribute("inert")).toBe(true);
    expect(sheet.getAttribute("aria-hidden")).toBe("true");
    rerender(content(false));
    expect(sheet.hasAttribute("inert")).toBe(false);
    expect(sheet.hasAttribute("aria-hidden")).toBe(false);
  });

  it("resizes the inline panes with keyboard input", () => {
    render(
      <AnswerSheet open={false} onClose={() => {}} view={{ paneId: "map", state: {} }}>
        <span>Map</span>
      </AnswerSheet>,
    );
    const initial = screen
      .getByRole("separator", { name: "Resize chat and answer canvas" })
      .getAttribute("aria-valuenow");
    const splitter = screen.getByRole("separator", { name: "Resize chat and answer canvas" });

    fireEvent.keyDown(splitter, { key: "ArrowLeft" });
    expect(splitter.getAttribute("aria-valuenow")).not.toBe(initial);

    fireEvent.keyDown(splitter, { key: "Home" });
    expect(splitter.getAttribute("aria-valuenow")).toBe(splitter.getAttribute("aria-valuemin"));
    fireEvent.keyDown(splitter, { key: "End" });
    expect(splitter.getAttribute("aria-valuenow")).toBe(splitter.getAttribute("aria-valuemax"));
  });

  it("traps focus, closes on Escape, and restores the trigger", async () => {
    render(<SheetHarness />);
    const trigger = screen.getByRole("button", { name: "Open canvas" });
    trigger.focus();
    fireEvent.click(trigger);

    const first = screen.getByRole("button", { name: "First action" });
    const last = screen.getByRole("button", { name: "Last action" });
    await waitFor(() => expect(document.activeElement).toBe(first));

    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Answer canvas" })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("opens visibility before focus and wraps only available tab stops", async () => {
    render(
      <AnswerSheet open onClose={() => {}} view={{ paneId: "map", state: {} }}>
        <div hidden>
          <button type="button">Hidden action</button>
        </div>
        <div inert>
          <button type="button">Inert action</button>
        </div>
        <div aria-hidden="true">
          <button type="button">Unannounced action</button>
        </div>
        <div style={{ display: "none" }}>
          <button type="button">Unrendered action</button>
        </div>
        <button type="button">First available action</button>
        <button type="button">Last available action</button>
        <button type="button" disabled>
          Disabled action
        </button>
        <button type="button" style={{ visibility: "hidden" }}>
          Invisible action
        </button>
      </AnswerSheet>,
    );
    screen.getByRole("dialog", { name: "Answer canvas" });
    const first = screen.getByRole("button", { name: "First available action" });
    const last = screen.getByRole("button", { name: "Last available action" });
    await waitFor(() => expect(document.activeElement).toBe(first));
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });

  it("focuses the sheet when pending content has no available controls", async () => {
    render(
      <AnswerSheet open onClose={() => {}} view={{ paneId: "map", state: {} }}>
        <div hidden>
          <button type="button">Pending action</button>
        </div>
      </AnswerSheet>,
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "Answer canvas" })));
  });

  it("does not restore a trigger hidden during the handoff", async () => {
    render(<SheetHarness />);
    const trigger = screen.getByRole("button", { name: "Open canvas" });
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "First action" })));
    trigger.style.display = "none";
    const focus = vi.spyOn(trigger, "focus");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(focus).not.toHaveBeenCalled();
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

  it("closes course suggestions on the first Escape and the answer canvas on the second", async () => {
    const close = vi.fn();
    function CourseSheetHarness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open course canvas
          </button>
          <AnswerSheet
            open={open}
            collapsed={!open}
            onClose={() => {
              close();
              setOpen(false);
            }}
            view={{ paneId: "prereq", state: {} }}
          >
            <CourseSearchField
              value="CPSC"
              onChange={() => {}}
              status="idle"
              list={{
                candidates: [{ code: "CPSC 110", subject: "CPSC", number: "110", title: "Computation" }],
                total: 1,
              }}
              error={null}
              rejected={false}
              presentation="overlay"
              openOnInitialValue={false}
            />
          </AnswerSheet>
        </>
      );
    }
    render(<CourseSheetHarness />);
    const trigger = screen.getByRole("button", { name: "Open course canvas" });
    trigger.focus();
    fireEvent.click(trigger);
    const input = screen.getByRole("combobox");
    await waitFor(() => expect(input.getAttribute("aria-expanded")).toBe("true"));
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(input);
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Answer canvas" })).not.toBeNull();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Answer canvas" })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});
