// @vitest-environment happy-dom

import { buildScheduleGrid } from "@/src/lib/schedule/grid";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduleGrid } from "./schedule-grid";

afterEach(cleanup);

describe("ScheduleGrid", () => {
  it("hides meetings and empty guidance while loading", () => {
    const view = render(
      <ScheduleGrid
        model={buildScheduleGrid([])}
        activeDay="Mon"
        onActiveDayChange={vi.fn()}
        onBlockActivate={vi.fn()}
        loading="Loading saved schedule"
        empty={{ title: "Empty week", description: "Add courses." }}
      />,
    );
    expect(view.getByRole("status", { name: "Loading saved schedule" })).toBeTruthy();
    expect(view.container.querySelectorAll("[data-schedule-block]")).toHaveLength(0);
    expect(view.getAllByText("Mon").length).toBeGreaterThan(0);
    expect(view.getByText("10 PM")).toBeTruthy();
    expect(view.queryByText("Empty week")).toBeNull();
    const scroller = view.getByRole("region", { name: "Timetable scroll area" });
    expect(scroller.getAttribute("tabindex")).toBe("0");
  });

  it("keeps the week visible behind an actionable empty state", () => {
    const onAction = vi.fn();
    const onActiveDayChange = vi.fn();
    const view = render(
      <ScheduleGrid
        model={buildScheduleGrid([])}
        activeDay="Mon"
        onActiveDayChange={onActiveDayChange}
        onBlockActivate={vi.fn()}
        empty={{ title: "Build your week", description: "Add a course to begin.", actionLabel: "Add course", onAction }}
      />,
    );

    expect(view.getAllByText("Mon").length).toBeGreaterThan(0);
    expect(view.getByText("9 AM")).toBeTruthy();
    fireEvent.keyDown(view.getByRole("tab", { name: "Mon" }), { key: "ArrowRight" });
    expect(onActiveDayChange).toHaveBeenCalledWith("Tue");
    fireEvent.click(view.getByRole("button", { name: "Add course" }));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it("changes the selected day without remounting blocks or losing scroll", () => {
    const model = buildScheduleGrid([
      {
        id: "course",
        courseKey: "CPSC 110",
        code: "CPSC 110",
        title: "Programming",
        days: ["Mon", "Tue"],
        startMin: 540,
        endMin: 600,
      },
    ]);
    const props = { model, onActiveDayChange: vi.fn(), onBlockActivate: vi.fn() };
    const view = render(<ScheduleGrid {...props} activeDay="Mon" />);
    const days = [...view.container.querySelectorAll("[data-schedule-day]")];
    const blocks = [...view.container.querySelectorAll<HTMLElement>("[data-schedule-block]")];
    const scroller = view.getByRole("region", { name: "Timetable scroll area" });
    scroller.scrollTop = 180;

    view.rerender(<ScheduleGrid {...props} activeDay="Tue" />);
    const nextDays = [...view.container.querySelectorAll("[data-schedule-day]")];
    nextDays.forEach((day, index) => {
      expect(day).toBe(days[index]);
    });
    const nextBlocks = [...view.container.querySelectorAll<HTMLElement>("[data-schedule-block]")];
    nextBlocks.forEach((block, index) => {
      expect(block).toBe(blocks[index]);
    });
    expect(scroller.scrollTop).toBe(180);
  });

  it("activates one logical section from any rendered day", () => {
    const onBlockActivate = vi.fn();
    const model = buildScheduleGrid([
      {
        id: "cpsc-110-101",
        courseKey: "CPSC 110",
        code: "CPSC 110",
        title: "Computation, Programs, and Programming",
        section: "101",
        days: ["Tue", "Thu"],
        startMin: 570,
        endMin: 660,
      },
    ]);
    const view = render(
      <ScheduleGrid
        model={model}
        activeDay="Tue"
        onActiveDayChange={vi.fn()}
        onBlockActivate={onBlockActivate}
        drag={{ getOptions: () => [], onDrop: vi.fn() }}
      />,
    );

    const blocks = view.getAllByRole("button", { name: /CPSC 110.*101/ });
    expect(blocks[0].getAttribute("aria-roledescription")).toBeNull();
    expect(blocks[0].getAttribute("aria-describedby")).toBeNull();
    expect(blocks).toHaveLength(2);
    fireEvent.click(blocks[1]);
    expect(onBlockActivate).toHaveBeenCalledWith("cpsc-110-101");
  });

  it("does not fabricate a section code for sharer blocks", () => {
    const model = buildScheduleGrid([
      {
        id: "shared",
        courseKey: "CPSC 210",
        code: "CPSC 210",
        title: "Software Construction",
        component: "Laboratory",
        accessibleDetails: ["People: ada, grace"],
        days: ["Thu"],
        startMin: 780,
        endMin: 900,
      },
    ]);
    const view = render(
      <ScheduleGrid model={model} activeDay="Thu" onActiveDayChange={vi.fn()} onBlockActivate={vi.fn()} />,
    );
    const block = view.getByRole("button", { name: /CPSC 210.*Laboratory/ });

    expect(block.textContent).toBe("CPSC 210Laboratory");
    expect(block.getAttribute("aria-label")).toContain("People: ada, grace");
  });
});
