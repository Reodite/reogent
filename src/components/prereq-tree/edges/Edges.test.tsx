// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OptionalEdge } from "./OptionalEdge";

vi.mock("reactflow", () => ({
  EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => <div data-label>{children}</div>,
  getBezierPath: () => ["M0 0 L100 0", 50, 0],
}));

const edgeProps = {
  id: "e1",
  sourceX: 0,
  sourceY: 0,
  targetX: 100,
  targetY: 0,
  sourcePosition: "right" as const,
  targetPosition: "left" as const,
} as const;

describe("OptionalEdge (REQ-10.1, REQ-10.2)", () => {
  it("renders a dashed path with data-edge-variant=optional and a soft-toggle pill", () => {
    const { container } = render(
      <OptionalEdge {...edgeProps} data={{ softKey: "", disabled: false, onToggle: () => {} }} />,
    );
    const path = container.querySelector("path[data-edge-variant='optional']");
    expect(path).toBeTruthy();
    expect(path?.getAttribute("class")).toContain("react-flow__edge-path");
    const pill = container.querySelector('button[data-toggle="soft-toggle"]');
    expect(pill).toBeTruthy();
    expect(pill?.getAttribute("data-path")).toBe("");
    expect(pill?.getAttribute("aria-pressed")).toBe("true");
  });

  it("presses the pill off when the soft branch is disabled", () => {
    const data = { softKey: "X::.soft", onToggle: () => {} };
    const { container, rerender } = render(<OptionalEdge {...edgeProps} data={{ ...data, disabled: false }} />);
    expect(container.querySelector('button[aria-pressed="true"]')).toBeTruthy();
    rerender(<OptionalEdge {...edgeProps} data={{ ...data, disabled: true }} />);
    expect(container.querySelector('button[aria-pressed="false"]')).toBeTruthy();
  });

  it("fires onToggle(softKey) on pill click", () => {
    const onToggle = vi.fn();
    const { container } = render(
      <OptionalEdge {...edgeProps} data={{ softKey: "CPSC 320::.soft", disabled: false, onToggle }} />,
    );
    const pill = container.querySelector<HTMLElement>('button[data-toggle="soft-toggle"]');
    if (!pill) throw new Error("soft-toggle pill not rendered");
    fireEvent.click(pill);
    expect(onToggle).toHaveBeenCalledWith("CPSC 320::.soft");
  });
});
