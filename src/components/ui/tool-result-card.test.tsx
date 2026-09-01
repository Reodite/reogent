// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolResultFailure, ToolResultList, toolResultRowClasses, ToolResultRowContent } from "./tool-result-card";

describe("tool result primitives", () => {
  it("shares list, row, and metadata anatomy without changing native semantics", () => {
    render(
      <ToolResultList header="near IKB" footer="2 more">
        <button type="button" className={toolResultRowClasses(true)}>
          <ToolResultRowContent title="Room 201" description="ICCS" trailing={<span>40 seats</span>} />
        </button>
      </ToolResultList>,
    );
    const row = screen.getByRole("button", { name: /Room 201.*ICCS.*40 seats/ });
    expect(row.className).toContain("min-h-11");
    expect(row.className).toContain("hover:bg-surface-container-high");
    expect(screen.getByText("near IKB")).not.toBeNull();
    expect(screen.getByText("2 more")).not.toBeNull();
  });

  it("preserves safe raw evidence when a rich renderer fails", () => {
    render(<ToolResultFailure name="show_widget" result={{ course: "CPSC 110" }} />);
    expect(screen.getByRole("alert").textContent).toContain("show widget result couldn't be displayed");
    expect(screen.getByText("View raw result")).not.toBeNull();
    expect(screen.getByText(/CPSC 110/)).not.toBeNull();
  });
});
