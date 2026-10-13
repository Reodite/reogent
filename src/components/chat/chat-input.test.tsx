// @vitest-environment happy-dom
import { AppAuthProvider, useAppAuth } from "@/src/components/auth/app-auth";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { Storage } from "happy-dom";
import { useLayoutEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatInput } from "./chat-input";

beforeEach(() => {
  vi.stubGlobal("localStorage", new Storage());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

describe("account-scoped drafts", () => {
  let auth: ReturnType<typeof useAppAuth>;
  const onSend = vi.fn();
  const commits: { userId: string | undefined; value: string | undefined }[] = [];
  beforeEach(() => {
    commits.length = 0;
  });

  function Composer() {
    auth = useAppAuth();
    const container = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
      commits.push({ userId: auth.user?.userId, value: container.current?.querySelector("textarea")?.value });
    });
    return (
      <div ref={container}>
        <ChatInput disabled={false} thinking={false} showDisclaimer={false} onSend={onSend} />
      </div>
    );
  }

  function App() {
    return (
      <AppAuthProvider>
        <Composer />
      </AppAuthProvider>
    );
  }

  function switchAccount(userId: string) {
    act(() => {
      localStorage.setItem("reodite.auth.token", `header.${btoa(JSON.stringify({ sub: userId }))}.signature`);
      localStorage.setItem("reodite.auth.user", JSON.stringify({ userId, username: userId }));
      window.dispatchEvent(new StorageEvent("storage", { key: "reodite.auth.user" }));
    });
  }

  it("isolates mounted and reloaded A/B drafts and clears the displayed draft on send", () => {
    switchAccount("draft-A");
    let view = render(<App />);
    const textarea = () => view.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea(), { target: { value: "A's private question" } });
    switchAccount("draft-B");
    expect(textarea().value).toBe("");
    expect(commits.filter((commit) => commit.userId === "draft-B")).toEqual([{ userId: "draft-B", value: "" }]);
    fireEvent.change(textarea(), { target: { value: "B's question" } });
    view.unmount();
    view = render(<App />);
    expect(textarea().value).toBe("B's question");
    view.unmount();
    switchAccount("draft-A");
    view = render(<App />);
    expect(textarea().value).toBe("A's private question");
    fireEvent.click(view.getByRole("button", { name: "Send message" }));
    expect(onSend).toHaveBeenLastCalledWith("A's private question");
    view.unmount();
    view = render(<App />);
    expect(textarea().value).toBe("");
  });

  it("does not expose A's draft after logout, guest entry, or guest reload", () => {
    switchAccount("logout-A");
    let view = render(<App />);
    const textarea = () => view.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea(), { target: { value: "A's private question" } });
    act(() => auth.signOut());
    expect(textarea().value).toBe("");
    act(() => auth.continueAsGuest());
    expect(textarea().value).toBe("");
    expect(
      commits
        .filter((commit) => commit.userId === undefined || commit.userId === "guest")
        .every((commit) => commit.value === ""),
    ).toBe(true);
    view.unmount();
    view = render(<App />);
    expect(textarea().value).toBe("");
  });

  it("never displays the unowned legacy draft or adopts it into an account", () => {
    localStorage.setItem("reodite.chat-draft", "unowned private question");
    const view = render(<App />);
    expect((view.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
    act(() => auth.continueAsGuest());
    expect((view.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
    switchAccount("legacy-B");
    expect((view.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
    expect(localStorage.getItem("reodite.chat-draft:legacy-B")).toBeNull();
  });

  it("resets in-memory drafts across account changes when storage fails", async () => {
    const view = render(<App />);
    const unavailable = () => {
      throw new Error("Storage unavailable");
    };
    vi.stubGlobal("localStorage", { getItem: unavailable, setItem: unavailable, removeItem: unavailable });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path, init) => {
        const { username } = JSON.parse(init.body);
        return Response.json({
          userId: username,
          username,
          token: `header.${btoa(JSON.stringify({ sub: username }))}.signature`,
        });
      }),
    );
    await act(async () => {
      await auth.signIn("memory-A", "password");
    });
    fireEvent.change(view.getByRole("textbox"), { target: { value: "memory A secret" } });
    await act(async () => {
      await auth.signIn("memory-B", "password");
    });
    expect((view.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
    fireEvent.change(view.getByRole("textbox"), { target: { value: "memory B question" } });
    fireEvent.click(view.getByRole("button", { name: "Send message" }));
    expect(onSend).toHaveBeenLastCalledWith("memory B question");
  });
});
