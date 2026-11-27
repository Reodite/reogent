// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { Heading } from "./heading";

describe("Heading", () => {
  it("preserves heading semantics across size variants", () => {
    const { getByRole } = render(
      <Heading as="h3" size="section">
        Course details
      </Heading>,
    );
    expect(getByRole("heading", { level: 3, name: "Course details" })).toBeTruthy();
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
  });
});
