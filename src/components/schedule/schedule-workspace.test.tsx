// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduleWorkspace } from "./schedule-workspace";

afterEach(cleanup);

function workspace() {
  return (
    <ScheduleWorkspace
      title="Course schedule"
      description="Build a conflict-aware week."
      toolbar={<div data-testid="toolbar">Terms</div>}
      actions={<button type="button">Share</button>}
      controlsLabel="Courses"
      controls={<div data-testid="controls">Controls</div>}
      mobileView="schedule"
      onMobileViewChange={vi.fn()}
    >
      <div data-testid="canvas">Week</div>
    </ScheduleWorkspace>
  );
}

describe("ScheduleWorkspace", () => {
  it("uses the Answer Canvas titlebar without duplicating its title or description", () => {
    const { container } = render(
      <section data-pane="schedule">
        <header>
          <h2>Course schedule</h2>
          <div data-pane-titlebar-slot />
        </header>
        {workspace()}
      </section>,
    );

    const root = container.querySelector<HTMLElement>("[data-schedule-host]");
    const slot = container.querySelector<HTMLElement>("[data-pane-titlebar-slot]");

    expect(root?.dataset.scheduleHost).toBe("answer-canvas");
    expect(root?.querySelector("[data-schedule-header]")).toBeNull();
    expect(container.querySelectorAll("h1, h2")).toHaveLength(1);
    expect(screen.queryByText("Build a conflict-aware week.")).toBeNull();
    expect(slot?.querySelector("[data-schedule-header]")).not.toBeNull();
    expect(slot?.querySelector("[data-testid='toolbar']")).not.toBeNull();
    expect(slot?.querySelector("button")?.textContent).toBe("Share");
  });

  it("renders a full-bleed Tools header aligned to the workspace columns", () => {
    const { container } = render(workspace());
    const root = container.querySelector<HTMLElement>("[data-schedule-host]");
    const header = root?.querySelector<HTMLElement>("[data-schedule-header]");
    const context = header?.querySelector("[data-schedule-header-context]");
    const canvas = header?.querySelector("[data-schedule-header-canvas]");

    expect(root?.dataset.scheduleHost).toBe("tools");
    expect(header?.className).toContain("grid-cols-[18rem_minmax(0,1fr)]");
    expect(header?.className).toContain("gap-6");
    expect(context?.querySelector("h1")?.textContent).toBe("Course schedule");
    expect(canvas?.querySelector("[data-testid='toolbar']")).not.toBeNull();
    expect(canvas?.querySelector("[data-schedule-actions] button")?.textContent).toBe("Share");
  });

  it("detects the Unity host for host-specific compact-menu clearance", () => {
    const { container } = render(<main data-pane="unity">{workspace()}</main>);
    const root = container.querySelector<HTMLElement>("[data-schedule-host]");

    expect(root?.dataset.scheduleHost).toBe("unity");
    expect(root?.querySelector("[data-schedule-header]")?.className).not.toContain("max-xl:pl-12");
  });

  it("leaves the aside and canvas as plain layout regions", () => {
    const { container } = render(workspace());
    const aside = container.querySelector<HTMLElement>("[data-schedule-aside]");
    const canvas = container.querySelector<HTMLElement>("[data-schedule-canvas]");
    const body = aside?.parentElement;

    expect(body?.className).toContain("grid-cols-[18rem_minmax(0,1fr)]");
    expect(body?.className).toContain("gap-6");
    expect(aside?.className).not.toMatch(/neu-|bg-|border|rounded|shadow|overflow/);
    expect(canvas?.className).not.toMatch(/neu-|bg-|border|rounded|shadow/);
    expect(aside?.querySelector("[data-testid='controls']")).not.toBeNull();
    expect(canvas?.querySelector("[data-testid='canvas']")).not.toBeNull();
  });
});
