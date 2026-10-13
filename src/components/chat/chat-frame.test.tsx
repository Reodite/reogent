// @vitest-environment happy-dom
import { ChatPanelLoading, NewChatLoading } from "@/src/components/shell/shell-loading";
import { WorkspaceHostProvider } from "@/src/components/shell/workspace-host";
import { render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { ChatFrame } from "./chat-frame";
import { ChatInput } from "./chat-input";

describe("shared conversation geometry", () => {
  it("keeps the scroll ref, busy state, and compact menu clearance on the shared frame", () => {
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
    expect(frame.querySelector("header")?.className).toContain("h-15");
    expect(frame.querySelector("header")?.className).toContain("px-4");
    expect(scrollRef.current).toBe(container.querySelector(".chat-message-well"));
    expect(scrollRef.current?.getAttribute("aria-busy")).toBe("true");
    expect(scrollRef.current?.className).toContain("overflow-y-auto");
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
    expect(header?.className).not.toContain("pl-16");
    expect(header?.textContent).toContain("Conversation");
  });

  it("shares live and loading footer padding, safe areas, and reserved caption space", () => {
    const { container, getAllByRole } = render(
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
    const footers = [...container.querySelectorAll("[data-chat-composer-footer]")];
    expect(footers).toHaveLength(3);
    expect(new Set(footers.map((footer) => footer.className)).size).toBe(1);
    expect(footers[0].className).toContain("env(safe-area-inset-bottom)");
    for (const footer of footers) {
      expect(footer.querySelector("[data-chat-composer-caption]")?.className).toContain("min-h-4");
      expect(footer.querySelector("[data-chat-composer-caption]")?.className).toContain("mt-2");
    }
    expect(getAllByRole("textbox")).toHaveLength(1);
    expect(container.querySelector("[data-new-chat-loading] .rounded-full")?.className).toContain("sm:h-8");
  });
});
