// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RetryAlert } from "./retry-alert";

describe("RetryAlert", () => {
  it("renders a semantic solid alert and delegates retry", () => {
    const onRetry = vi.fn();
    const { getByRole } = render(<RetryAlert onRetry={onRetry}>Couldn&apos;t load courses.</RetryAlert>);
    const alert = getByRole("alert");
    const retry = getByRole("button", { name: "Retry" });

    expect(alert.className).toContain("bg-error-container");
    expect(alert.className).toContain("text-on-error-container");
    expect(retry.className).toContain("min-h-11");
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("supports a soft surface, native paragraph props, and no retry action", () => {
    const { getByRole, queryByRole } = render(
      <RetryAlert variant="soft" id="load-error" className="pointer-events-auto">
        Course data is unavailable.
      </RetryAlert>,
    );
    const alert = getByRole("alert");

    expect(alert.getAttribute("id")).toBe("load-error");
    expect(alert.className).toContain("bg-error-container/30");
    expect(alert.className).toContain("text-error");
    expect(alert.className).toContain("pointer-events-auto");
    expect(queryByRole("button")).toBeNull();
  });
});
