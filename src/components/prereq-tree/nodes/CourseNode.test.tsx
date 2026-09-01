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

describe("CourseNode variants (REQ-9.4)", () => {
  it("renders root variant with ROOT label and title row (bg-primary-container)", () => {
    expect(
      renderNode({ code: "CPSC 320", title: "Intermediate Algorithm Design and Analysis", variant: "root" }),
    ).toMatchSnapshot();
  });

  it("renders known variant with a title row (bg-surface)", () => {
    expect(
      renderNode({ code: "CPSC 221", title: "Basic Algorithms and Data Structures", variant: "known" }),
    ).toMatchSnapshot();
  });

  it("renders unknown variant with the (not in calendar) title (bg-error-container)", () => {
    expect(renderNode({ code: "CALC 12", title: "(not in calendar)", variant: "unknown" })).toMatchSnapshot();
  });

  it("renders note variant with text prose (bg-surface-container-low text-muted)", () => {
    expect(renderNode({ text: "Third-year standing", variant: "note" })).toMatchSnapshot();
  });

  it("renders coreq-column known nodes with the secondary-container tint", () => {
    const el = renderNode({ code: "MATH 200", title: "Calculus III", variant: "known", coreq: true }).querySelector(
      "section",
    );
    expect(el?.className).toContain("bg-secondary-container");
  });

  it("carries data-node-id, data-variant, and a border matching the edge stroke", () => {
    const el = renderNode({ code: "CPSC 110", title: "T", variant: "known" }, "CPSC 110").querySelector("section");
    expect(el?.getAttribute("data-node-id")).toBe("CPSC 110");
    expect(el?.getAttribute("data-variant")).toBe("known");
    expect(el?.className).toContain("border-border");
  });

  it("emits the code on click when onNavigate is wired (REQ-9.5); note variants are not navigable", () => {
    const onNavigate = vi.fn();
    const known = renderNode({ code: "CPSC 210", title: "T", variant: "known", onNavigate });
    const link = known.querySelector('button[data-nav="course"]') as HTMLButtonElement;
    expect(link.className).toContain("min-h-14");
    expect(link.className).toContain("min-w-14");
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledWith("CPSC 210");

    const note = renderNode({ text: "Third-year standing", variant: "note", onNavigate });
    expect(note.querySelector('button[data-nav="course"]')).toBeNull();
  });

  it("renders the code as a plain div when onNavigate is absent (no nav affordance)", () => {
    const el = renderNode({ code: "CPSC 210", title: "T", variant: "known" });
    expect(el.querySelector('button[data-nav="course"]')).toBeNull();
    expect(el.querySelector(".font-mono")?.tagName).toBe("DIV");
  });
});
