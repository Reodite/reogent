// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("forwards native props, events, and refs", () => {
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
    expect(button.disabled).toBe(false);
  });
});
