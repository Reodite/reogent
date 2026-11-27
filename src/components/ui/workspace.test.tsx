// @vitest-environment happy-dom
import { WorkspaceHostProvider } from "@/src/components/shell/workspace-host";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  it("owns one restrictive split structure without nesting a main landmark", () => {
    const { container } = render(
      <WorkspaceHostProvider host="tools">
        <SplitWorkspace />
      </WorkspaceHostProvider>,
    );
    const page = container.querySelector<HTMLElement>("[data-workspace-page]");
    expect(page?.dataset.workspaceComposition).toBe("split");
    expect(page?.dataset.workspaceHost).toBe("tools");
    expect(page?.querySelector("h1")?.textContent).toBe("Degree Planner");
    expect(page?.querySelectorAll("main")).toHaveLength(0);
    const heading = page?.querySelector("[data-workspace-heading]");
    expect(heading?.querySelector("h1")?.textContent).toBe("Degree Planner");
    expect(page?.querySelectorAll("[data-workspace-panel]")).toHaveLength(2);
    const actions = page?.querySelector("[data-workspace-actions]");
    expect(heading?.contains(actions ?? null)).toBe(true);
  });

  it("keeps header navigation available while pending task controls stay inert", () => {
    navigationState.pending = true;
    const { container } = render(
      <WorkspaceHostProvider host="tools" navigation={<button type="button">Open sidebar</button>}>
        <SplitWorkspace />
      </WorkspaceHostProvider>,
    );
    const menu = screen.getByRole("button", { name: "Open sidebar" });
    expect(menu.closest("[data-workspace-heading]")).not.toBeNull();
    expect(menu.closest("[inert]")).toBeNull();
    expect(screen.getByRole("button", { name: "Autofill" }).closest("[inert]")).not.toBeNull();
    expect(container.querySelector(".workspace-page-body")?.hasAttribute("inert")).toBe(true);
  });

  it("keeps both compact regions mounted while callers own the active view", () => {
    const { container } = render(<SplitWorkspace />);
    expect(screen.getByRole("button", { name: "Plan" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Requirements and courses" }));
    expect(screen.getByRole("button", { name: "Requirements and courses" }).getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[data-workspace-region='main']")).not.toBeNull();
    expect(container.querySelector("[data-workspace-region='rail']")).not.toBeNull();
  });

  it("moves focus to the selected compact toggle when a focused region hides", () => {
    render(<ProgrammaticWorkspace />);
    const trigger = screen.getByRole("button", { name: "Show courses" });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole("button", { name: "Courses" }).getAttribute("aria-pressed")).toBe("true");
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

  it("portals page actions into the Answer Canvas titlebar when no bounded variant exists", () => {
    const outlet = document.createElement("div");
    document.body.append(outlet);
    const { container } = render(
      <WorkspaceHostProvider host="answer-canvas" titlebarOutlet={outlet}>
        <WorkspacePage composition="canvas" title="Calendar" actions={<button type="button">Ask AI</button>}>
          <WorkspaceCanvas>Month</WorkspaceCanvas>
        </WorkspacePage>
      </WorkspaceHostProvider>,
    );

    expect(container.querySelector("[data-workspace-actions]")).toBeNull();
    expect(outlet.querySelector("button")?.textContent).toBe("Ask AI");
    outlet.remove();
  });

  it("renders accessible page-leading navigation and title", () => {
    render(
      <WorkspacePage
        composition="canvas"
        title="Course lookup"
        leading={<button aria-label="Back to results" type="button" />}
      >
        Details
      </WorkspacePage>,
    );
    expect(screen.getByRole("button", { name: "Back to results" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Course lookup" })).toBeTruthy();
  });

  it("renders panel content and leading action", () => {
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
    expect(within(panel as HTMLElement).getByRole("heading", { name: "Controls" })).not.toBeNull();
    expect(screen.getByText("Body")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Back to controls" })).toBeTruthy();
  });
});
