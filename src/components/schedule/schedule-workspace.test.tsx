// @vitest-environment happy-dom
import { WorkspaceHostProvider } from "@/src/components/shell/workspace-host";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScheduleWorkspace } from "./schedule-workspace";

afterEach(cleanup);

function workspace(onMobileViewChange = vi.fn()) {
  return (
    <ScheduleWorkspace
      title="Course schedule"
      description="Build a conflict-aware week."
      toolbar={<div data-testid="toolbar">Terms</div>}
      actions={<button type="button">Share</button>}
      controlsLabel="Courses"
      controls={<div data-testid="controls">Controls</div>}
      mobileView="schedule"
      onMobileViewChange={onMobileViewChange}
    >
      <div data-testid="canvas">Week</div>
    </ScheduleWorkspace>
  );
}

describe("ScheduleWorkspace", () => {
  it("uses the Answer Canvas titlebar only for its bounded action", () => {
    const outlet = document.createElement("div");
    document.body.append(outlet);
    const { container } = render(
      <WorkspaceHostProvider host="answer-canvas" menuClearance={false} titlebarOutlet={outlet}>
        {workspace()}
      </WorkspaceHostProvider>,
    );

    expect(container.querySelector("h1")).toBeNull();
    expect(container.querySelector("[data-testid='toolbar']")).not.toBeNull();
    expect(outlet.querySelector("button")?.textContent).toBe("Share");
    expect(container.textContent).not.toContain("Build a conflict-aware week.");
    outlet.remove();
  });

  it("adapts schedules to the shared 20rem rail panel and inset canvas", () => {
    const { container } = render(workspace());
    const root = container.querySelector<HTMLElement>("[data-workspace-page]");
    const rail = container.querySelector<HTMLElement>("[data-workspace-region='rail']");
    const canvas = container.querySelector<HTMLElement>("[data-workspace-canvas]");

    expect(root?.dataset.workspaceHost).toBe("tools");
    expect(root?.dataset.workspaceComposition).toBe("split");
    expect(root?.querySelector("h1")?.textContent).toBe("Course schedule");
    expect(rail?.querySelector("[data-workspace-panel]")).not.toBeNull();
    expect(rail?.querySelector("[data-testid='controls']")).not.toBeNull();
    expect(canvas?.className).toContain("bg-surface-container-low/40");
    expect(canvas?.className).toContain("p-2");
    expect(canvas?.querySelector("[data-testid='canvas']")).not.toBeNull();
  });

  it("maps the shared compact view controls to schedule terminology", () => {
    const onChange = vi.fn();
    render(workspace(onChange));
    fireEvent.click(screen.getByRole("button", { name: "Courses" }));
    expect(onChange).toHaveBeenCalledWith("controls");
  });

  it("preserves an explicit Unity host from the shell", () => {
    const { container } = render(
      <WorkspaceHostProvider host="unity" menuClearance>
        {workspace()}
      </WorkspaceHostProvider>,
    );
    expect(container.querySelector<HTMLElement>("[data-workspace-page]")?.dataset.workspaceHost).toBe("unity");
  });
});
