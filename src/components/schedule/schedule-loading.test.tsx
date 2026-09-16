// @vitest-environment happy-dom
import { AVATAR_COLORS } from "@/src/lib/schedule/avatar";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  it("matches the shared Group field label height and control gap", () => {
    const { container } = render(<ScheduleControlsSkeleton label="Loading controls" includeGroup />);
    const label = container.querySelector(".h-4.w-16");
    expect(label).not.toBeNull();
    expect(label?.parentElement?.className).toContain("gap-1.5");
    expect(label?.parentElement?.className).toContain("py-4");
    expect(label?.nextElementSibling?.className).toContain("h-11");
    expect(container.querySelectorAll(".rounded-xl")).toHaveLength(0);
  });
});

describe("ScheduleProfileSkeleton", () => {
  it("keeps profile geometry and title without exposing fake form controls", () => {
    render(<ScheduleProfileSkeleton title="Replace your schedule" onCancel={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "Replace your schedule" });
    expect(dialog.className).toContain("max-w-md");
    expect(dialog.className).toContain("p-0");
    expect(dialog.className).toContain("overflow-hidden");
    const body = dialog.querySelector("[data-dialog-scroll]");
    const heading = within(dialog).getByRole("heading", { name: "Replace your schedule" });
    expect(body?.contains(heading)).toBe(false);
    expect(body?.className).toContain("space-y-4");
    const summary = within(dialog).getByRole("status", { name: "Loading schedule profile" });
    expect(summary.parentElement).toBe(body);
    expect(summary.className).toContain("p-3");
    expect(summary.querySelector("[data-skeleton]")).toBeTruthy();
    expect(within(dialog).getByRole("status", { name: "Loading handle field" }).parentElement).toBe(body);
    const avatarChoices = within(dialog).getByRole("status", { name: "Loading avatar choices" });
    expect(avatarChoices.parentElement).toBe(body);
    const palette = avatarChoices.querySelector(".flex-wrap");
    expect(palette?.children).toHaveLength(AVATAR_COLORS.length);
    for (const target of palette?.children ?? []) {
      expect(target.className).toContain("size-11");
      expect(target.className).toContain("sm:size-8");
      expect(target.firstElementChild?.className).toContain("size-6");
    }
    expect(within(dialog).getAllByRole("button")).toHaveLength(1);
    expect(dialog.querySelector("input, select, textarea")).toBeNull();
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    expect(body?.contains(cancel)).toBe(false);
    expect(cancel.closest("footer")?.className).toContain("shrink-0");
    expect(cancel.parentElement?.className).not.toContain("mt-6");
    expect(cancel.nextElementSibling?.classList.contains("rounded-lg")).toBe(true);
    for (const skeleton of dialog.querySelectorAll("[data-skeleton]")) {
      expect(skeleton.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it.each(["emoji", "image"] as const)("reserves the %s avatar picker content", (avatarKind) => {
    render(<ScheduleProfileSkeleton title="Replace your schedule" avatarKind={avatarKind} onCancel={vi.fn()} />);
    const avatar = screen.getByRole("status", { name: "Loading avatar choices" });
    const blocks = Array.from(avatar.querySelectorAll("[data-skeleton]"));
    expect(blocks.some((block) => block.className.includes(avatarKind === "emoji" ? "h-40" : "sm:h-10"))).toBe(true);
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
