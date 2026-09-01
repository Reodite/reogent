// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FullPageState, LoadingStatus, RetryAlert, RetryState, sanitizePublicErrorMessage } from "./feedback";

describe("RetryAlert", () => {
  it("renders a semantic solid alert and delegates retry", () => {
    const onRetry = vi.fn();
    const { getByRole } = render(<RetryAlert onRetry={onRetry}>Couldn&apos;t load courses.</RetryAlert>);
    const alert = getByRole("alert");
    const retry = getByRole("button", { name: "Retry" });

    expect(alert.className).toContain("bg-error-container");
    expect(alert.className).toContain("text-on-error-container");
    expect(retry.className).toContain("min-h-11");
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("supports a soft surface, native paragraph props, and no retry action", () => {
    const { getByRole, queryByRole } = render(
      <RetryAlert variant="soft" id="load-error" className="pointer-events-auto">
        Course data is unavailable.
      </RetryAlert>,
    );
    const alert = getByRole("alert");

    expect(alert.getAttribute("id")).toBe("load-error");
    expect(alert.className).toContain("bg-error-container/30");
    expect(alert.className).toContain("text-error");
    expect(alert.className).toContain("pointer-events-auto");
    expect(queryByRole("button")).toBeNull();
  });
});

describe("shared feedback states", () => {
  it("renders a bounded full-page state and sanitizes public errors", () => {
    const { getByRole } = render(
      <FullPageState
        alert
        fill="parent"
        title="Something went wrong"
        description={sanitizePublicErrorMessage("boom at /srv/app.ts:10:2")}
        actions={<a href="/">Go home</a>}
      />,
    );
    const alert = getByRole("alert", { name: "Something went wrong" });
    expect(alert.parentElement?.className).toContain("h-full");
    expect(alert.textContent).not.toContain("/srv/app.ts");
    expect(getByRole("link", { name: "Go home" })).not.toBeNull();
  });

  it("announces one loading label with the requested spinner size", () => {
    const { getByRole } = render(<LoadingStatus size="md">Loading calendar…</LoadingStatus>);
    const status = getByRole("status");
    expect(status.textContent).toContain("Loading calendar…");
    expect(status.querySelector("[aria-hidden='true']")?.className).toContain("size-4");
  });

  it("renders a stacked retry action and optional secondary action", () => {
    const onRetry = vi.fn();
    const { getByRole } = render(
      <RetryState
        title="Calendar unavailable"
        message="The latest dates could not be loaded."
        onRetry={onRetry}
        secondaryAction={<a href="/tools">Open tools</a>}
      />,
    );
    expect(getByRole("alert").textContent).toContain("Calendar unavailable");
    expect(getByRole("link", { name: "Open tools" })).not.toBeNull();
    fireEvent.click(getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
