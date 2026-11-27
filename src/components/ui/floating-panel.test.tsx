/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef, useLayoutEffect, useState, type RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FloatingPanel, tabStops, type FloatingPanelProps } from "./floating-panel";

let observers: Array<{
  callback: ResizeObserverCallback;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}>;

beforeEach(() => {
  observers = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor(public callback: ResizeObserverCallback) {
        observers.push(this);
      }
    },
  );
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    return this.hidden || this.style.display === "none" ? [] : ([{} as DOMRect] as unknown as DOMRectList);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

type FixtureProps = Partial<Omit<FloatingPanelProps, "anchorRef">> & {
  anchorRef: RefObject<HTMLButtonElement | null>;
  show?: boolean;
  onParentPointerDown?: () => void;
};

function Fixture({ anchorRef, show = true, onDismiss, onParentPointerDown, children, ...props }: FixtureProps) {
  const [open, setOpen] = useState(true);
  useLayoutEffect(() => {
    anchorRef.current?.focus();
  }, [anchorRef]);
  return (
    <div onPointerDown={onParentPointerDown} data-testid="clipper">
      <button type="button">Before trigger</button>
      <button type="button" ref={anchorRef} data-testid="anchor" onClick={() => setOpen((value) => !value)}>
        Trigger
      </button>
      {show && open && (
        <FloatingPanel
          anchorRef={anchorRef}
          onDismiss={() => {
            onDismiss?.();
            setOpen(false);
          }}
          data-testid="panel"
          role="dialog"
          aria-label="Options"
          {...props}
        >
          {children ?? (
            <>
              <button type="button">First option</button>
              <button type="button">Last option</button>
            </>
          )}
        </FloatingPanel>
      )}
      <button type="button">After trigger</button>
    </div>
  );
}

function setup(props: Partial<FixtureProps> = {}) {
  const anchorRef = createRef<HTMLButtonElement>();
  const onDismiss = vi.fn();
  let currentProps = { anchorRef, onDismiss, ...props };
  const view = render(<Fixture {...currentProps} />);
  return {
    ...view,
    anchor: screen.getByTestId("anchor"),
    panel: screen.queryByTestId("panel")!,
    onDismiss,
    update(next: Partial<FixtureProps>) {
      currentProps = { ...currentProps, ...next };
      view.rerender(<Fixture {...currentProps} />);
    },
  };
}

describe("tabStops", () => {
  it("includes native summaries without tabindex attributes in keyboard order", () => {
    const { container } = render(
      <div>
        <button type="button">First native stop</button>
        <details>
          <summary>Course details</summary>
        </details>
        <button type="button">Second priority</button>
        <button type="button">First priority</button>
        <button type="button" tabIndex={-1}>
          Programmatic only
        </button>
      </div>,
    );
    screen.getByText("Second priority").tabIndex = 2;
    screen.getByText("First priority").tabIndex = 1;
    const summary = screen.getByText("Course details");
    // HappyDOM reports -1 for native summaries; browsers report 0.
    vi.spyOn(summary, "tabIndex", "get").mockReturnValue(0);
    expect(summary.hasAttribute("tabindex")).toBe(false);
    expect(tabStops(container)).toEqual([
      screen.getByText("First priority"),
      screen.getByText("Second priority"),
      screen.getByText("First native stop"),
      summary,
    ]);
  });

  it("excludes hidden, aria-hidden, inert, disabled, and closed-details descendants", () => {
    const { container } = render(
      <div>
        <button type="button">Visible stop</button>
        <div hidden>
          <button type="button">Hidden stop</button>
        </div>
        <div aria-hidden="true">
          <button type="button">Aria-hidden stop</button>
        </div>
        <div inert>
          <button type="button">Inert stop</button>
        </div>
        <button type="button" disabled>
          Disabled stop
        </button>
        <details>
          <summary tabIndex={-1}>Closed details</summary>
          <button type="button">Closed content</button>
        </details>
      </div>,
    );
    const closedContent = screen.getByText("Closed content");
    // HappyDOM has no layout; closed details content has no browser client rects.
    const details = container.querySelector("details")!;
    Object.defineProperty(closedContent, "getClientRects", {
      value: () => (details.open ? ([{} as DOMRect] as DOMRect[]) : []),
    });
    expect(tabStops(container)).toEqual([screen.getByText("Visible stop")]);
    details.open = true;
    expect(tabStops(container)).toEqual([screen.getByText("Visible stop"), closedContent]);
  });
});

