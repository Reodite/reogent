// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import GlobalError from "./global-error";

afterEach(() => vi.restoreAllMocks());

describe("GlobalError", () => {
  it("keeps fallback typography, contrast, and actions on the shared scale", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<GlobalError error={new Error("Unexpected failure")} reset={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Something went wrong" }).style.fontSize).toBe("1.25rem");
    expect(screen.getByText("Unexpected failure").style.color).toBe("#5a6066");
    expect(screen.getByRole("button", { name: "Try again" }).style.minHeight).toBe("2.75rem");
    expect(screen.getByRole("link", { name: "Go home" }).style.minHeight).toBe("2.75rem");
  });
});
