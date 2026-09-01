// @vitest-environment happy-dom

import { buildScheduleGrid } from "@/src/lib/schedule/grid";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduleGrid } from "./schedule-grid";

afterEach(cleanup);

describe("ScheduleGrid", () => {
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
      <ScheduleGrid model={model} activeDay="Tue" onActiveDayChange={vi.fn()} onBlockActivate={onBlockActivate} />,
    );

    const blocks = view.getAllByRole("button", { name: /CPSC 110 101/ });
    expect(blocks).toHaveLength(2);
    fireEvent.click(blocks[1]);
    expect(onBlockActivate).toHaveBeenCalledWith("cpsc-110-101");
  });
});
