// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button, ButtonLink } from "./button";

describe("Button", () => {
  it("defaults to a non-submit button", () => {
    const { getByRole } = render(<Button>Continue</Button>);
    const button = getByRole("button", { name: "Continue" });

    expect(button.getAttribute("type")).toBe("button");
  });

  it("passes native props, events, and refs through", () => {
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    const { getByRole } = render(
      <Button ref={ref} type="submit" aria-describedby="help" onClick={onClick}>
        Save
      </Button>,
    );
    const button = getByRole("button", { name: "Save" });

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
    expect(ref.current).toBe(button);
    expect(button.getAttribute("type")).toBe("submit");
    expect(button.getAttribute("aria-describedby")).toBe("help");
  });

  it("preserves the navigation destination", () => {
    const { getByRole } = render(<ButtonLink href="/signup">Get started</ButtonLink>);
    expect(getByRole("link", { name: "Get started" }).getAttribute("href")).toBe("/signup");
  });
});
