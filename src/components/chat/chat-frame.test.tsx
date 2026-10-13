// @vitest-environment happy-dom
import { WorkspaceHostProvider } from "@/src/components/shell/workspace-host";
import { render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { ChatFrame } from "./chat-frame";

describe("ChatFrame", () => {
  it("exposes the message region ref, busy state, and keyboard access", () => {
    const scrollRef = createRef<HTMLElement>();
    const { getByRole, getByText } = render(
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
    expect(scrollRef.current).toBe(getByRole("region", { name: "Conversation messages" }));
    expect(scrollRef.current?.getAttribute("aria-busy")).toBe("true");
    expect(scrollRef.current?.getAttribute("aria-label")).toBe("Conversation messages");
    expect(scrollRef.current?.tabIndex).toBe(0);
    expect(getByText("Footer")).not.toBeNull();
  });

  it("exposes shell navigation alongside the conversation", () => {
    const { getByRole, getByText } = render(
      <WorkspaceHostProvider host="chat" navigation={<button type="button">Open sidebar</button>}>
        <ChatFrame header={<span>Conversation</span>} footer={null}>
          Messages
        </ChatFrame>
      </WorkspaceHostProvider>,
    );
    expect(getByRole("button", { name: "Open sidebar" })).not.toBeNull();
    expect(getByText("Conversation")).not.toBeNull();
  });
});
