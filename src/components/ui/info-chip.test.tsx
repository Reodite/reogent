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

  it("supports stronger nested-surface emphasis", () => {
    const { getByText } = render(<InfoChip emphasis="strong">Academic</InfoChip>);
    expect(getByText("Academic").className).toContain("bg-surface-container-high");
  });
});
