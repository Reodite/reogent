// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RouteError from "./error";
import GlobalError from "./global-error";
import NotFound from "./not-found";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("GlobalError", () => {
  it("keeps fallback typography, contrast, and actions on the shared scale", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<GlobalError error={new Error("Unexpected failure")} reset={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Something went wrong" }).style.fontSize).toBe("1.25rem");
    expect(screen.getByText("Unexpected failure").style.color).toBe("#5a6066");
    expect(screen.getByRole("button", { name: "Try again" }).style.minHeight).toBe("2.75rem");
    const back = screen.getByRole("link", { name: "Back to home" });
    expect(back.style.minHeight).toBe("2.75rem");
    expect(back.style.width).toBe("2.75rem");
    expect(back.style.borderStyle).toBe("none");
    expect(back.style.background).toBe("transparent");
    expect(back.style.borderRadius).toBe("0.5rem");
    expect(screen.getByRole("button", { name: "Try again" }).style.borderRadius).toBe("0.5rem");
  });
});

describe("recovery navigation", () => {
  it.each([GlobalError, RouteError, NotFound])("uses a named arrow-only home link", (Page) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Page error={new Error("Unexpected failure")} reset={vi.fn()} />);
    const back = screen.getByRole("link", { name: "Back to home" });
    expect(back.getAttribute("href")).toBe("/");
    expect(back.getAttribute("title")).toBe("Back to home");
    expect(back.textContent).toBe("");
    expect(back.classList.contains("neu-button")).toBe(false);
    expect(back.querySelector("svg")?.getAttribute("width")).toBe("20");
    expect(back.querySelector("svg")?.innerHTML).not.toBe("");
  });
});
