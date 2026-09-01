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

    const blocks = view.getAllByRole("button", { name: /CPSC 110.*101/ });
    expect(blocks).toHaveLength(2);
    fireEvent.click(blocks[1]);
    expect(onBlockActivate).toHaveBeenCalledWith("cpsc-110-101");
  });

  it("uses compact and tall block anatomy without repeating timetable metadata", () => {
    const model = buildScheduleGrid([
      {
        id: "short",
        courseKey: "CPSC 110",
        code: "CPSC 110",
        title: "Computation, Programs, and Programming",
        section: "L1A",
        component: "Lab",
        days: ["Mon"],
        startMin: 570,
        endMin: 600,
        meta: "ICCS X150",
      },
      {
        id: "tall",
        courseKey: "MATH 100",
        code: "MATH 100",
        title: "Differential Calculus",
        section: "101",
        component: "Lecture",
        days: ["Tue"],
        startMin: 600,
        endMin: 660,
      },
    ]);
    const view = render(
      <ScheduleGrid model={model} activeDay="Mon" onActiveDayChange={vi.fn()} onBlockActivate={vi.fn()} />,
    );
    const short = view.getByRole("button", { name: /CPSC 110.*L1A.*Lab/ });
    const tall = view.getByRole("button", { name: /MATH 100.*101.*Lecture/ });

    expect(short.getAttribute("data-block-layout")).toBe("compact");
    expect(short.textContent).toBe("CPSC 110· L1A· Lab");
    expect(short.textContent).not.toContain("9:30");
    expect(short.textContent).not.toContain("Computation");
    expect(tall.getAttribute("data-block-layout")).toBe("tall");
    expect(tall.textContent).toBe("MATH 100101·Lecture");
  });

  it("does not fabricate a section code for sharer blocks", () => {
    const model = buildScheduleGrid([
      {
        id: "shared",
        courseKey: "CPSC 210",
        code: "CPSC 210",
        title: "Software Construction",
        component: "Laboratory",
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
    expect(block.textContent).not.toContain("lab · Laboratory");
  });

  it("shows block footer content only when the meeting is tall enough", () => {
    const model = buildScheduleGrid([
      {
        id: "short-footer",
        courseKey: "CPSC 110",
        code: "CPSC 110",
        title: "Short",
        section: "101",
        component: "Lecture",
        days: ["Mon"],
        startMin: 540,
        endMin: 600,
      },
      {
        id: "tall-footer",
        courseKey: "CPSC 210",
        code: "CPSC 210",
        title: "Tall",
        section: "102",
        component: "Lecture",
        days: ["Tue"],
        startMin: 540,
        endMin: 630,
      },
    ]);
    const view = render(
      <ScheduleGrid
        model={model}
        activeDay="Mon"
        onActiveDayChange={vi.fn()}
        onBlockActivate={vi.fn()}
        renderBlockFooter={(block) => <span>{block.id} avatar</span>}
      />,
    );

    expect(view.queryByText("short-footer avatar")).toBeNull();
    expect(view.getByText("tall-footer avatar")).toBeTruthy();
    expect(view.container.querySelector("[data-schedule-grid-frame]")?.className).toContain("rounded-[0.625rem]");
  });
});
