// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// ReactFlow's Handle needs a ReactFlowProvider store; stub it so the nodes
// render standalone. Position is a runtime enum; NodeProps is type-only.
vi.mock("reactflow", () => ({
  Handle: () => null,
  Position: { Left: "left", Right: "right" },
}));

afterEach(() => cleanup());

const { DropdownDisjunctionNode, StackedDisjunctionNode } = await import("./DisjunctionNode");

const options = [
  { childId: "a", label: "MATH 100" },
  { childId: "b", label: "MATH 102" },
  { childId: "c", label: "MATH 104" },
];

describe("DropdownDisjunctionNode (REQ-9.1)", () => {
  it("renders closed by default, opens on trigger click, closes on Escape", () => {
    render(
      <DropdownDisjunctionNode
        id="d1"
        data={{ id: "d1", selectionKey: "CPSC_V 320::0", options, selected: 0, onSelect: vi.fn() }}
      />,
    );
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeTruthy();
    expect(screen.getAllByRole("option")).toHaveLength(3);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("selects an option via click → fires onSelect(selectionKey, index) and closes", () => {
    const onSelect = vi.fn();
    render(<DropdownDisjunctionNode id="d1" data={{ id: "d1", selectionKey: "k", options, selected: 0, onSelect }} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getAllByRole("option")[1]);
    expect(onSelect).toHaveBeenCalledWith("k", 1);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closes when a pointerdown fires outside the menu", () => {
    render(
      <DropdownDisjunctionNode
        id="d1"
        data={{ id: "d1", selectionKey: "k", options, selected: 0, onSelect: vi.fn() }}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("StackedDisjunctionNode (REQ-9.2)", () => {
  it("renders a radiogroup; clicking an unselected row fires onSelect", () => {
    const onSelect = vi.fn();
    render(<StackedDisjunctionNode id="d2" data={{ id: "d2", selectionKey: "k", options, selected: 0, onSelect }} />);
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(3);
    expect(radios[0].checked).toBe(true);
    expect(radios[1].checked).toBe(false);
    fireEvent.click(radios[1]);
    expect(onSelect).toHaveBeenCalledWith("k", 1);
  });
});
