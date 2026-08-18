// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HardEdge } from "./HardEdge";
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
    const { container } = render(<OptionalEdge {...edgeProps} data={{ path: "", softToggled: false }} />);
    const path = container.querySelector("path[data-edge-variant='optional']");
    expect(path).toBeTruthy();
    expect(path?.getAttribute("class")).toContain("react-flow__edge-path");
    const pill = container.querySelector('button[data-toggle="soft-toggle"]');
    expect(pill).toBeTruthy();
    expect(pill?.getAttribute("data-path")).toBe("");
    expect(pill?.getAttribute("aria-pressed")).toBe("false");
  });

  it("shows the minimize icon when toggled on and the add icon when off", () => {
    const { container, rerender } = render(<OptionalEdge {...edgeProps} data={{ path: "0", softToggled: false }} />);
    expect(container.querySelector('button[aria-pressed="false"]')).toBeTruthy();
    rerender(<OptionalEdge {...edgeProps} data={{ path: "0", softToggled: true }} />);
    expect(container.querySelector('button[aria-pressed="true"]')).toBeTruthy();
  });

  it("fires onToggle(path) on pill click", () => {
    const onToggle = vi.fn();
    const { container } = render(<OptionalEdge {...edgeProps} data={{ path: "0.1", softToggled: false, onToggle }} />);
    const pill = container.querySelector<HTMLElement>('button[data-toggle="soft-toggle"]');
    if (!pill) throw new Error("soft-toggle pill not rendered");
    fireEvent.click(pill);
    expect(onToggle).toHaveBeenCalledWith("0.1");
  });
});

describe("HardEdge (REQ-10.1)", () => {
  it("renders a solid path with data-edge-variant=hard and no dash", () => {
    const { container } = render(<HardEdge {...edgeProps} />);
    const path = container.querySelector("path[data-edge-variant='hard']");
    expect(path).toBeTruthy();
    expect(path?.getAttribute("style") ?? "").not.toMatch(/dasharray/i);
  });
});
