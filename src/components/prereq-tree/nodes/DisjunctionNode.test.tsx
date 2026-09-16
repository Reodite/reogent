// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const viewState = vi.hoisted(() => ({ transform: [0, 0, 1] as [number, number, number] }));

// ReactFlow's Handle needs a ReactFlowProvider store; stub it so the nodes
// render standalone. Position is a runtime enum; NodeProps is type-only.
vi.mock("reactflow", () => ({
  Handle: () => null,
  Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
  useStore: (selector: (state: typeof viewState) => unknown) => selector(viewState),
}));

afterEach(() => {
  cleanup();
  viewState.transform = [0, 0, 1];
  vi.restoreAllMocks();
});

const { DropdownDisjunctionNode, StackedDisjunctionNode } = await import("./DisjunctionNode");

const options = [
  { display: "MATH 100", isCode: true },
  { display: "MATH 102", isCode: true },
  { display: "MATH 104", isCode: true },
];

const detail = { kind: "course", code: "MATH 100", title: "Differential Calculus with Applications" } as const;

describe("DropdownDisjunctionNode (REQ-9.1)", () => {
  it("renders closed by default, opens on trigger click, closes on Escape", () => {
    render(<DropdownDisjunctionNode id="d1" data={{ options, selectedIdx: 0, onChange: vi.fn(), detail }} />);
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getAllByRole("option")).toHaveLength(3);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("uses neutral material and readable supporting text for choices", () => {
    const { container } = render(
      <DropdownDisjunctionNode id="neutral" data={{ options, selectedIdx: 0, onChange: vi.fn(), detail }} />,
    );
    expect(container.querySelector("section")?.classList.contains("bg-surface")).toBe(true);
    expect(screen.getByText("Differential Calculus with Applications").className).toContain("text-on-surface-variant");
  });

  it("shows the selected course's title as the detail row (dropdown absorption)", () => {
    render(<DropdownDisjunctionNode id="d1" data={{ options, selectedIdx: 0, onChange: vi.fn(), detail }} />);
    expect(screen.getByText("Differential Calculus with Applications")).toBeTruthy();
  });

  it("selects an option via click → fires onChange(index) and closes", () => {
    const onChange = vi.fn();
    render(<DropdownDisjunctionNode id="d1" data={{ options, selectedIdx: 0, onChange, detail }} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getAllByRole("option")[1]);
    expect(onChange).toHaveBeenCalledWith(1);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes when a pointerdown fires outside the menu", () => {
    render(<DropdownDisjunctionNode id="d1" data={{ options, selectedIdx: 0, onChange: vi.fn(), detail }} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("keeps wheel events inside the open menu and closes it when the canvas zoom changes (REQ-9.1)", async () => {
    viewState.transform = [0, 0, 1];
    const data = { options, selectedIdx: 0, onChange: vi.fn(), detail };
    const { rerender } = render(<DropdownDisjunctionNode id="z" data={data} />);
    fireEvent.click(screen.getByRole("button"));
    const menu = screen.getByRole("listbox");
    expect(menu.className).toContain("nowheel");
    expect(menu.className).not.toContain("ui-popover-enter");
    expect(menu.querySelector(".ui-popover-enter")).not.toBeNull();
    viewState.transform = [0, 0, 2];
    rerender(<DropdownDisjunctionNode id="z" data={data} />);
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  });

  it.each([0.5, 1, 2])("flips and clamps options at the graph edge at zoom %s", (zoom) => {
    viewState.transform = [0, 0, zoom];
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("react-flow")) return new DOMRect(0, 0, 320, 300);
      if (this.getAttribute("role") === "listbox") return new DOMRect(270, 260, 160 * zoom, 200 * zoom);
      return new DOMRect(270, 240, 60, 20);
    });
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(240);
    render(
      <div className="react-flow">
        <DropdownDisjunctionNode id="edge" data={{ options, selectedIdx: 0, onChange: vi.fn(), detail }} />
      </div>,
    );
    fireEvent.click(screen.getByRole("button"));
    const menu = screen.getByRole("listbox");
    expect(Number.parseFloat(menu.style.top)).toBeLessThan(0);
    expect(270 + Number.parseFloat(menu.style.left) * zoom).toBeGreaterThanOrEqual(8);
    expect(270 + Number.parseFloat(menu.style.left) * zoom + Math.min(160 * zoom, 304)).toBeLessThanOrEqual(312);
    expect(240 + Number.parseFloat(menu.style.top) * zoom).toBeGreaterThanOrEqual(8);
  });

  it("matches the closed dropdown snapshot (REQ-9.4)", () => {
    const { container } = render(
      <DropdownDisjunctionNode id="snap" data={{ options, selectedIdx: 0, onChange: vi.fn(), detail }} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});

describe("StackedDisjunctionNode (REQ-9.2)", () => {
  const stackedOptions = [
    { label: "a", display: "MATH 100" },
    { label: "b", display: "MATH 102" },
    { label: "c", display: "MATH 104" },
  ];

  it("renders (a)/(b)/(c) buttons; clicking an unselected row fires onChange", () => {
    const onChange = vi.fn();
    render(<StackedDisjunctionNode id="d2" data={{ options: stackedOptions, selectedIdx: 0, onChange }} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    fireEvent.click(buttons[1]);
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("exposes the selected choice without dimming available alternatives", () => {
    const { container } = render(
      <StackedDisjunctionNode id="neutral" data={{ options: stackedOptions, selectedIdx: 1, onChange: vi.fn() }} />,
    );
    expect(container.querySelector("section")?.classList.contains("bg-surface")).toBe(true);
    const choices = screen.getAllByRole("button");
    expect(choices.map((choice) => choice.getAttribute("aria-pressed"))).toEqual(["false", "true", "false"]);
    expect(choices[0].className).toContain("text-on-surface-variant");
    expect(choices[0].className).not.toContain("opacity-45");
  });

  it("matches the stacked snapshot with the selected row highlighted (REQ-9.4)", () => {
    const { container } = render(
      <StackedDisjunctionNode id="snap" data={{ options: stackedOptions, selectedIdx: 1, onChange: vi.fn() }} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
