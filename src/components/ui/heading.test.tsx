// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { Heading } from "./heading";

describe("Heading", () => {
  it.each([
    ["title", "text-xl", "leading-tight"],
    ["section", "text-base", "leading-6"],
    ["subsection", "text-sm", "leading-5"],
    ["label", "text-xs", "leading-4"],
  ] as const)("applies the %s type role without changing heading semantics", (size, font, leading) => {
    const { getByRole } = render(
      <Heading as="h3" size={size}>
        Course details
      </Heading>,
    );
    const heading = getByRole("heading", { level: 3, name: "Course details" });
    expect(heading.className).toContain(font);
    expect(heading.className).toContain(leading);
    expect(heading.className).toContain("font-medium");
    expect(heading.className).toContain("text-on-surface");
  });

  it("uses one explicit color role for muted group headings", () => {
    const { getByRole } = render(
      <Heading size="label" tone="muted">
        Saved
      </Heading>,
    );
    const heading = getByRole("heading");
    expect(heading.className).toContain("text-muted");
    expect(heading.className).not.toContain("text-on-surface");
  });

  it("forwards native heading props and refs", () => {
    const ref = createRef<HTMLHeadingElement>();
    const { getByRole } = render(
      <Heading ref={ref} id="details-title" className="truncate">
        Details
      </Heading>,
    );
    const heading = getByRole("heading", { level: 2 });
    expect(ref.current).toBe(heading);
    expect(heading.id).toBe("details-title");
    expect(heading.className).toContain("truncate");
  });
});
