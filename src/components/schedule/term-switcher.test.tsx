// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TermSwitcher } from "./term-switcher";

afterEach(cleanup);

const terms = [
  { key: "2026-fall", label: "Fall 2026" },
  { key: "2027-spring", label: "Spring 2027" },
];

describe("TermSwitcher", () => {
  it("moves between terms with tablist arrow keys", () => {
    const onSelect = vi.fn();
    render(<TermSwitcher terms={terms} selected="2026-fall" onSelect={onSelect} />);

    const fall = screen.getByRole("tab", { name: "Fall 2026" });
    const spring = screen.getByRole("tab", { name: "Spring 2027" });
    fall.focus();
    fireEvent.keyDown(fall, { key: "ArrowRight" });

    expect(onSelect).toHaveBeenCalledWith("2027-spring");
    expect(document.activeElement).toBe(spring);
  });

  it("wraps with ArrowLeft and supports Home and End", () => {
    const onSelect = vi.fn();
    render(<TermSwitcher terms={terms} selected="2026-fall" onSelect={onSelect} />);

    const fall = screen.getByRole("tab", { name: "Fall 2026" });
    const spring = screen.getByRole("tab", { name: "Spring 2027" });

    fireEvent.keyDown(fall, { key: "ArrowLeft" });
    expect(onSelect).toHaveBeenLastCalledWith("2027-spring");
    expect(document.activeElement).toBe(spring);

    fireEvent.keyDown(spring, { key: "Home" });
    expect(onSelect).toHaveBeenLastCalledWith("2026-fall");
    expect(document.activeElement).toBe(fall);

    fireEvent.keyDown(fall, { key: "End" });
    expect(onSelect).toHaveBeenLastCalledWith("2027-spring");
    expect(document.activeElement).toBe(spring);
  });
});
