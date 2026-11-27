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
  it("announces new and existing conversation loading", () => {
    const { container } = render(
      <>
        <NewChatLoading />
        <ChatPanelLoading />
      </>,
    );
    const newChat = container.querySelector("[data-new-chat-loading]");
    const history = container.querySelector("[data-chat-loading]");
    expect(newChat).not.toBeNull();
    expect(history).not.toBeNull();
    expect(newChat?.querySelector(".chat-message-well")).not.toBeNull();
  });

  it("marks workspace and answer-canvas loading regions", () => {
    const view = render(
      <>
        <WorkspaceRouteLoading composition="split" controls />
        <AnswerCanvasLoading />
      </>,
    );
    const workspace = view.container.querySelector("[data-workspace-route-loading]");
    expect(workspace?.querySelector("[data-workspace-view-toggle]")).not.toBeNull();
    expect(workspace?.querySelector("[data-workspace-loading-controls]")).not.toBeNull();
    expect(workspace?.querySelector("[data-workspace-region='rail']")).not.toBeNull();
    expect(workspace?.querySelector("[data-workspace-region='main']")).not.toBeNull();
    const answerCanvas = view.container.querySelector("[data-answer-canvas-loading]");
    expect(answerCanvas).not.toBeNull();
  });

  it("shares workspace host navigation and loading controls", () => {
    const { container, queryByRole, rerender } = render(
      <WorkspaceHostProvider host="tools" navigation={<span data-navigation-placeholder />}>
        <WorkspaceRouteLoading composition="split" controls />
      </WorkspaceHostProvider>,
    );
    const workspace = container.querySelector("[data-workspace-page]");
    expect(workspace?.getAttribute("data-workspace-host")).toBe("tools");
    expect(workspace?.querySelector("[data-workspace-heading] [data-navigation-placeholder]")).not.toBeNull();
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
    expect(boot?.getAttribute("data-shell-boot-mode")).toBe("ai");
    expect(boot?.querySelectorAll(".shell-boot-workspace")).toHaveLength(1);
    expect(container.querySelector(".shell-boot-sidebar")).not.toBeNull();
    expect(container.querySelector("[data-shell-boot-footer]")).not.toBeNull();
    expect(container.querySelector("[data-shell-boot-modes]")).not.toBeNull();
    expect(container.querySelector("[data-shell-boot-new]")).not.toBeNull();
    expect(container.querySelector("[data-shell-boot-account]")).not.toBeNull();
    expect(boot?.querySelector("[data-chat-frame] > header .shell-boot-menu")).not.toBeNull();
    expect(boot?.querySelector("[data-mobile-navigation]")?.getAttribute("aria-hidden")).toBe("true");
  });

  it.each(["/app/settings", "/app/account", "/app/about"])("selects the utility workspace for %s", (pathname) => {
    const { container } = render(<ShellBootLoading pathname={pathname} />);
    expect(container.querySelector("[data-shell-boot-loading]")?.getAttribute("data-shell-boot-mode")).toBe("utility");
    expect(container.querySelector("[data-workspace-page]")?.getAttribute("data-workspace-host")).toBe(
      pathname.slice("/app/".length),
    );
    expect(container.querySelectorAll("[data-workspace-canvas]")).toHaveLength(1);
    expect(container.querySelector("[data-workspace-region='rail']")).toBeNull();
    expect(container.querySelector("[data-workspace-view-toggle]")).toBeNull();
  });

  it("selects boot geometry from the requested destination", () => {
    const { container } = render(<ShellBootLoading pathname="/app/tools/map" />);

    expect(container.querySelector("[data-shell-boot-loading]")?.getAttribute("data-shell-boot-mode")).toBe("tools");
  });
});
