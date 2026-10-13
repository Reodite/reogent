// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  AnswerCanvasLoading,
  ChatPanelLoading,
  NewChatLoading,
  ShellBootLoading,
  WorkspaceRouteLoading,
} from "./shell-loading";
import { WorkspaceHostProvider } from "./workspace-host";

afterEach(cleanup);

describe("shell loading surfaces", () => {
  it("matches new and existing conversation panel frames", () => {
    const { container } = render(
      <>
        <NewChatLoading />
        <ChatPanelLoading />
      </>,
    );
    const newChat = container.querySelector("[data-new-chat-loading]");
    const history = container.querySelector("[data-chat-loading]");
    expect(newChat?.className).toContain("h-full");
    expect(history?.className).toContain("h-full");
    expect(newChat?.className).toContain("workspace-surface");
    expect(history?.className).toContain("workspace-surface");
    expect(newChat?.className).not.toContain("neu-panel");
    expect(newChat?.querySelector("header")?.className).toContain("h-15");
    expect(history?.querySelector("header")?.className).toContain("h-15");
    expect(history?.querySelector("header")?.className).not.toContain("border-b");
    expect(newChat?.querySelector(".chat-message-well")).not.toBeNull();
  });

  it("reserves workspace and answer-canvas geometry", () => {
    const view = render(
      <>
        <WorkspaceRouteLoading composition="split" controls />
        <AnswerCanvasLoading />
      </>,
    );
    const workspace = view.container.querySelector("[data-workspace-route-loading]");
    expect(workspace?.className).toContain("h-full");
    expect(workspace?.getAttribute("data-workspace-composition")).toBe("split");
    expect(workspace?.querySelector("[data-workspace-view-toggle]")).not.toBeNull();
    const controls = workspace?.querySelector("[data-workspace-loading-controls]");
    expect(controls?.className).toContain("grid-cols-[minmax(0,3fr)_minmax(0,2fr)]");
    expect(controls?.firstElementChild?.className).not.toContain("max-w-3/5");
    expect(workspace?.querySelector("[data-workspace-region='rail']")).not.toBeNull();
    expect(workspace?.querySelector("[data-workspace-region='main']")).not.toBeNull();
    const answerCanvas = view.container.querySelector("[data-answer-canvas-loading]");
    expect(answerCanvas?.className).toContain("h-full");
    expect(answerCanvas?.querySelector("header")?.className).toContain("h-15");
    expect(answerCanvas?.querySelector("header")?.className).not.toContain("border-b");
    expect(answerCanvas?.querySelector("header")?.firstElementChild?.className).toContain("size-7");
  });

  it("shares header navigation, padding, and inert compact placeholders with workspaces", () => {
    const { container, queryByRole, rerender } = render(
      <WorkspaceHostProvider host="tools" navigation={<span data-navigation-placeholder />}>
        <WorkspaceRouteLoading composition="split" controls />
      </WorkspaceHostProvider>,
    );
    const workspace = container.querySelector("[data-workspace-page]");
    expect(workspace?.getAttribute("data-workspace-host")).toBe("tools");
    expect(workspace?.querySelector("[data-workspace-heading] [data-navigation-placeholder]")).not.toBeNull();
    expect(workspace?.querySelector(".workspace-page-layout")?.className).toContain("p-6");
    expect(workspace?.querySelector("[data-workspace-canvas]")?.className).toContain("p-4");
    expect(workspace?.querySelector("[data-workspace-header]")).not.toBeNull();
    expect(queryByRole("button")).toBeNull();
    rerender(
      <WorkspaceHostProvider host="answer-canvas">
        <WorkspaceRouteLoading composition="split" controls />
      </WorkspaceHostProvider>,
    );
    expect(container.querySelector("[data-workspace-header]")).toBeNull();
    expect(container.querySelector("[data-workspace-loading-controls]")).not.toBeNull();
  });

  it("renders one shell main instead of a blank auth frame", () => {
    const { container } = render(<ShellBootLoading />);
    expect(container.querySelectorAll("main")).toHaveLength(1);
    const boot = container.querySelector("[data-shell-boot-loading]");
    expect(boot?.className).toContain("h-dvh");
    expect(boot?.className).toContain("app-shell-frame");
    expect(boot?.querySelector(".shell-boot-menu")?.className).toContain("shell-menu-trigger");
    expect(boot?.querySelector(".chat-workspace")?.classList.contains("p-3")).toBe(false);
    expect(boot?.getAttribute("data-shell-boot-mode")).toBe("ai");
    expect(boot?.querySelector(".shell-boot-layout")?.classList.contains("shell-boot-workspace")).toBe(false);
    expect(boot?.querySelectorAll(".shell-boot-workspace")).toHaveLength(1);
    expect(container.querySelector(".shell-boot-sidebar")).not.toBeNull();
    expect(container.querySelector("[data-shell-boot-brand]")?.className).toContain("h-15");
    expect(container.querySelector("[data-shell-boot-footer]")).not.toBeNull();
    expect(container.querySelectorAll("[data-shell-boot-modes] > [data-skeleton]")).toHaveLength(3);
    expect(container.querySelector("[data-shell-boot-expand]")?.classList.contains("size-9")).toBe(true);
    expect(container.querySelector("[data-shell-boot-new]")).not.toBeNull();
    expect(container.querySelector("[data-shell-boot-account]")).not.toBeNull();
    expect(boot?.querySelector("[data-chat-frame] > header .shell-boot-menu")).not.toBeNull();
    expect(boot?.querySelector("[data-mobile-navigation]")?.getAttribute("aria-hidden")).toBe("true");
    const tabs = boot?.querySelector("[data-mobile-navigation] > div");
    expect(tabs?.className).toContain("grid-cols-3");
    expect(tabs?.className).not.toMatch(/gap-1|px-2/);
  });

  it("selects boot geometry from the requested destination", () => {
    const { container } = render(<ShellBootLoading pathname="/tools/map" />);

    expect(container.querySelector("[data-shell-boot-loading]")?.getAttribute("data-shell-boot-mode")).toBe("tools");
  });
});
