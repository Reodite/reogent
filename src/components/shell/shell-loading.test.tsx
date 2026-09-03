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
    expect(workspace?.querySelector("[data-workspace-loading-controls]")).not.toBeNull();
    expect(workspace?.querySelector("[data-workspace-region='rail']")).not.toBeNull();
    expect(workspace?.querySelector("[data-workspace-region='main']")).not.toBeNull();
    const answerCanvas = view.container.querySelector("[data-answer-canvas-loading]");
    expect(answerCanvas?.className).toContain("h-full");
    expect(answerCanvas?.querySelector("header")?.className).toContain("h-15");
    expect(answerCanvas?.querySelector("header")?.className).not.toContain("border-b");
    expect(answerCanvas?.querySelector("header")?.firstElementChild?.className).toContain("size-7");
  });

  it("renders one shell main instead of a blank auth frame", () => {
    const { container } = render(<ShellBootLoading />);
    expect(container.querySelectorAll("main")).toHaveLength(1);
    const boot = container.querySelector("[data-shell-boot-loading]");
    expect(boot?.className).toContain("h-svh");
    expect(boot?.getAttribute("data-shell-boot-mode")).toBe("ai");
    expect(boot?.querySelector(".shell-boot-layout")?.classList.contains("shell-boot-workspace")).toBe(false);
    expect(boot?.querySelectorAll(".shell-boot-workspace")).toHaveLength(1);
    expect(container.querySelector(".shell-boot-sidebar")).not.toBeNull();
    expect(container.querySelector("[data-shell-boot-brand]")?.className).toContain("h-15");
    expect(container.querySelector("[data-shell-boot-footer]")).not.toBeNull();
  });

  it("selects boot geometry from the requested destination", () => {
    const { container } = render(<ShellBootLoading pathname="/tools/map" />);

    expect(container.querySelector("[data-shell-boot-loading]")?.getAttribute("data-shell-boot-mode")).toBe("tools");
  });
});
