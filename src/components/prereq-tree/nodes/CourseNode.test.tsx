// @vitest-environment happy-dom
import { render } from "@testing-library/react";
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
});
