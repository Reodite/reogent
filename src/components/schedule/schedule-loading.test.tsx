// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduleProfileSkeleton } from "./schedule-loading";

afterEach(cleanup);

function ProfileLoadingHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Import schedule
      </button>
      {open ? <ScheduleProfileSkeleton title="Who is this schedule for?" onCancel={() => setOpen(false)} /> : null}
    </>
  );
}

describe("ScheduleProfileSkeleton", () => {
  it("exposes only cancellation while profile controls load", () => {
    render(<ScheduleProfileSkeleton title="Replace your schedule" onCancel={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Replace your schedule" });
    expect(within(dialog).getAllByRole("button")).toHaveLength(1);
    expect(dialog.querySelector("input, select, textarea")).toBeNull();
    for (const skeleton of dialog.querySelectorAll("[data-skeleton]")) {
      expect(skeleton.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it.each(["Escape", "Cancel", "backdrop"])("dismisses with %s and restores the import trigger", async (method) => {
    render(<ProfileLoadingHarness />);
    const trigger = screen.getByRole("button", { name: "Import schedule" });
    trigger.focus();
    fireEvent.click(trigger);
    const cancel = screen.getByRole("button", { name: "Cancel" });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    fireEvent.keyDown(cancel, { key: "Tab" });
    expect(document.activeElement).toBe(cancel);
    if (method === "Escape") fireEvent.keyDown(cancel, { key: "Escape" });
    else
      fireEvent.click(method === "Cancel" ? cancel : screen.getByRole("button", { name: "Cancel schedule profile" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
