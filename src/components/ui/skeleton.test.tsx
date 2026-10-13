// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Skeleton, SkeletonFields, SkeletonGroup, SkeletonText } from "./skeleton";

afterEach(cleanup);

describe("shared skeletons", () => {
  it("hides shapes from assistive technology", () => {
    const { container } = render(<Skeleton />);
    const shape = container.querySelector("[data-skeleton]");
    expect(shape?.getAttribute("aria-hidden")).toBe("true");
  });

  it("announces the group once and keeps decorative content hidden", () => {
    const { getByRole, getAllByRole, container } = render(
      <SkeletonGroup label="Loading courses">
        <SkeletonText />
      </SkeletonGroup>,
    );
    expect(getByRole("status", { name: "Loading courses" }).textContent).toBe("Loading courses");
    expect(getAllByRole("status")).toHaveLength(1);
    expect(container.querySelector("[data-skeleton]")?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("withholds editable controls while fields load", () => {
    const { queryByRole } = render(<SkeletonFields label="Loading profile" fields={4} />);
    expect(queryByRole("textbox")).toBeNull();
  });
});
