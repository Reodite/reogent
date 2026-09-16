/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef, useLayoutEffect, useState, type RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FloatingPanel, tabStops, type FloatingPanelProps } from "./floating-panel";

let anchorBounds: DOMRect;
let naturalHeight: number;
let observers: Array<{
  callback: ResizeObserverCallback;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}>;

function constrainedSize(element: HTMLElement, property: "width" | "height", natural: number) {
  const available = Number.parseFloat(element.style.getPropertyValue(`--floating-available-${property}`));
  const cap = element.style[property === "width" ? "maxWidth" : "maxHeight"].match(/^min\(([\d.]+)px/);
  return Math.min(natural, Number.isFinite(available) ? available : Infinity, cap ? Number(cap[1]) : Infinity);
}

beforeEach(() => {
  anchorBounds = new DOMRect(100, 100, 120, 40);
  naturalHeight = 180;
  observers = [];
  vi.stubGlobal("innerWidth", 800);
  vi.stubGlobal("innerHeight", 600);
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
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.dataset.testid === "anchor") return anchorBounds;
    if (this.dataset.testid === "panel") {
      return new DOMRect(
        Number.parseFloat(this.style.left) || 0,
        Number.parseFloat(this.style.top) || 0,
        constrainedSize(this, "width", Number.parseFloat(this.style.width) || 288),
        constrainedSize(this, "height", naturalHeight),
      );
    }
    return new DOMRect(0, 0, 800, 600);
  });
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(function (this: HTMLElement) {
    return (this.hidden || this.style.display === "none"
      ? []
      : [this.getBoundingClientRect()]) as unknown as DOMRectList;
  });
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
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
    <div style={{ overflow: "hidden" }} onPointerDown={onParentPointerDown} data-testid="clipper">
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

function resize() {
  act(() => {
    for (const observer of observers) observer.callback([], observer as unknown as ResizeObserver);
  });
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
      value: () => (details.open ? [new DOMRect(0, 0, 100, 44)] : []),
    });
    expect(tabStops(container)).toEqual([screen.getByText("Visible stop")]);
    details.open = true;
    expect(tabStops(container)).toEqual([screen.getByText("Visible stop"), closedContent]);
  });
});

