// @vitest-environment happy-dom
import type { MergedBlock } from "@/src/lib/schedule/calendar/buildCalendar";
import type { MeetingPattern } from "@/src/lib/schedule/types";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockDetail } from "./block-detail";

const meeting: MeetingPattern = {
  days: ["Mon", "Wed"],
  startMin: 570,
  endMin: 630,
  buildingName: "Hugh Dempster Pavilion",
  buildingCode: "DMP",
  floor: "3",
  room: "301",
  raw: "",
};

const block: MergedBlock = {
  key: "cpsc-221-mon",
  day: "Mon",
  startMin: meeting.startMin,
  endMin: meeting.endMin,
  section: {
    id: "cpsc-221",
    courseCode: "CPSC_V 221",
    title: "Basic Algorithms and Data Structures",
    component: "Lecture",
    instructors: ["Ada Lovelace", "Grace Hopper"],
    termStart: "2026-09-01",
    termEnd: "2026-12-15",
    meetings: [meeting, { ...meeting, room: "302" }],
  },
  pattern: meeting,
  rooms: ["301", "302"],
  people: Array.from({ length: 40 }, (_, index) => ({
    id: `student-${index}`,
    handle: `Student ${index + 1}`,
    avatar: { kind: "initials", initials: "ST", color: "#4d9de0" },
    schedule: null,
    updatedAt: "2026-09-01T00:00:00Z",
    enabled: true,
  })),
  col: 0,
  cols: 1,
};

afterEach(cleanup);

describe("BlockDetail", () => {
  it("keeps the title and Close outside the keyboard-scrollable details", () => {
    render(<BlockDetail block={block} onClose={vi.fn()} />);

    const panel = screen.getByRole("dialog", { name: "CPSC 221" });
    const body = screen.getByRole("region", { name: "Course facts and roster" });
    const header = panel.querySelector("[data-dialog-header]")!;
    const actions = panel.querySelector("[data-dialog-actions]")!;
    const footer = actions.closest("footer");
    const close = screen.getByRole("button", { name: "Close", exact: true });

    expect(body.parentElement).toBe(panel);
    expect(body.classList.contains("min-h-0")).toBe(true);
    expect(body.classList.contains("overflow-y-auto")).toBe(true);
    expect(body.classList.contains("p-4")).toBe(true);
    expect(body.classList.contains("sm:px-6")).toBe(true);
    expect(body.hasAttribute("data-dialog-scroll")).toBe(true);
    expect(body.getAttribute("tabindex")).toBe("0");
    expect(body.contains(header)).toBe(false);
    expect(body.contains(close)).toBe(false);
    expect(header.parentElement).toBe(panel);
    expect(header.classList.contains("shrink-0")).toBe(true);
    expect(footer?.parentElement).toBe(panel);
    expect(footer?.classList.contains("shrink-0")).toBe(true);
    expect(footer?.classList.contains("px-4")).toBe(true);
    expect(footer?.classList.contains("pb-4")).toBe(true);
    expect(footer?.classList.contains("sm:px-6")).toBe(true);
    expect(footer?.classList.contains("sm:pb-6")).toBe(true);
    expect(actions.classList.contains("mt-6")).toBe(false);
    expect(panel.classList.contains("p-0")).toBe(true);
    expect(panel.classList.contains("flex")).toBe(true);
    expect(panel.classList.contains("flex-col")).toBe(true);
    expect(panel.classList.contains("overflow-hidden")).toBe(true);
    expect(panel.classList.contains("[:where(&)]:max-h-full")).toBe(true);

    body.focus();
    expect(document.activeElement).toBe(body);
  });

  it("preserves the roster and course facts without duplicate meeting slots", () => {
    render(<BlockDetail block={block} onClose={vi.fn()} />);

    expect(screen.getByRole("heading").textContent).toBe("CPSC 221 — Basic Algorithms and Data Structures");
    expect(screen.getByText(/^Lecture/).textContent).toContain(" → ");
    expect(screen.getByText("Ada Lovelace, Grace Hopper")).toBeTruthy();
    expect(screen.getAllByText("Mon Wed 9:30 AM–10:30 AM")).toHaveLength(1);
    const where = screen.getByText("Where").nextElementSibling!;
    expect(where.textContent).toBe("Hugh Dempster Pavilion (DMP) · floor 3 · rooms 301, 302");
    const roster = screen.getByText("Who").nextElementSibling as HTMLElement;
    expect(within(roster).getAllByText(/^Student \d+$/)).toHaveLength(block.people.length);
  });

  it.each(["Close", "backdrop", "Escape"])("focuses Close and preserves %s dismissal", async (action) => {
    const onClose = vi.fn();
    render(<BlockDetail block={block} onClose={onClose} />);

    const close = screen.getByRole("button", { name: "Close", exact: true });
    expect(close.hasAttribute("data-dialog-initial-focus")).toBe(true);
    await waitFor(() => expect(document.activeElement).toBe(close));
    if (action === "Escape") fireEvent.keyDown(document, { key: "Escape" });
    else fireEvent.click(action === "Close" ? close : screen.getByRole("button", { name: "Close course details" }));

    expect(onClose).toHaveBeenCalledOnce();
  });
});
