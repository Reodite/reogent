// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduleControlsSkeleton, ScheduleProfileSkeleton } from "./schedule-loading";

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

describe("ScheduleControlsSkeleton", () => {
  it("announces loading controls", () => {
    render(<ScheduleControlsSkeleton label="Loading controls" includeGroup />);
    expect(screen.getByRole("status", { name: "Loading controls" })).toBeTruthy();
  });
});

describe("ScheduleProfileSkeleton", () => {
  it("announces profile loading without exposing fake form controls", () => {
    render(<ScheduleProfileSkeleton title="Replace your schedule" onCancel={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Replace your schedule" })).toBeTruthy();
    expect(screen.getByRole("status", { name: "Loading schedule profile" })).toBeTruthy();
    expect(screen.getByRole("status", { name: "Loading handle field" })).toBeTruthy();
    expect(screen.getByRole("status", { name: "Loading avatar choices" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
    expect(document.querySelector("input, select, textarea")).toBeNull();
  });

  it.each(["emoji", "image"] as const)("announces loading for %s avatar choices", (avatarKind) => {
    render(<ScheduleProfileSkeleton title="Replace your schedule" avatarKind={avatarKind} onCancel={vi.fn()} />);
    expect(screen.getByRole("status", { name: "Loading avatar choices" })).toBeTruthy();
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
