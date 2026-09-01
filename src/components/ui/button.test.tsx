// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("renders the shared secondary action by default", () => {
    const { getByRole } = render(<Button>Continue</Button>);
    const button = getByRole("button", { name: "Continue" });

    expect(button.getAttribute("type")).toBe("button");
    expect(button.className).toContain("neu-button");
    expect(button.className).toContain("bg-surface");
    expect(button.className).toContain("neu-shadow-on-surface");
    expect(button.className).toContain("h-11");
    expect(button.className).toContain("sm:h-9");
    expect(button.className).toContain("rounded-xl");
  });

  it("supports primary, ghost, size, and shadow context variants", () => {
    const { getByRole, rerender } = render(
      <Button variant="primary" size="large" shadowOn="background">
        Create account
      </Button>,
    );
    let button = getByRole("button", { name: "Create account" });
    expect(button.className).toContain("neu-primary-button");
    expect(button.className).toContain("neu-shadow-on-background");
    expect(button.className).toContain("h-12");

    rerender(
      <Button variant="ghost" size="compact">
        Cancel
      </Button>,
    );
    button = getByRole("button", { name: "Cancel" });
    expect(button.className).not.toContain("neu-button");
    expect(button.className).toContain("h-11");
    expect(button.className).toContain("sm:h-8");

    rerender(<Button variant="danger">Delete</Button>);
    button = getByRole("button", { name: "Delete" });
    expect(button.className).toContain("neu-button");
    expect(button.className).toContain("enabled:hover:text-error");
    expect(button.className).not.toMatch(/(?:^|\s)hover:text-error(?:\s|$)/);
  });

  it("passes native props, events, classes, and refs through", () => {
    const onClick = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    const { getByRole } = render(
      <Button ref={ref} type="submit" className="w-full" aria-describedby="help" onClick={onClick}>
        Save
      </Button>,
    );
    const button = getByRole("button", { name: "Save" });

    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
    expect(ref.current).toBe(button);
    expect(button.getAttribute("type")).toBe("submit");
    expect(button.getAttribute("aria-describedby")).toBe("help");
    expect(button.className).toContain("w-full");
  });

  it.each([
    ["compact", "sm:h-8"],
    ["toolbar", "sm:h-9"],
    ["default", "sm:h-9"],
    ["prominent", "sm:h-10"],
    ["field", "h-11"],
    ["large", "h-12"],
    ["icon", "sm:size-9"],
  ] as const)("maps the %s size to documented geometry", (size, expectedClass) => {
    const { getByRole } = render(
      <Button size={size} aria-label={size === "icon" ? "Open" : undefined}>
        {size === "icon" ? null : "Action"}
      </Button>,
    );
    expect(getByRole("button").className).toContain(expectedClass);
  });
});
