// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolResultCard, ToolResultFailure, ToolResultList, ToolResultRowContent } from "./tool-result-card";

describe("tool result primitives", () => {
  it("preserves zero metadata and exposes the action", () => {
    const { getByText, getByRole } = render(
      <ToolResultCard
        icon="building1"
        title="Learning Centre"
        metadata={0}
        detail="No rooms listed"
        action={<a href="/tools/map">Show on map</a>}
      />,
    );
    expect(getByText("Learning Centre")).toBeTruthy();
    expect(getByText("0")).toBeTruthy();
    expect(getByText("No rooms listed")).toBeTruthy();
    expect(getByRole("link", { name: "Show on map" }).getAttribute("href")).toBe("/tools/map");
  });

  it("omits unused summary rows", () => {
    const { getByText, queryByRole } = render(<ToolResultCard icon="map" title="Campus map" />);
    expect(getByText("Campus map")).toBeTruthy();
    expect(queryByRole("button")).toBeNull();
  });

  it("renders list content and preserves button semantics", () => {
    render(
      <ToolResultList header="near IKB" footer="2 more">
        <button type="button">
          <ToolResultRowContent title="Room 201" description="ICCS" trailing={<span>40 seats</span>} />
        </button>
      </ToolResultList>,
    );
    const row = screen.getByRole("button", { name: /Room 201.*ICCS.*40 seats/ });
    expect(row.tagName).toBe("BUTTON");
    expect(screen.getByText("near IKB")).not.toBeNull();
    expect(screen.getByText("2 more")).not.toBeNull();
  });

  it("renders row title, description, metadata, and trailing content", () => {
    const { getByText } = render(
      <div>
        <ToolResultRowContent
          title="Registration deadline"
          description="Undergraduate registration"
          metadata={<span>September 1 through September 30, 2026</span>}
          trailing={<span>Trailing action</span>}
        />
      </div>,
    );
    expect(getByText("Registration deadline")).toBeTruthy();
    expect(getByText("Undergraduate registration")).toBeTruthy();
    expect(getByText("September 1 through September 30, 2026")).toBeTruthy();
    expect(getByText("Trailing action")).toBeTruthy();
  });

  it.each([undefined, null, 0, ""])("renders row metadata only when non-null: %s", (metadata) => {
    const { getByText, queryByText } = render(<ToolResultRowContent title="Deadline" metadata={metadata} />);
    expect(getByText("Deadline")).toBeTruthy();
    if (metadata == null || metadata === "") expect(queryByText("0")).toBeNull();
    if (metadata === 0) expect(getByText("0")).toBeTruthy();
  });

  it("preserves safe raw evidence when a rich renderer fails", () => {
    render(<ToolResultFailure name="show_widget" result={{ course: "CPSC 110" }} />);
    expect(screen.getByRole("alert").textContent).toContain("show widget result couldn't be displayed");
    expect(screen.getByText("View raw result")).not.toBeNull();
    expect(screen.getByText(/CPSC 110/)).not.toBeNull();
  });
});
