// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ToolResultCard,
  ToolResultFailure,
  ToolResultList,
  toolResultRowClasses,
  ToolResultRowContent,
} from "./tool-result-card";

describe("tool result primitives", () => {
  it("shares summary typography, preserves zero metadata, and allows actions to wrap", () => {
    const { getByText, getByRole } = render(
      <ToolResultCard
        icon="building1"
        title="Learning Centre"
        metadata={0}
        detail="No rooms listed"
        action={<a href="/tools/map">Show on map</a>}
      />,
    );
    expect(getByText("Learning Centre").className).toContain("text-base");
    expect(getByText("Learning Centre").parentElement?.className).toContain("gap-1");
    expect(getByText("0").className).toContain("text-muted");
    expect(getByText("No rooms listed").className).toContain("text-on-surface-variant");
    expect(getByRole("link").parentElement?.className).toContain("flex-wrap");
  });

  it("omits unused summary rows", () => {
    const { getByText, queryByRole } = render(<ToolResultCard icon="map" title="Campus map" />);
    expect(getByText("Campus map").parentElement?.childElementCount).toBe(1);
    expect(queryByRole("button")).toBeNull();
  });

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

  it("places wrapping metadata below the truncated description without moving trailing content", () => {
    const { getByText } = render(
      <div className={toolResultRowClasses()}>
        <ToolResultRowContent
          title="Registration deadline"
          description="Undergraduate registration"
          metadata={<span>September 1 through September 30, 2026</span>}
          trailing={<span>Trailing action</span>}
        />
      </div>,
    );
    const title = getByText("Registration deadline");
    const description = getByText("Undergraduate registration");
    const metadata = getByText("September 1 through September 30, 2026").parentElement!;
    expect(metadata.parentElement).toBe(title.parentElement);
    expect(description.nextElementSibling).toBe(metadata);
    expect(metadata.className).toContain("flex-wrap");
    expect(metadata.className).toContain("gap-2");
    expect(metadata.className).toContain("text-xs");
    expect(metadata.className).toContain("text-muted");
    expect(metadata.className).not.toMatch(/truncate|shrink-0|whitespace-nowrap/);
    expect(description.className).toContain("truncate");
    expect(title.parentElement?.className).toContain("min-w-0");
    expect(title.parentElement?.classList.contains("gap-1")).toBe(true);
    expect(title.parentElement?.nextElementSibling).toBe(getByText("Trailing action"));
  });

  it.each([undefined, null, 0, ""])("renders row metadata only when non-null: %s", (metadata) => {
    const { getByText } = render(<ToolResultRowContent title="Deadline" metadata={metadata} />);
    const column = getByText("Deadline").parentElement!;
    expect(column.childElementCount).toBe(metadata == null ? 1 : 2);
    if (metadata === 0) expect(column.lastElementChild?.textContent).toBe("0");
  });

  it("preserves safe raw evidence when a rich renderer fails", () => {
    render(<ToolResultFailure name="show_widget" result={{ course: "CPSC 110" }} />);
    expect(screen.getByRole("alert").textContent).toContain("show widget result couldn't be displayed");
    expect(screen.getByText("View raw result")).not.toBeNull();
    expect(screen.getByText(/CPSC 110/)).not.toBeNull();
  });
});
