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
    expect(newChat?.querySelector(".chat-message-well")).not.toBeNull();
  });

  it("reserves workspace and answer-canvas geometry", () => {
    const view = render(
      <>
        <WorkspaceRouteLoading />
        <AnswerCanvasLoading />
      </>,
    );
    expect(view.container.querySelector("[data-workspace-route-loading]")?.className).toContain("h-full");
    expect(view.container.querySelector("[data-answer-canvas-loading]")?.className).toContain("h-full");
  });

  it("renders one shell main instead of a blank auth frame", () => {
    const { container } = render(<ShellBootLoading />);
    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(container.querySelector("[data-shell-boot-loading]")?.className).toContain("h-svh");
    expect(container.querySelector(".shell-boot-sidebar")).not.toBeNull();
  });
});
