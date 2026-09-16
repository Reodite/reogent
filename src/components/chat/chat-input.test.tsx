// @vitest-environment happy-dom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ChatInput } from "./chat-input";

afterEach(cleanup);

it("returns pointer submission focus to the composer", () => {
  const onSend = vi.fn();
  const { getByRole } = render(<ChatInput disabled={false} thinking={false} showDisclaimer={false} onSend={onSend} />);
  const textarea = getByRole("textbox", { name: "Message the assistant" });
  const submit = getByRole("button", { name: "Send message" });
  fireEvent.change(textarea, { target: { value: "Hello" } });
  submit.focus();
  fireEvent.click(submit);
  expect(onSend).toHaveBeenCalledWith("Hello");
  expect(document.activeElement).toBe(textarea);
});

it("swaps only icon presentation while send and stop actions change immediately", () => {
  const onSend = vi.fn();
  const onStop = vi.fn();
  const { getByRole, rerender } = render(
    <ChatInput disabled={false} thinking={false} showDisclaimer={false} onSend={onSend} />,
  );
  const textarea = getByRole("textbox", { name: "Message the assistant" }) as HTMLTextAreaElement;
  const sendIcon = getByRole("button", { name: "Send message" }).querySelector(".ui-content-enter");
  expect(sendIcon).not.toBeNull();
  expect(textarea.classList.contains("py-2.5")).toBe(true);
  expect(textarea.classList.contains("leading-6")).toBe(true);
  expect(textarea.classList.contains("sm:py-3")).toBe(true);
  expect(textarea.classList.contains("sm:leading-5")).toBe(true);
  expect(getByRole("button", { name: "Send message" }).classList.contains("max-sm:rounded-[0.625rem]")).toBe(true);
  expect(getByRole("button", { name: "Send message" }).classList.contains("sm:rounded-md")).toBe(true);
  fireEvent.change(textarea, { target: { value: "Hello" } });
  fireEvent.click(getByRole("button", { name: "Send message" }));
  expect(onSend).toHaveBeenCalledWith("Hello");
  expect(textarea.value).toBe("");
  rerender(<ChatInput disabled thinking showDisclaimer onSend={onSend} onStop={onStop} />);
  const stop = getByRole("button", { name: "Stop generating" });
  expect(stop.querySelector(".ui-content-enter")).not.toBe(sendIcon);
  expect(stop.classList.contains("max-sm:rounded-[0.625rem]")).toBe(true);
  expect(stop.classList.contains("sm:rounded-md")).toBe(true);
  expect(getByRole("textbox", { name: "Message the assistant" })).toBe(textarea);
  expect(textarea.disabled).toBe(true);
  fireEvent.click(stop);
  expect(onStop).toHaveBeenCalledOnce();
  rerender(<ChatInput disabled={false} thinking={false} showDisclaimer onSend={onSend} />);
  expect(getByRole("textbox", { name: "Message the assistant" })).toBe(textarea);
  expect(textarea.disabled).toBe(false);
});