describe("FloatingPanel lifecycle", () => {
  it("keeps layout-less consumer fixtures open when no browser layout is available", () => {
    const { panel, onDismiss } = setup();
    expect(panel).not.toBeNull();
    expect(panel.hasAttribute("data-floating-panel")).toBe(true);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it.each(["display", "inert"])("dismisses explicitly hidden ancestors via %s", async (kind) => {
    const { onDismiss } = setup();
    const clipper = screen.getByTestId("clipper");
    if (kind === "display") clipper.style.display = "none";
    else clipper.inert = true;
    await waitFor(() => expect(onDismiss).toHaveBeenCalledOnce());
  });

  it("portals outside clipping ancestors and forwards native props and object refs", () => {
    const ref = createRef<HTMLDivElement>();
    const { panel, container } = setup({ ref, id: "options", "aria-describedby": "help" });
    expect(panel.parentElement).toBe(document.body);
    expect(container.contains(panel)).toBe(false);
    expect(panel.id).toBe("options");
    expect(panel.getAttribute("aria-describedby")).toBe("help");
    expect(ref.current).toBe(panel);
    expect(screen.getByRole("dialog", { name: "Options" })).toBe(panel);
  });

  it("dismisses with Escape after a focused control disables itself", () => {
    const { anchor, onDismiss } = setup();
    const option = screen.getByRole("button", { name: "Last option" }) as HTMLButtonElement;
    option.focus();
    option.blur();
    option.disabled = true;
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(anchor);
  });

  it("dismisses when the anchor is removed without a scroll event", async () => {
    const { anchor, onDismiss } = setup();
    anchor.remove();
    await waitFor(() => expect(onDismiss).toHaveBeenCalledOnce());
    expect(screen.queryByTestId("panel")).toBeNull();
  });
});

describe("FloatingPanel interaction", () => {
  it("lets a pointer toggle close the panel without focus dismissal reopening it", () => {
    const { anchor, panel, onDismiss } = setup();
    expect(document.activeElement).toBe(panel);
    fireEvent.pointerDown(anchor);
    act(() => {
      anchor.focus();
    });
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.click(anchor);
    expect(screen.queryByTestId("panel")).toBeNull();
    expect(document.activeElement).toBe(anchor);
  });

  it("handles Escape before earlier document listeners can dismiss the underlying shell", () => {
    const shellDismiss = vi.fn();
    function shellKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) shellDismiss();
    }
    document.addEventListener("keydown", shellKeyDown);
    const { anchor, panel, onDismiss } = setup();
    fireEvent.keyDown(panel, { key: "Escape" });
    expect(shellDismiss).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(anchor);
    document.removeEventListener("keydown", shellKeyDown);
  });

  it("focuses the panel on open, ignores inside and trigger pointers, and dismisses outside without restoring focus", () => {
    const { panel, anchor, onDismiss } = setup();
    expect(panel.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(panel);
    fireEvent.pointerDown(screen.getByText("First option"));
    fireEvent.pointerDown(anchor);
    expect(onDismiss).not.toHaveBeenCalled();
    const focus = vi.spyOn(anchor, "focus");
    fireEvent.pointerDown(screen.getByText("After trigger"));
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(focus).not.toHaveBeenCalled();
    expect(screen.queryByTestId("panel")).toBeNull();
  });

  it("restores trigger focus on Escape from a panel child", () => {
    const { anchor, onDismiss } = setup();
    screen.getByText("First option").focus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(anchor);
    expect(screen.queryByTestId("panel")).toBeNull();
  });

  it("restores trigger focus on programmatic unmount only while focus remains inside", () => {
    const { anchor, update } = setup();
    screen.getByText("Last option").focus();
    update({ show: false });
    expect(document.activeElement).toBe(anchor);
  });

  it("keeps focus outside when focus leaves and dismisses", () => {
    const { onDismiss } = setup();
    const outside = screen.getByText("After trigger");
    act(() => {
      outside.focus();
    });
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(outside);
  });

  it("Tabs from the last option to the next control after the trigger, skipping disabled and hidden controls", () => {
    const { onDismiss } = setup();
    const anchor = screen.getByTestId("anchor");
    const hidden = document.createElement("button");
    hidden.hidden = true;
    anchor.after(hidden);
    const disabled = document.createElement("button");
    disabled.disabled = true;
    anchor.after(disabled);
    screen.getByText("Last option").focus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByText("After trigger"));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("returns from a final popup item to the first control in its modal", () => {
    const { anchor, onDismiss } = setup();
    const modal = anchor.parentElement;
    modal?.setAttribute("aria-modal", "true");
    screen.getByText("After trigger").hidden = true;
    screen.getByText("Last option").focus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByText("Before trigger"));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it.each(["panel", "First option"])("Shift-Tabs from %s to the trigger", (from) => {
    const { panel, anchor, onDismiss } = setup();
    (from === "panel" ? panel : screen.getByText(from)).focus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(anchor);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("leaves interior Tab navigation native and supports panels without controls", () => {
    const { panel, onDismiss, update } = setup();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    fireEvent(panel, tab);
    expect(tab.defaultPrevented).toBe(false);
    expect(onDismiss).not.toHaveBeenCalled();
    update({ children: <p>No options</p> });
    fireEvent.keyDown(panel, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByText("After trigger"));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("keeps autocomplete focus on its anchor and still dismisses Escape and external pointers", () => {
    const { anchor, onDismiss } = setup({ focusOnOpen: false });
    expect(document.activeElement).toBe(anchor);
    fireEvent.keyDown(anchor, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(anchor);
    cleanup();
    const second = setup({ focusOnOpen: false });
    fireEvent.pointerDown(document.body);
    expect(second.onDismiss).toHaveBeenCalledOnce();
  });

  it("uses the latest dismiss callback without resubscribing or stealing focus on content updates", () => {
    const { update } = setup();
    const last = screen.getByText("Last option");
    last.focus();
    const add = vi.spyOn(document, "addEventListener");
    const latest = vi.fn();
    update({
      onDismiss: latest,
      children: (
        <>
          <button type="button">First option</button>
          <button type="button">Updated option</button>
        </>
      ),
    });
    expect(document.activeElement).toBe(last);
    expect(add).not.toHaveBeenCalled();
    expect(observers).toHaveLength(1);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(latest).toHaveBeenCalledOnce();
  });

  it("disconnects observers and removes document, window, and visual viewport listeners on unmount", () => {
    const viewport = Object.assign(new EventTarget(), { width: 800, height: 600, offsetLeft: 0, offsetTop: 0 });
    vi.stubGlobal("visualViewport", viewport);
    const documentAdd = vi.spyOn(document, "addEventListener");
    const documentRemove = vi.spyOn(document, "removeEventListener");
    const windowAdd = vi.spyOn(window, "addEventListener");
    const windowRemove = vi.spyOn(window, "removeEventListener");
    const viewportAdd = vi.spyOn(viewport, "addEventListener");
    const viewportRemove = vi.spyOn(viewport, "removeEventListener");
    const mutationDisconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    const refCleanup = vi.fn();
    const ref = vi.fn(() => refCleanup);
    const { update, onDismiss } = setup({ ref });
    update({ show: false });
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    expect(mutationDisconnect).toHaveBeenCalled();
    expect(refCleanup).toHaveBeenCalledOnce();
    for (const [name, listener, options] of documentAdd.mock.calls.filter(([name]) =>
      ["pointerdown", "focusin", "keydown"].includes(name),
    )) {
      expect(documentRemove).toHaveBeenCalledWith(name, listener, ...(options === undefined ? [] : [options]));
    }
    for (const [name, listener] of windowAdd.mock.calls.filter(([name]) => ["resize", "scroll"].includes(name))) {
      expect(windowRemove).toHaveBeenCalledWith(name, listener, ...(name === "scroll" ? [true] : []));
    }
    for (const [name, listener] of viewportAdd.mock.calls) expect(viewportRemove).toHaveBeenCalledWith(name, listener);
    fireEvent.pointerDown(document.body);
    fireEvent.keyDown(document.body, { key: "Escape" });
    fireEvent.scroll(window);
    expect(onDismiss).not.toHaveBeenCalled();
  });
});