describe("FloatingPanel placement", () => {
  it("keeps layout-less consumer fixtures open when anchor bounds are zero", () => {
    anchorBounds = new DOMRect();
    const { panel, onDismiss } = setup();
    expect(panel).not.toBeNull();
    expect(panel.hasAttribute("data-floating-panel")).toBe(true);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it.each(["display", "inert"])("dismisses explicitly hidden ancestors via %s even with zero bounds", async (kind) => {
    anchorBounds = new DOMRect();
    const { onDismiss } = setup();
    const clipper = screen.getByTestId("clipper");
    if (kind === "display") clipper.style.display = "none";
    else clipper.inert = true;
    await waitFor(() => expect(onDismiss).toHaveBeenCalledOnce());
  });

  it("portals outside clipping ancestors and forwards native props and object refs", () => {
    const ref = createRef<HTMLDivElement>();
    const { panel, container } = setup({ ref, id: "options", className: "w-72 p-3" });
    expect(panel.parentElement).toBe(document.body);
    expect(container.contains(panel)).toBe(false);
    expect(panel.style.position).toBe("fixed");
    expect(panel.style.left).toBe("100px");
    expect(panel.style.top).toBe("148px");
    expect(panel.style.visibility).toBe("visible");
    expect(panel.style.overflow).toBe("auto");
    expect(panel.id).toBe("options");
    expect(panel.className).toContain("w-72 p-3");
    expect(ref.current).toBe(panel);
    expect(screen.getByRole("dialog", { name: "Options" })).toBe(panel);
  });

  it("aligns to the end and clamps both horizontal edges", () => {
    const { panel } = setup({ align: "end" });
    expect(panel.style.left).toBe("8px");
    anchorBounds = new DOMRect(720, 100, 70, 40);
    resize();
    expect(panel.style.left).toBe("502px");
    anchorBounds = new DOMRect(760, 100, 70, 40);
    resize();
    expect(panel.style.left).toBe("504px");
  });

  it("places scaled entrances using layout dimensions rather than animated bounds", () => {
    anchorBounds = new DOMRect(720, 500, 70, 40);
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
      if (this.dataset.testid === "anchor") return anchorBounds;
      if (this.dataset.testid === "panel") return new DOMRect(0, 0, 144, 90);
      return new DOMRect(0, 0, 800, 600);
    });
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(288);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(180);
    const { panel } = setup();
    expect(panel.style.left).toBe("504px");
    expect(panel.style.top).toBe("312px");
    expect(panel.dataset.overlaySide).toBe("top");
  });

  it("flips above only when below is too small and above has more room", () => {
    anchorBounds = new DOMRect(200, 500, 100, 40);
    const { panel } = setup();
    expect(panel.style.top).toBe("312px");
    expect(panel.style.getPropertyValue("--floating-available-height")).toBe("484px");
    anchorBounds = new DOMRect(200, 200, 100, 40);
    naturalHeight = 500;
    resize();
    expect(panel.style.top).toBe("248px");
    expect(panel.style.getPropertyValue("--floating-available-height")).toBe("344px");
  });

  it("bounds width and height on a small viewport while preserving an explicit height cap", () => {
    vi.stubGlobal("innerWidth", 250);
    vi.stubGlobal("innerHeight", 400);
    naturalHeight = 700;
    const { panel } = setup({ style: { maxHeight: 320 } });
    expect(panel.style.left).toBe("8px");
    expect(panel.getBoundingClientRect().width).toBe(234);
    expect(panel.getBoundingClientRect().height).toBe(244);
    expect(panel.style.maxHeight).toContain("min(320px,");
    vi.stubGlobal("innerHeight", 900);
    fireEvent(window, new Event("resize"));
    expect(panel.getBoundingClientRect().height).toBe(320);
  });

  it("preserves scrolling when measurement temporarily expands a short panel", () => {
    vi.stubGlobal("innerHeight", 450);
    anchorBounds = new DOMRect(100, 240, 120, 40);
    naturalHeight = 1000;
    const { panel } = setup({ style: { maxHeight: 320 } });
    const scrollTop = naturalHeight - panel.getBoundingClientRect().height;
    panel.scrollTop = scrollTop;
    const readBounds = vi.mocked(panel.getBoundingClientRect).getMockImplementation();
    if (!readBounds) throw new Error("Missing layout mock");
    vi.spyOn(panel, "getBoundingClientRect").mockImplementation(() => {
      const bounds = readBounds.call(panel);
      panel.scrollTop = Math.min(panel.scrollTop, naturalHeight - bounds.height);
      return bounds;
    });
    resize();
    expect(panel.scrollTop).toBe(scrollTop);
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

  it("matches anchor width and remeasures both anchor and content without refocusing", () => {
    const { panel } = setup({ matchAnchorWidth: true });
    expect(panel.style.width).toBe("120px");
    expect(observers[0].observe).toHaveBeenCalledWith(panel);
    expect(observers[0].observe).toHaveBeenCalledWith(screen.getByTestId("anchor"));
    screen.getByText("Last option").focus();
    anchorBounds = new DOMRect(300, 300, 200, 40);
    naturalHeight = 350;
    resize();
    expect(panel.style.width).toBe("200px");
    expect(panel.style.left).toBe("300px");
    expect(panel.style.top).toBe("8px");
    expect(document.activeElement).toBe(screen.getByText("Last option"));
  });

  it("responds to nested scrolling but ignores scrolling within the panel", () => {
    const { panel } = setup();
    anchorBounds = new DOMRect(200, 200, 120, 40);
    fireEvent.scroll(panel);
    expect(panel.style.left).toBe("100px");
    fireEvent.scroll(screen.getByText("First option"));
    expect(panel.style.left).toBe("100px");
    fireEvent.scroll(screen.getByTestId("clipper"));
    expect(panel.style.left).toBe("200px");
    expect(panel.style.top).toBe("248px");
  });

  it("uses visual viewport offsets and responds to its resize and scroll events", () => {
    const viewport = Object.assign(new EventTarget(), { width: 400, height: 300, offsetLeft: 50, offsetTop: 50 });
    vi.stubGlobal("visualViewport", viewport);
    const { panel } = setup();
    expect(panel.style.left).toBe("100px");
    viewport.width = 250;
    viewport.offsetLeft = 80;
    fireEvent(viewport, new Event("resize"));
    expect(panel.style.left).toBe("88px");
    expect(panel.getBoundingClientRect().width).toBe(234);
    viewport.offsetTop = 110;
    fireEvent(viewport, new Event("scroll"));
    expect(panel.style.top).toBe("148px");
  });

  it("dismisses when scrolling fully clips the anchor, but keeps partially visible anchors", () => {
    const { onDismiss } = setup();
    const clipper = screen.getByTestId("clipper");
    vi.spyOn(clipper, "clientHeight", "get").mockReturnValue(120);
    fireEvent.scroll(clipper);
    expect(onDismiss).not.toHaveBeenCalled();
    anchorBounds = new DOMRect(100, 121, 120, 40);
    fireEvent.scroll(clipper);
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("panel")).toBeNull();
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
