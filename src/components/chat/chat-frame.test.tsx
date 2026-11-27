// @vitest-environment happy-dom
import { ChatPanelLoading, NewChatLoading } from "@/src/components/shell/shell-loading";
import { WorkspaceHostProvider } from "@/src/components/shell/workspace-host";
import { render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { ChatFrame } from "./chat-frame";
import { ChatInput } from "./chat-input";

describe("shared conversation behavior", () => {
  it("forwards the message region ref and busy state", () => {
    const scrollRef = createRef<HTMLElement>();
    const { container, getByRole } = render(
      <ChatFrame
        aria-label="Conversation"
        header={<h1>Session</h1>}
        footer={<p>Footer</p>}
        scrollRef={scrollRef}
        messagesBusy
      >
        <p>Message</p>
      </ChatFrame>,
    );
    const frame = getByRole("region", { name: "Conversation" });
    expect(scrollRef.current).toBe(container.querySelector(".chat-message-well"));
    expect(scrollRef.current?.getAttribute("aria-busy")).toBe("true");
    expect(scrollRef.current?.tagName).toBe("SECTION");
    expect(scrollRef.current?.getAttribute("aria-label")).toBe("Conversation messages");
    expect(scrollRef.current?.tabIndex).toBe(0);
    expect(frame.lastElementChild?.textContent).toBe("Footer");
  });

  it("places shell navigation inside the conversation header", () => {
    const { container } = render(
      <WorkspaceHostProvider host="chat" navigation={<button type="button">Open sidebar</button>}>
        <ChatFrame header={<span>Conversation</span>} footer={null}>
          Messages
        </ChatFrame>
      </WorkspaceHostProvider>,
    );
    const header = container.querySelector("[data-chat-frame] > header");
    expect(header?.querySelector("button")?.textContent).toBe("Open sidebar");
    expect(header?.textContent).toContain("Conversation");
  });

  it("renders one composer and retains accessible loading labels", () => {
    const { getAllByRole, getByRole } = render(
      <>
        <ChatInput
          disabled={false}
          thinking={false}
          showDisclaimer={false}
          tip="Search for a course."
          onSend={() => {}}
        />
        <NewChatLoading />
        <ChatPanelLoading />
      </>,
    );
    expect(getAllByRole("textbox")).toHaveLength(1);
    expect(getByRole("status", { name: "Loading new conversation" })).toBeTruthy();
    expect(getByRole("status", { name: "Loading conversation" })).toBeTruthy();
  });
});
