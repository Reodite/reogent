// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InfoChip } from "./info-chip";

describe("InfoChip", () => {
  it("supports status semantics outside the tab order", () => {
    const { getByRole } = render(<InfoChip role="status">Needs attention</InfoChip>);
    const chip = getByRole("status");
    expect(chip.tabIndex).toBe(-1);
  });
});
