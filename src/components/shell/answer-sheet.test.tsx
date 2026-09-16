// @vitest-environment happy-dom
import { CourseSearchField } from "@/src/components/course-search/course-search";
import { DialogPanel, DialogRoot } from "@/src/components/ui/dialog";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AnswerSheet, shouldDismissAnswerSheet } from "./answer-sheet";

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
    new DOMRect(0, 0, 44, 44),
  ] as unknown as DOMRectList);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockHorizontalLayout(element: Element, left: number, width: number) {
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
    bottom: 600,
    height: 600,
    left,
    right: left + width,
    top: 0,
    width,
    x: left,
    y: 0,
    toJSON: () => ({}),
  });
}

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
    const sheet = container.querySelector<HTMLElement>("[data-answer-sheet]");
    const scrim = container.querySelector("[data-answer-scrim]");
    const splitter = screen.getByRole("separator", { name: "Resize chat and answer canvas" });
    expect(sheet?.className).toContain("sm:grow-0");
    expect(sheet?.className).toContain("sm:min-w-72");
    expect(sheet?.style.flexBasis).toBe("calc(50% - 0.375rem)");
    expect(splitter.parentElement?.className).toContain("sm:flex");
    expect(scrim?.className).toContain("sm:hidden");
  });

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
    expect(sheet.className).toContain("max-sm:transition-[translate,opacity,visibility]");
    rerender(content(false));
    expect(sheet.hasAttribute("inert")).toBe(false);
    expect(sheet.hasAttribute("aria-hidden")).toBe(false);
  });

  it("retains the sheet height and handle throughout closing", () => {
    const content = (open: boolean) => (
      <AnswerSheet open={open} collapsed={!open} onClose={() => {}} view={{ paneId: "map", state: {} }}>
        <button type="button">Canvas action</button>
      </AnswerSheet>
    );
    const { container, rerender } = render(content(true));
    const sheet = container.querySelector<HTMLElement>("[data-answer-sheet]")!;
    const handle = sheet.querySelector("[data-answer-drag-handle]");
    const height = "max-sm:h-[calc(var(--app-viewport-height,100dvh)*0.8)]";
    expect(sheet.classList.contains(height)).toBe(true);
    rerender(content(false));
    expect(sheet.classList.contains(height)).toBe(true);
    expect(sheet.querySelector("[data-answer-drag-handle]")).toBe(handle);
    expect(sheet.classList.contains("max-sm:translate-y-full")).toBe(true);
  });

  it("releases a retained drag handle's capture at logical close", async () => {
    render(<SheetHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open canvas" }));
    const sheet = await screen.findByRole("dialog", { name: "Answer canvas" });
    const handle = sheet.querySelector<HTMLElement>("[data-answer-drag-handle]")!;
    handle.setPointerCapture = vi.fn();
    handle.hasPointerCapture = vi.fn(() => true);
    handle.releasePointerCapture = vi.fn();
    fireEvent.pointerDown(handle, { pointerId: 9, clientY: 20 });
    fireEvent.keyDown(sheet, { key: "Escape" });
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(9);
  });

  it("resizes the inline panes with pointer and keyboard input", () => {
    const { container } = render(
      <AnswerSheet open={false} onClose={() => {}} view={{ paneId: "map", state: {} }}>
        <span>Map</span>
      </AnswerSheet>,
    );
    const sheet = container.querySelector<HTMLElement>("[data-answer-sheet]");
    if (!sheet?.parentElement) throw new Error("Missing answer sheet layout");
    mockHorizontalLayout(sheet.parentElement, 100, 1000);
    const splitter = screen.getByRole("separator", { name: "Resize chat and answer canvas" });

    fireEvent.pointerDown(splitter, { pointerId: 2, button: 0, clientX: 600 });
    fireEvent.pointerMove(splitter, { pointerId: 2, clientX: 750 });
    expect(splitter.getAttribute("aria-valuenow")).toBe("65");
    expect(sheet.style.flexBasis).toBe("calc(35% - 0.375rem)");
    fireEvent.pointerUp(splitter, { pointerId: 2, clientX: 750 });

    fireEvent.keyDown(splitter, { key: "ArrowLeft" });
    expect(splitter.getAttribute("aria-valuenow")).toBe("60");
    expect(sheet.style.flexBasis).toBe("calc(40% - 0.375rem)");

    fireEvent.keyDown(splitter, { key: "Home" });
    expect(splitter.getAttribute("aria-valuenow")).toBe(splitter.getAttribute("aria-valuemin"));
    fireEvent.keyDown(splitter, { key: "End" });
    expect(splitter.getAttribute("aria-valuenow")).toBe(splitter.getAttribute("aria-valuemax"));
  });

  it.each([
    { reserved: 284, minimum: 352, expected: 31.63 },
    { reserved: 60, minimum: 352, expected: 26.4 },
  ])(
    "excludes $reserved px of sidebar space from split bounds and pointer input",
    ({ reserved, minimum, expected }) => {
      const { container } = render(
        <AnswerSheet open={false} onClose={() => {}} view={{ paneId: "map", state: {} }}>
          <span>Map</span>
        </AnswerSheet>,
      );
      const sheet = container.querySelector<HTMLElement>("[data-answer-sheet]")!;
      const row = sheet.parentElement!;
      mockHorizontalLayout(row, 12, 1416);
      row.style.paddingLeft = `${reserved}px`;
      sheet.style.minWidth = `${minimum}px`;
      const splitter = screen.getByRole("separator", { name: "Resize chat and answer canvas" });

      fireEvent.keyDown(splitter, { key: "Home" });
      expect(Number(splitter.getAttribute("aria-valuemin"))).toBe(expected);
      expect(Number(splitter.getAttribute("aria-valuenow"))).toBe(expected);
      expect(((1416 - reserved) * expected) / 100 - 6).toBeGreaterThanOrEqual(minimum - 0.1);
      fireEvent.keyDown(splitter, { key: "End" });
      expect(Number(splitter.getAttribute("aria-valuenow"))).toBeCloseTo(100 - expected, 2);

      fireEvent.pointerDown(splitter, { pointerId: 8, button: 0, clientX: 12 + reserved + (1416 - reserved) / 2 });
      expect(splitter.getAttribute("aria-valuenow")).toBe("50");
      expect(sheet.style.flexBasis).toBe("calc(50% - 0.375rem)");
    },
  );

  it("restores the split position when pointer resizing is cancelled", () => {
    const { container } = render(
      <AnswerSheet open={false} onClose={() => {}} view={{ paneId: "map", state: {} }}>
        <span>Map</span>
      </AnswerSheet>,
    );
    const sheet = container.querySelector<HTMLElement>("[data-answer-sheet]");
    if (!sheet?.parentElement) throw new Error("Missing answer sheet layout");
    mockHorizontalLayout(sheet.parentElement, 100, 1000);
    const splitter = screen.getByRole("separator", { name: "Resize chat and answer canvas" });

    fireEvent.pointerDown(splitter, { pointerId: 3, button: 0, clientX: 600 });
    fireEvent.pointerMove(splitter, { pointerId: 3, clientX: 700 });
    expect(splitter.getAttribute("aria-valuenow")).toBe("60");
    fireEvent.pointerCancel(splitter, { pointerId: 3 });

    expect(splitter.getAttribute("aria-valuenow")).toBe("50");
    expect(sheet.style.flexBasis).toBe("calc(50% - 0.375rem)");
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
    const sheet = screen.getByRole("dialog", { name: "Answer canvas" });
    const first = screen.getByRole("button", { name: "First available action" });
    const last = screen.getByRole("button", { name: "Last available action" });
    expect(sheet.className).toContain("max-sm:transition-[translate,opacity]");
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
    expect(document.body.style.overflow).toBe("");
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
