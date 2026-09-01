// @vitest-environment happy-dom
import { WorkspaceHostProvider } from "@/src/components/shell/workspace-host";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceCanvas, WorkspacePage, WorkspacePanel, WorkspaceRail, type WorkspaceView } from "./workspace";

afterEach(cleanup);

function SplitWorkspace() {
  const [view, setView] = useState<WorkspaceView>("main");
  return (
    <WorkspacePage
      composition="split"
      title="Degree Planner"
      description="Plan term by term."
      toolbar={<div>Program controls</div>}
      actions={<button type="button">Autofill</button>}
      mainLabel="Plan"
      railLabel="Requirements and courses"
      view={view}
      onViewChange={setView}
      rail={
        <WorkspaceRail>
          <WorkspacePanel title="Requirements">Checklist</WorkspacePanel>
          <WorkspacePanel title="Find courses">Search</WorkspacePanel>
        </WorkspaceRail>
      }
    >
      <WorkspaceCanvas aria-label="Degree plan" padding="md">
        Board
      </WorkspaceCanvas>
    </WorkspacePage>
  );
}

function ProgrammaticWorkspace() {
  const [view, setView] = useState<WorkspaceView>("rail");
  return (
    <WorkspacePage
      composition="split"
      title="Course lookup"
      mainLabel="Courses"
      railLabel="Filters"
      view={view}
      onViewChange={setView}
      rail={
        <button type="button" onClick={() => setView("main")}>
          Show courses
        </button>
      }
    >
      Results
    </WorkspacePage>
  );
}

describe("WorkspacePage", () => {
  it("owns one restrictive split structure without nesting a main landmark", () => {
    const { container } = render(
      <WorkspaceHostProvider host="tools" menuClearance>
        <SplitWorkspace />
      </WorkspaceHostProvider>,
    );
    const page = container.querySelector<HTMLElement>("[data-workspace-page]");
    expect(page?.dataset.workspaceComposition).toBe("split");
    expect(page?.dataset.workspaceHost).toBe("tools");
    expect(page?.querySelector("h1")?.textContent).toBe("Degree Planner");
    expect(page?.querySelectorAll("main")).toHaveLength(0);
    expect(page?.querySelectorAll("[data-workspace-panel]")).toHaveLength(2);
    expect(page?.querySelector("[data-workspace-canvas]")?.className).toContain("p-4");
  });

  it("keeps both compact regions mounted while callers own the active view", () => {
    const { container } = render(<SplitWorkspace />);
    expect(container.querySelector("[data-workspace-page]")?.getAttribute("data-workspace-view")).toBe("main");
    fireEvent.click(screen.getByRole("button", { name: "Requirements and courses" }));
    expect(container.querySelector("[data-workspace-page]")?.getAttribute("data-workspace-view")).toBe("rail");
    expect(container.querySelector("[data-workspace-region='main']")).not.toBeNull();
    expect(container.querySelector("[data-workspace-region='rail']")).not.toBeNull();
  });

  it("moves focus to the selected compact toggle when a focused region hides", () => {
    const { container } = render(<ProgrammaticWorkspace />);
    const trigger = screen.getByRole("button", { name: "Show courses" });
    trigger.focus();
    fireEvent.click(trigger);

    expect(container.querySelector("[data-workspace-page]")?.getAttribute("data-workspace-view")).toBe("main");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Courses" }));
  });

  it("suppresses duplicate titles immediately and portals only bounded titlebar actions", () => {
    const outlet = document.createElement("div");
    document.body.append(outlet);
    const { container } = render(
      <WorkspaceHostProvider host="answer-canvas" menuClearance={false} titlebarOutlet={outlet}>
        <WorkspacePage
          composition="canvas"
          title="Calendar"
          toolbar={<div data-testid="toolbar">Month controls</div>}
          actions={<button type="button">Full action</button>}
          titlebarActions={<button type="button">Ask AI</button>}
        >
          <WorkspaceCanvas>Month</WorkspaceCanvas>
        </WorkspacePage>
      </WorkspaceHostProvider>,
    );

    expect(container.querySelector("h1")).toBeNull();
    expect(screen.getByTestId("toolbar")).not.toBeNull();
    expect(container.textContent).not.toContain("Full action");
    expect(outlet.querySelector("button")?.textContent).toBe("Ask AI");
    outlet.remove();
  });

  it("fixes panel material, header height, body scrolling, and canvas overflow variants", () => {
    const { container } = render(
      <WorkspaceRail>
        <WorkspacePanel title="Controls" bodyMode="contained" padding="none">
          Body
        </WorkspacePanel>
      </WorkspaceRail>,
    );
    const panel = container.querySelector("[data-workspace-panel]");
    const panelBody = container.querySelector("[data-workspace-panel-body]");
    expect(panel?.className).toContain("neu-panel");
    expect(panel?.querySelector("header")?.className).toContain("h-12");
    expect(panelBody?.className).toContain("overflow-hidden");
    expect(panelBody?.className).toContain("p-0");
  });
});
