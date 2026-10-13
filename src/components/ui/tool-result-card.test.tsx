// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolResultCard, ToolResultFailure, ToolResultList, ToolResultRowContent } from "./tool-result-card";

describe("tool result primitives", () => {
  it("renders summary content, zero metadata, and an action", () => {
    const { getByText, getByRole } = render(
      <ToolResultCard
        icon="building1"
        title="Learning Centre"
        metadata={0}
        detail="No rooms listed"
        action={<a href="/tools/map">Show on map</a>}
      />,
    );
    expect(getByText("Learning Centre")).not.toBeNull();
    expect(getByText("0")).not.toBeNull();
    expect(getByText("No rooms listed")).not.toBeNull();
    expect(getByRole("link", { name: "Show on map" }).getAttribute("href")).toBe("/tools/map");
  });

  it("renders the list header, footer, and row content", () => {
    render(
      <ToolResultList header="near IKB" footer="2 more">
        <button type="button">
          <ToolResultRowContent title="Room 201" description="ICCS" trailing={<span>40 seats</span>} />
        </button>
      </ToolResultList>,
    );
    expect(screen.getByRole("button", { name: /Room 201.*ICCS.*40 seats/ })).not.toBeNull();
    expect(screen.getByText("near IKB")).not.toBeNull();
    expect(screen.getByText("2 more")).not.toBeNull();
  });

  it("preserves zero-valued row metadata", () => {
    const { getByText } = render(<ToolResultRowContent title="Deadline" metadata={0} />);
    expect(getByText("0")).not.toBeNull();
  });

  it("preserves safe raw evidence when a rich renderer fails", () => {
    render(<ToolResultFailure name="show_widget" result={{ course: "CPSC 110" }} />);
    expect(screen.getByRole("alert").textContent).toContain("show widget result couldn't be displayed");
    expect(screen.getByText("View raw result")).not.toBeNull();
    expect(screen.getByText(/CPSC 110/)).not.toBeNull();
  });
});
