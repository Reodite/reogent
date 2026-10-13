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

const renderNode = (data: CourseNodeData) => render(<CourseNode id="n1" data={data} />).container;

describe("CourseNode navigation", () => {
  it("emits the code on click when onNavigate is wired (REQ-9.5); note variants are not navigable", () => {
    const onNavigate = vi.fn();
    const known = renderNode({ code: "CPSC 210", title: "T", variant: "known", onNavigate });
    const link = known.querySelector('button[data-nav="course"]') as HTMLButtonElement;
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledWith("CPSC 210");

    const note = renderNode({ text: "Third-year standing", variant: "note", onNavigate });
    expect(note.querySelector('button[data-nav="course"]')).toBeNull();
  });

  it("omits navigation when onNavigate is absent", () => {
    const el = renderNode({ code: "CPSC 210", title: "T", variant: "known" });
    expect(el.querySelector('button[data-nav="course"]')).toBeNull();
  });
});
