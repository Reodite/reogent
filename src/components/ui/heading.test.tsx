// @vitest-environment happy-dom
import { render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { Heading } from "./heading";

describe("Heading", () => {
  it("forwards native heading props and refs", () => {
    const ref = createRef<HTMLHeadingElement>();
    const { getByRole } = render(
      <Heading ref={ref} id="details-title">
        Details
      </Heading>,
    );
    const heading = getByRole("heading", { level: 2 });
    expect(ref.current).toBe(heading);
    expect(heading.id).toBe("details-title");
  });
});
