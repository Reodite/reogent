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

describe("recovery navigation", () => {
  it.each([GlobalError, RouteError, NotFound])("provides a named home link", (Page) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(<Page error={new Error("Unexpected failure")} reset={vi.fn()} />);
    const back = screen.getByRole("link", { name: "Back to home" });
    expect(back.getAttribute("href")).toBe("/");
    expect(back.getAttribute("title")).toBe("Back to home");
  });
});
