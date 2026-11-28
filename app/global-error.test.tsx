// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RouteError from "./error";
import GlobalError from "./global-error";
import NotFound from "./not-found";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("GlobalError", () => {
  it("shows the failure and retries recovery when requested", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reset = vi.fn();
    render(<GlobalError error={new Error("Unexpected failure")} reset={reset} />);

    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeTruthy();
    expect(screen.getByText("Unexpected failure")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});

describe("recovery navigation", () => {
  it.each([GlobalError, RouteError, NotFound])("uses a named arrow-only home link", (Page) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Page error={new Error("Unexpected failure")} reset={vi.fn()} />);
    const back = screen.getByRole("link", { name: "Back to home" });
    expect(back.getAttribute("href")).toBe("/");
  });
});
