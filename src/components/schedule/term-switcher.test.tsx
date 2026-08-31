// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TermSwitcher } from "./term-switcher";

afterEach(cleanup);

describe("TermSwitcher", () => {
  it("moves between terms with tablist arrow keys", () => {
    const onSelect = vi.fn();
    render(
      <TermSwitcher
        terms={[
          { key: "2026-fall", label: "Fall 2026", start: "2026-09-01", end: "2026-12-31" },
          { key: "2027-spring", label: "Spring 2027", start: "2027-01-01", end: "2027-04-30" },
        ]}
        selected="2026-fall"
        onSelect={onSelect}
      />,
    );

    const fall = screen.getByRole("tab", { name: "Fall 2026" });
    const spring = screen.getByRole("tab", { name: "Spring 2027" });
    fall.focus();
    fireEvent.keyDown(fall, { key: "ArrowRight" });

    expect(onSelect).toHaveBeenCalledWith("2027-spring");
    expect(document.activeElement).toBe(spring);
  });
});
