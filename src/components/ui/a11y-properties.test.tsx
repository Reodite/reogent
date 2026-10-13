// @vitest-environment happy-dom
import { announce, LiveRegion } from "@/src/components/ui/live-region";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

describe("live region announcements", () => {
  it("updates the polite live region when an announcement changes", () => {
    const { container } = render(<LiveRegion />);
    const region = container.querySelector("[data-live-region]") as HTMLElement;
    expect(region.getAttribute("aria-live")).toBe("polite");
    act(() => announce("Sources panel expanded"));
    expect(region.textContent).toBe("Sources panel expanded");
    act(() => announce("Sources panel collapsed"));
    expect(region.textContent).toBe("Sources panel collapsed");
  });
});
