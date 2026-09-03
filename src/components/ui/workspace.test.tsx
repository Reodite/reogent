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
    const canvas = page?.querySelector("[data-workspace-canvas]");
    expect(canvas?.className).toContain("p-4");
    expect(canvas?.className).toContain("neu-inset");
    expect(canvas?.className).toContain("neu-shadow-on-surface");
    expect(canvas?.className).not.toContain("border-border");
    expect(page?.querySelector("[data-workspace-actions]")?.className).toContain("w-full");
    expect(page?.querySelector("[data-workspace-actions]")?.className).toContain("@min-[55rem]:w-auto");
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

  it("renders page-leading navigation immediately before the title", () => {
    const { container } = render(
      <WorkspacePage
        composition="canvas"
        title="Course lookup"
        leading={<button aria-label="Back to results" type="button" />}
      >
        Details
      </WorkspacePage>,
    );
    const leading = container.querySelector("[data-workspace-leading]");
    expect(leading?.querySelector("button")?.textContent).toBe("");
    expect(leading?.parentElement?.className).toContain("gap-1.5");
    expect(leading?.nextElementSibling?.querySelector("h1")?.textContent).toBe("Course lookup");
  });

  it("fixes panel material, header height, body scrolling, and canvas overflow variants", () => {
    const { container } = render(
      <WorkspaceRail>
        <WorkspacePanel
          title="Controls"
          leading={<button aria-label="Back to controls" type="button" />}
          bodyMode="contained"
          padding="none"
        >
          Body
        </WorkspacePanel>
      </WorkspaceRail>,
    );
    const panel = container.querySelector("[data-workspace-panel]");
    const panelBody = container.querySelector("[data-workspace-panel-body]");
    expect(panel?.className).toContain("neu-panel");
    expect(panel?.hasAttribute("data-workspace-panel-leading")).toBe(true);
    expect(panel?.querySelector("header")?.className).toContain("h-12");
    expect(panel?.querySelector("header button + div h2")?.textContent).toBe("Controls");
    expect(panel?.querySelector("header > div")?.className).toContain("gap-1.5");
    expect(panelBody?.className).toContain("overflow-hidden");
    expect(panelBody?.className).toContain("p-0");
  });
});
