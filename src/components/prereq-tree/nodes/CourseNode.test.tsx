// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CourseNode, type CourseNodeData } from "./CourseNode";

// React Flow's Handle needs a ReactFlowProvider store; stub it so CourseNode
// renders standalone. Position is a runtime enum; NodeProps is type-only.
vi.mock("reactflow", () => ({
  Handle: () => null,
  Position: { Left: "left", Right: "right" },
}));

const renderNode = (data: CourseNodeData) => render(<CourseNode id="n1" data={data} />).container;

describe("CourseNode variants (REQ-9.4)", () => {
  it("renders root variant with ROOT label (bg-primary-container)", () => {
    expect(renderNode({ id: "cpsc320", code: "CPSC 320", variant: "root" })).toMatchSnapshot();
  });

  it("renders known variant (bg-surface)", () => {
    expect(renderNode({ id: "cpsc221", code: "CPSC 221", variant: "known" })).toMatchSnapshot();
  });

  it("renders unknown variant with the not-in-catalog note (bg-error-container)", () => {
    expect(renderNode({ id: "calc12", code: "CALC 12", variant: "unknown" })).toMatchSnapshot();
  });

  it("renders note variant with label prose (bg-surface-container-low text-muted)", () => {
    expect(renderNode({ id: "lit1", label: "Third-year standing", variant: "note" })).toMatchSnapshot();
  });

  it("renders coreq variant (bg-secondary-container)", () => {
    expect(renderNode({ id: "math200", code: "MATH 200", variant: "coreq" })).toMatchSnapshot();
  });

  it("carries data-node-id and data-variant attributes for the property oracles", () => {
    const el = renderNode({ id: "cpsc110", code: "CPSC 110", variant: "known" }).querySelector("section");
    expect(el?.getAttribute("data-node-id")).toBe("cpsc110");
    expect(el?.getAttribute("data-variant")).toBe("known");
  });

  it("emits the code on click when onNavigate is wired (REQ-9.5); note variants are not navigable", () => {
    const onNavigate = vi.fn();
    const known = renderNode({ id: "k", code: "CPSC 210", variant: "known", onNavigate });
    fireEvent.click(known.querySelector('button[data-nav="course"]') as HTMLButtonElement);
    expect(onNavigate).toHaveBeenCalledWith("CPSC 210");

    onNavigate.mockClear();
    const root = renderNode({ id: "r", code: "CPSC 320", variant: "root", onNavigate });
    fireEvent.click(root.querySelector('button[data-nav="course"]') as HTMLButtonElement);
    expect(onNavigate).toHaveBeenCalledWith("CPSC 320");

    const note = renderNode({ id: "n", label: "Third-year standing", variant: "note", onNavigate });
    expect(note.querySelector('button[data-nav="course"]')).toBeNull();
  });

  it("renders the code as a plain div when onNavigate is absent (no nav affordance)", () => {
    const el = renderNode({ id: "k", code: "CPSC 210", variant: "known" });
    expect(el.querySelector('button[data-nav="course"]')).toBeNull();
    expect(el.querySelector(".font-mono")?.tagName).toBe("DIV");
  });
});
