// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const zoomRef = vi.hoisted(() => ({ value: 1 }));

// ReactFlow's Handle needs a ReactFlowProvider store; stub it so the nodes
// render standalone. Position is a runtime enum; NodeProps is type-only.
vi.mock("reactflow", () => ({
  Handle: () => null,
  Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
  useStore: () => zoomRef.value,
}));

afterEach(() => {
  cleanup();
  zoomRef.value = 1;
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
    zoomRef.value = 1;
    const data = { options, selectedIdx: 0, onChange: vi.fn(), detail };
    const { rerender } = render(<DropdownDisjunctionNode id="z" data={data} />);
    fireEvent.click(screen.getByRole("button"));
    const menu = screen.getByRole("listbox");
    expect(menu.className).toContain("nowheel");
    zoomRef.value = 2;
    rerender(<DropdownDisjunctionNode id="z" data={data} />);
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
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

  it("matches the stacked snapshot with the selected row highlighted (REQ-9.4)", () => {
    const { container } = render(
      <StackedDisjunctionNode id="snap" data={{ options: stackedOptions, selectedIdx: 1, onChange: vi.fn() }} />,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
