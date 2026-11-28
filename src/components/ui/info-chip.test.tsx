// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InfoChip } from "./info-chip";

describe("InfoChip", () => {
  it("renders factual metadata", () => {
    const { getByText } = render(<InfoChip>3 credits</InfoChip>);
    expect(getByText("3 credits")).toBeTruthy();
  });

  it.each(["caution", "error"] as const)("supports the %s status role", (tone) => {
    const { getByRole } = render(
      <InfoChip tone={tone} role="status">
        Needs attention
      </InfoChip>,
    );
    expect(getByRole("status").textContent).toBe("Needs attention");
  });
});
