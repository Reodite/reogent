// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FullPageState, LoadingStatus, RetryAlert, RetryState, sanitizePublicErrorMessage } from "./feedback";

describe("RetryAlert", () => {
  it("renders an alert and delegates retry", () => {
    const onRetry = vi.fn();
    const { getByRole } = render(<RetryAlert onRetry={onRetry}>Couldn&apos;t load courses.</RetryAlert>);
    getByRole("alert");
    const retry = getByRole("button", { name: "Retry" });

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
    expect(queryByRole("button")).toBeNull();
  });
});

describe("shared feedback states", () => {
  it("sanitizes public errors and keeps recovery actions", () => {
    const { getByRole } = render(
      <FullPageState
        alert
        fill="parent"
        title="Something went wrong"
        description={sanitizePublicErrorMessage("boom at /srv/app.ts:10:2")}
        meta="Error ID: test"
        actions={<a href="/">Go home</a>}
      />,
    );
    const alert = getByRole("alert", { name: "Something went wrong" });
    expect(alert.textContent).not.toContain("/srv/app.ts");
    expect(alert.textContent).toContain("Error ID: test");
    expect(getByRole("link", { name: "Go home" })).not.toBeNull();
  });

  it("announces the requested loading label", () => {
    const { getByRole } = render(<LoadingStatus size="md">Loading calendar…</LoadingStatus>);
    const status = getByRole("status");
    expect(status.textContent).toContain("Loading calendar…");
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
