// @vitest-environment happy-dom
import { WorkspaceHostProvider } from "@/src/components/shell/workspace-host";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceCanvas, WorkspacePage, WorkspacePanel, WorkspaceRail, type WorkspaceView } from "./workspace";

const navigationState = vi.hoisted(() => ({ pending: false }));
vi.mock("@/src/components/shell/shell-navigation", () => ({ useShellNavigation: () => navigationState }));

afterEach(() => {
  cleanup();
  navigationState.pending = false;
});

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
  it("renders the page title without nesting a main landmark", () => {
    const { container } = render(
      <WorkspaceHostProvider host="tools">
        <SplitWorkspace />
      </WorkspaceHostProvider>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Degree Planner" })).not.toBeNull();
    expect(container.querySelectorAll("main")).toHaveLength(0);
  });

  it("keeps header navigation available while pending task controls stay inert", () => {
    navigationState.pending = true;
    const { container } = render(
      <WorkspaceHostProvider host="tools" navigation={<button type="button">Open sidebar</button>}>
        <SplitWorkspace />
      </WorkspaceHostProvider>,
    );
    const menu = screen.getByRole("button", { name: "Open sidebar" });
    expect(menu.closest("[inert]")).toBeNull();
    expect(screen.getByRole("button", { name: "Autofill" }).closest("[inert]")).not.toBeNull();
    expect(container.querySelector(".workspace-page-body")?.hasAttribute("inert")).toBe(true);
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
      <WorkspaceHostProvider host="answer-canvas" titlebarOutlet={outlet}>
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

  it("renders page-leading navigation and the title", () => {
    render(
      <WorkspacePage
        composition="canvas"
        title="Course lookup"
        leading={<button aria-label="Back to results" type="button" />}
      >
        Details
      </WorkspacePage>,
    );
    expect(screen.getByRole("button", { name: "Back to results" })).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "Course lookup" })).not.toBeNull();
  });

  it("renders panel navigation and its heading", () => {
    render(
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
    expect(screen.getByRole("button", { name: "Back to controls" })).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Controls" })).not.toBeNull();
  });
});
