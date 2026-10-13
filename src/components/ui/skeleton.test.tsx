// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Skeleton, SkeletonFields, SkeletonGroup, SkeletonList, SkeletonText } from "./skeleton";

afterEach(cleanup);

describe("shared skeletons", () => {
  it("hides shapes from assistive technology and prevents flex shrink", () => {
    const { container } = render(<Skeleton className="h-11 w-40" />);
    const shape = container.querySelector("[data-skeleton]");
    expect(shape?.getAttribute("aria-hidden")).toBe("true");
    expect(shape?.className).toContain("shrink-0");
    expect(shape?.className).toContain("max-w-full");
  });

  it("announces the group once and keeps decorative content hidden", () => {
    const { getByRole, getAllByRole, container } = render(
      <SkeletonGroup label="Loading courses">
        <SkeletonText />
      </SkeletonGroup>,
    );
    expect(getByRole("status", { name: "Loading courses" }).textContent).toBe("Loading courses");
    expect(getAllByRole("status")).toHaveLength(1);
    expect(container.querySelectorAll("[data-skeleton]")).toHaveLength(3);
    expect(container.querySelector("[data-skeleton]")?.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it("gives lists a default content inset and stable row spacing", () => {
    const { getByRole, container, rerender } = render(<SkeletonList label="Loading results" rows={4} icon />);
    const list = getByRole("status");
    expect(list.className).toContain("p-4");
    expect(list.className).toContain("gap-3");
    expect(container.querySelectorAll("[data-skeleton]")).toHaveLength(12);
    rerender(<SkeletonList label="Loading results" rows={2} padding="none" />);
    expect(getByRole("status").className).toContain("p-0");
    expect(container.querySelectorAll("[data-skeleton]")).toHaveLength(4);
  });

  it("reserves labeled fields without exposing editable controls", () => {
    const { container, queryByRole } = render(<SkeletonFields label="Loading profile" fields={4} />);
    expect(container.querySelectorAll("[data-skeleton]")).toHaveLength(8);
    expect(queryByRole("textbox")).toBeNull();
    expect(container.querySelectorAll(".h-11")).toHaveLength(4);
    for (const control of container.querySelectorAll(".h-11")) {
      expect(control.parentElement?.className).toContain("gap-1.5");
    }
  });
});
