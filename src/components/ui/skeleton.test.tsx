// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Skeleton, SkeletonFields, SkeletonGroup, SkeletonList, SkeletonText } from "./skeleton";

afterEach(cleanup);

describe("shared skeletons", () => {
  it("hides shapes from assistive technology", () => {
    const { container } = render(<Skeleton className="h-11 w-40" />);
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

  it("announces loading result lists", () => {
    const { getByRole, rerender } = render(<SkeletonList label="Loading results" rows={4} icon />);
    expect(getByRole("status", { name: "Loading results" })).toBeTruthy();
    rerender(<SkeletonList label="Loading results" rows={2} padding="none" />);
    expect(getByRole("status", { name: "Loading results" })).toBeTruthy();
  });

  it("reserves labeled fields without exposing editable controls", () => {
    const { queryByRole } = render(<SkeletonFields label="Loading profile" fields={4} />);
    expect(queryByRole("textbox")).toBeNull();
  });
});
