// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InfoChip } from "./info-chip";

describe("InfoChip", () => {
  it("renders factual metadata without interactive semantics", () => {
    const { getByText } = render(<InfoChip>3 credits</InfoChip>);
    const chip = getByText("3 credits");
    expect(chip.tagName).toBe("SPAN");
    expect(chip.className).toContain("bg-surface-container");
    expect(chip.className).toContain("rounded-full");
  });

  it.each([
    ["caution", "bg-tertiary-container", "text-on-tertiary-container"],
    ["error", "bg-error-container", "text-on-error-container"],
  ] as const)("shares geometry and native status semantics for %s", (tone, background, color) => {
    const { getByRole } = render(
      <InfoChip tone={tone} role="status">
        Needs attention
      </InfoChip>,
    );
    const chip = getByRole("status");
    expect(chip.className).toContain(background);
    expect(chip.className).toContain(color);
    expect(chip.className).toContain("px-2 py-0.5");
    expect(chip.className).toContain("leading-4");
    expect(chip.hasAttribute("tabindex")).toBe(false);
    expect(chip.className).not.toMatch(/(?:^|\s)bg-surface-container(?:\s|$)/);
  });

  it("supports stronger nested-surface emphasis", () => {
    const { getByText } = render(<InfoChip emphasis="strong">Academic</InfoChip>);
    expect(getByText("Academic").className).toContain("bg-surface-container-high");
  });
});
