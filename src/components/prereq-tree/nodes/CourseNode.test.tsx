// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CourseNode, type CourseNodeData } from "./CourseNode";

// React Flow's Handle needs a ReactFlowProvider store; stub it so CourseNode
// renders standalone. Position is a runtime enum; NodeProps is type-only.
vi.mock("reactflow", () => ({
  Handle: () => null,
  Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
}));

const renderNode = (data: CourseNodeData, id = "n1") => render(<CourseNode id={id} data={data} />).container;

describe("Prerequisite course nodes", () => {
  it("renders root course information", () => {
    const node = renderNode({ code: "CPSC 320", title: "Intermediate Algorithm Design and Analysis", variant: "root" });
    expect(node.textContent).toContain("CPSC 320");
    expect(node.textContent).toContain("Intermediate Algorithm Design and Analysis");
  });

  it("renders known course information", () => {
    const node = renderNode({ code: "CPSC 221", title: "Basic Algorithms and Data Structures", variant: "known" });
    expect(node.textContent).toContain("CPSC 221");
    expect(node.textContent).toContain("Basic Algorithms and Data Structures");
  });

  it("renders unknown course information", () => {
    const node = renderNode({ code: "CALC 12", title: "(not in calendar)", variant: "unknown" });
    expect(node.textContent).toContain("CALC 12");
    expect(node.textContent).toContain("(not in calendar)");
  });

  it("renders a note", () => {
    expect(renderNode({ text: "Third-year standing", variant: "note" }).textContent).toContain("Third-year standing");
  });

  it("emits the code on click when onNavigate is wired; note variants are not navigable", () => {
    const onNavigate = vi.fn();
    const known = renderNode({ code: "CPSC 210", title: "T", variant: "known", onNavigate });
    const link = known.querySelector('button[data-nav="course"]') as HTMLButtonElement;
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledWith("CPSC 210");

    const note = renderNode({ text: "Third-year standing", variant: "note", onNavigate });
    expect(note.querySelector('button[data-nav="course"]')).toBeNull();
  });

  it("renders the course code without a navigation action when onNavigate is absent", () => {
    const el = renderNode({ code: "CPSC 210", title: "T", variant: "known" });
    expect(el.querySelector('button[data-nav="course"]')).toBeNull();
    expect(el.textContent).toContain("CPSC 210");
  });
});
