// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { InlineAction, InlineLink } from "./inline-action";

describe("InlineAction", () => {
  it("forwards native events, props, and refs", () => {
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    const { getByRole } = render(
      <InlineAction ref={ref} onClick={onClick} aria-describedby="error">
        Retry
      </InlineAction>,
    );
    const button = getByRole("button", { name: "Retry" });

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
    expect(ref.current).toBe(button);
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("aria-describedby")).toBe("error");
  });

  it("preserves the navigation destination", () => {
    const { getByRole } = render(<InlineLink href="/signup">Sign up</InlineLink>);
    const link = getByRole("link", { name: "Sign up" });
    expect(link.getAttribute("href")).toBe("/signup");
  });
});
