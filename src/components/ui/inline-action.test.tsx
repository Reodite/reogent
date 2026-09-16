// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { InlineAction, InlineLink } from "./inline-action";

describe("InlineAction", () => {
  it("renders a native inline text action with a mobile touch target", () => {
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    const { getByRole } = render(
      <InlineAction ref={ref} onClick={onClick} aria-describedby="error" className="ml-1">
        Retry
      </InlineAction>,
    );
    const button = getByRole("button", { name: "Retry" });

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
    expect(ref.current).toBe(button);
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-describedby")).toBe("error");
    expect(button.className).toContain("min-h-11");
    expect(button.className).toContain("min-w-11");
    expect(button.className).toContain("sm:min-h-0");
    expect(button.className).toContain("sm:min-w-0");
    expect(button.className).toContain("underline");
    expect(button.className).toContain("ml-1");
  });

  it("gives inline navigation the same mobile hit area", () => {
    const { getByRole } = render(<InlineLink href="/signup">Sign up</InlineLink>);
    const link = getByRole("link", { name: "Sign up" });
    expect(link.getAttribute("href")).toBe("/signup");
    expect(link.className).toContain("min-h-11");
    expect(link.className).toContain("sm:min-h-0");
  });
});
