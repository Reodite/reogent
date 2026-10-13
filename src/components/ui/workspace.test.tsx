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
    const scroller = page?.querySelector("[data-workspace-scroll]");
    expect(page?.className).toContain("overflow-hidden");
    expect(scroller?.className).toContain("overflow-y-auto");
    expect(scroller?.contains(page?.querySelector("[data-workspace-header]") ?? null)).toBe(false);
    expect(scroller?.contains(page?.querySelector("[data-workspace-toolbar]") ?? null)).toBe(true);
    expect(page?.querySelector(".workspace-page-layout")?.className).toContain("min-h-min");
    expect(page?.querySelector(".workspace-page-body")?.className).toContain("min-h-80");
    const heading = page?.querySelector("[data-workspace-heading]");
    expect(heading?.querySelector("h1")?.textContent).toBe("Degree Planner");
    expect(heading?.contains(page?.querySelector("[data-workspace-toolbar]") ?? null)).toBe(false);
    expect(page?.querySelectorAll("[data-workspace-panel]")).toHaveLength(2);
    expect(page?.querySelector("[data-workspace-panel-body]")?.classList.contains("p-4")).toBe(true);
    expect(screen.getByRole("button", { name: "Plan" }).classList.contains("rounded-sm")).toBe(true);
    const canvas = page?.querySelector("[data-workspace-canvas]");
    expect(canvas?.className).toContain("p-4");
    expect(canvas?.className).toContain("rounded-2xl");
    for (const panel of page?.querySelectorAll("[data-workspace-panel]") ?? []) {
      expect(panel.classList.contains("rounded-2xl")).toBe(true);
    }
    expect(canvas?.className).toContain("neu-inset");
    expect(canvas?.className).toContain("neu-shadow-on-surface");
    expect(canvas?.className).not.toContain("border-border");
    expect(page?.querySelector("[data-workspace-actions]")?.className).toContain("w-full");
    expect(page?.querySelector("[data-workspace-actions]")?.className).toContain("@min-[55rem]:w-auto");
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
    expect(leading?.className).toContain("flex h-7");
    expect(leading?.classList.contains("items-center")).toBe(true);
    const title = leading?.nextElementSibling?.querySelector("h1");
    expect(title?.classList.contains("min-h-7")).toBe(true);
    expect(title?.className).not.toContain("sm:min-h-0");
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
    expect(panel?.querySelector("header")?.className).toContain("min-h-15");
    expect(panel?.querySelector("header button + div h2")?.textContent).toBe("Controls");
    expect(panel?.querySelector("header > div")?.className).toContain("gap-1.5");
    expect(panelBody?.className).toContain("overflow-hidden");
    expect(panelBody?.className).toContain("p-0");
  });
});
