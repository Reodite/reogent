// @vitest-environment happy-dom
import { ChatShellProvider, useChatShell } from "@/src/components/chat/chat-shell-context";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionSidebar } from "./session-sidebar";

const values = new Map<string, string>();
const storage: Storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => void values.set(key, String(value)),
  removeItem: (key) => void values.delete(key),
  clear: () => values.clear(),
  key: (index) => Array.from(values.keys())[index] ?? null,
  get length() {
    return values.size;
  },
};
Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
Object.defineProperty(window, "sessionStorage", { configurable: true, value: storage });

const api = vi.hoisted(() => ({
  listSessions: vi.fn(async () => [
    {
      session_id: "session-1",
      title: "A conversation with a long title",
      updatedAt: new Date().toISOString(),
    },
  ]),
  renameSession: vi.fn(async () => {}),
  deleteSession: vi.fn(async () => {}),
}));

vi.mock("@/src/components/providers", () => ({ useApi: () => api }));
vi.mock("@/src/components/auth/app-auth", () => ({
  useAppAuth: () => ({ status: "signedIn", isGuest: false, user: { userId: "user-1", username: "student" } }),
}));
const navigation = vi.hoisted(() => ({
  committedPathname: "/chat",
  displayPathname: "/chat",
  pending: false,
  push: vi.fn(),
}));
vi.mock("@/src/components/shell/shell-navigation", () => ({ useShellNavigation: () => navigation }));
vi.mock("next/navigation", () => ({ usePathname: () => "/chat" }));

beforeEach(() => {
  api.listSessions
    .mockReset()
    .mockResolvedValue([
      { session_id: "session-1", title: "A conversation with a long title", updatedAt: new Date().toISOString() },
    ]);
  api.renameSession.mockReset().mockResolvedValue(undefined);
  api.deleteSession.mockReset().mockResolvedValue(undefined);
  navigation.committedPathname = "/chat";
  navigation.displayPathname = "/chat";
  navigation.push.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  values.clear();
});

function RefreshSessions() {
  const { refreshSessions } = useChatShell();
  return (
    <button type="button" onClick={refreshSessions}>
      Refresh sessions
    </button>
  );
}

function sidebar() {
  return (
    <ChatShellProvider>
      <SessionSidebar />
    </ChatShellProvider>
  );
}

async function openActions() {
  const trigger = await screen.findByRole("button", { name: "Actions for A conversation with a long title" });
  fireEvent.click(trigger);
  return { trigger, menu: await screen.findByRole("menu") };
}

async function renameEditor() {
  const { trigger, menu } = await openActions();
  fireEvent.click(within(menu).getByRole("menuitem", { name: "Rename" }));
  const input = await screen.findByRole("textbox", { name: "Conversation title" });
  return { trigger, input: input as HTMLInputElement };
}

async function deleteDialog() {
  const { trigger, menu } = await openActions();
  fireEvent.click(within(menu).getByRole("menuitem", { name: "Delete" }));
  return { trigger, dialog: await screen.findByRole("dialog", { name: "Delete conversation" }) };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("SessionSidebar actions", () => {
  it("releases the new-conversation trigger for route autofocus", async () => {
    navigation.displayPathname = "/chat/session-1";
    render(sidebar());
    await screen.findByRole("button", { name: "A conversation with a long title" });
    const trigger = screen.getByRole("button", { name: "New conversation" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(navigation.push).toHaveBeenCalledWith("/chat");
    expect(document.activeElement).toBe(document.body);
  });

  it.each(["/chat", "/settings"])("navigates to a new conversation from %s", async (pathname) => {
    navigation.displayPathname = pathname;
    render(sidebar());
    await screen.findByRole("button", { name: "A conversation with a long title" });
    fireEvent.click(screen.getByRole("button", { name: "New conversation" }));
    expect(navigation.push).toHaveBeenCalledWith("/chat");
  });

  it("keeps loaded session rows during refresh and refresh failure", async () => {
    const { container } = render(
      <ChatShellProvider>
        <SessionSidebar />
        <RefreshSessions />
      </ChatShellProvider>,
    );
    await screen.findByRole("button", { name: "A conversation with a long title" });
    let reject!: (error: Error) => void;
    api.listSessions.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Refresh sessions" }));
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole("button", { name: "A conversation with a long title" })).not.toBeNull();
    expect(container.querySelector("[data-skeleton]")).toBeNull();
    expect(screen.getByText("Updating conversations…")).not.toBeNull();
    await act(async () => {
      reject(new Error("offline"));
    });
    expect(screen.getByRole("alert").textContent).toContain("Couldn’t refresh conversations");
    expect(screen.getByRole("button", { name: "A conversation with a long title" })).not.toBeNull();
  });
  it("scopes session group labels to each desktop and drawer instance", async () => {
    const { container } = render(
      <ChatShellProvider>
        <SessionSidebar />
        <SessionSidebar />
      </ChatShellProvider>,
    );
    expect(await screen.findAllByRole("button", { name: "A conversation with a long title" })).toHaveLength(2);
    const groups = [...container.querySelectorAll("ul[aria-labelledby]")];
    const ids = groups.map((group) => group.getAttribute("aria-labelledby"));
    expect(groups).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(document.getElementById(id ?? "")?.textContent).toBe("Today");
  });

  it("uses one compact action trigger without nesting it in navigation", async () => {
    render(sidebar());
    const trigger = await screen.findByRole("button", { name: "Actions for A conversation with a long title" });
    const open = screen.getByRole("button", { name: "A conversation with a long title" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.classList.contains("size-11")).toBe(true);
    expect(trigger.classList.contains("sm:size-8")).toBe(true);
    expect(open.contains(trigger)).toBe(false);
    expect(open.className).toContain("pr-13 sm:pr-10");
    expect(screen.queryByRole("button", { name: "Rename" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("keeps action menu IDs local to duplicate sidebar instances", async () => {
    render(
      <ChatShellProvider>
        <SessionSidebar />
        <SessionSidebar />
      </ChatShellProvider>,
    );
    const triggers = await screen.findAllByRole("button", { name: "Actions for A conversation with a long title" });
    fireEvent.click(triggers[0]);
    const first = await screen.findByRole("menu");
    const firstId = first.id;
    fireEvent.keyDown(document.activeElement ?? first, { key: "Escape" });
    await waitFor(() => expect(document.getElementById(firstId)).toBeNull());
    fireEvent.click(triggers[1]);
    const second = await screen.findByRole("menu");
    expect(second.id).not.toBe(firstId);
    expect(triggers[1].getAttribute("aria-controls")).toBe(second.id);
    expect(triggers[0].getAttribute("aria-expanded")).toBe("false");
  });

  it("opens the first menu item and supports arrows, Home, End, and Escape", async () => {
    render(sidebar());
    const { trigger, menu } = await openActions();
    const rename = within(menu).getByRole("menuitem", { name: "Rename" });
    const remove = within(menu).getByRole("menuitem", { name: "Delete" });
    expect(document.activeElement).toBe(rename);
    expect(trigger.getAttribute("aria-controls")).toBe(menu.id);
    expect(rename.tabIndex).toBe(0);
    expect(remove.tabIndex).toBe(-1);
    fireEvent.keyDown(rename, { key: "ArrowDown" });
    expect(document.activeElement).toBe(remove);
    expect(remove.tabIndex).toBe(0);
    expect(rename.tabIndex).toBe(-1);
    fireEvent.keyDown(remove, { key: "Home" });
    expect(document.activeElement).toBe(rename);
    fireEvent.keyDown(rename, { key: "End" });
    expect(document.activeElement).toBe(remove);
    fireEvent.keyDown(remove, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it.each(["ArrowDown", "ArrowUp"])("opens by %s and leaves the menu with Tab", async (key) => {
    render(sidebar());
    const trigger = await screen.findByRole("button", { name: "Actions for A conversation with a long title" });
    fireEvent.keyDown(trigger, { key });
    const menu = await screen.findByRole("menu");
    const selected = within(menu).getByRole("menuitem", { name: key === "ArrowDown" ? "Rename" : "Delete" });
    expect(document.activeElement).toBe(selected);
    fireEvent.keyDown(selected, { key: "Tab" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("names the rename input, preserves row height, and returns focus on cancellation", async () => {
    const { container } = render(sidebar());
    const { input } = await renameEditor();
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    expect(container.querySelector("[data-session-editor-controls]")?.className).toContain("min-h-12");
    await waitFor(() => expect(container.ownerDocument.querySelector("[data-session-menu]")).toBeNull());
    expect(screen.getByRole("textbox", { name: "Conversation title" })).toBe(input);
    fireEvent.change(input, { target: { value: "Do not save" } });
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("button", { name: "Actions for A conversation with a long title" }),
      ),
    );
    expect(api.renameSession).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "A conversation with a long title" })).not.toBeNull();
  });

  it.each(["   ", "A conversation with a long title"])(
    "cancels a no-op rename without a request (%s)",
    async (value) => {
      render(sidebar());
      const { input } = await renameEditor();
      fireEvent.change(input, { target: { value } });
      fireEvent.click(screen.getByRole("button", { name: "Confirm rename" }));
      await screen.findByRole("button", { name: "A conversation with a long title" });
      expect(api.renameSession).not.toHaveBeenCalled();
    },
  );

  it("does not submit a title while an IME composition is active", async () => {
    render(sidebar());
    const { input } = await renameEditor();
    fireEvent.change(input, { target: { value: "Changed title" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(api.renameSession).not.toHaveBeenCalled();
  });

  it("keeps the rename draft after failure and saves on retry", async () => {
    api.renameSession.mockRejectedValueOnce(new Error("offline"));
    render(sidebar());
    const { input } = await renameEditor();
    fireEvent.change(input, { target: { value: "  Revised conversation  " } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm rename" }));
    expect(await screen.findByRole("alert")).not.toBeNull();
    expect(input.value).toBe("  Revised conversation  ");
    expect(input.readOnly).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Confirm rename" }));
    await screen.findByRole("button", { name: "Revised conversation" });
    expect(api.renameSession).toHaveBeenLastCalledWith("session-1", "Revised conversation");
    expect(api.renameSession).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Actions for Revised conversation" })),
    );
  });

  it("retains the original title when a failed rename is cancelled", async () => {
    api.renameSession.mockRejectedValueOnce(new Error("offline"));
    render(sidebar());
    const { input } = await renameEditor();
    fireEvent.change(input, { target: { value: "Unsaved title" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm rename" }));
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Cancel rename" }));
    expect(await screen.findByRole("button", { name: "A conversation with a long title" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Unsaved title" })).toBeNull();
  });

  it("prevents duplicate renames and does not steal focus after a pending save", async () => {
    const save = deferred();
    api.renameSession.mockReturnValueOnce(save.promise);
    render(sidebar());
    const { input } = await renameEditor();
    fireEvent.change(input, { target: { value: "Revised conversation" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm rename" }));
    expect(input.readOnly).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel rename" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(api.renameSession).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("textbox", { name: "Conversation title" })).toBe(input);
    const elsewhere = screen.getByRole("button", { name: "New conversation" });
    elsewhere.focus();
    await act(async () => save.resolve());
    await screen.findByRole("button", { name: "Revised conversation" });
    expect(document.activeElement).toBe(elsewhere);
  });

  it("confirms deletion in a labeled dialog and restores the local action trigger on Cancel", async () => {
    render(sidebar());
    const { trigger, dialog } = await deleteDialog();
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    expect(dialog.textContent).toContain("A conversation with a long title");
    expect(document.activeElement).toBe(cancel);
    fireEvent.click(cancel);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(api.deleteSession).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "A conversation with a long title" })).not.toBeNull();
  });

  it("retains the conversation on delete failure and permits retry", async () => {
    api.deleteSession.mockRejectedValueOnce(new Error("offline"));
    render(sidebar());
    const { dialog } = await deleteDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(await within(dialog).findByRole("alert")).not.toBeNull();
    expect(screen.getByRole("button", { name: "A conversation with a long title", hidden: true })).not.toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "A conversation with a long title", hidden: true })).toBeNull(),
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "New conversation" })));
    expect(api.deleteSession).toHaveBeenCalledTimes(2);
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("keeps deletion pending until confirmation succeeds and redirects the active conversation", async () => {
    navigation.displayPathname = "/chat/session-1";
    const deletion = deferred();
    api.deleteSession.mockReturnValueOnce(deletion.promise);
    render(sidebar());
    const { dialog } = await deleteDialog();
    const remove = within(dialog).getByRole("button", { name: "Delete" });
    fireEvent.click(remove);
    expect((remove as HTMLButtonElement).disabled).toBe(true);
    expect((within(dialog).getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(remove);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Delete conversation" })).toBe(dialog);
    expect(screen.getByRole("button", { name: "A conversation with a long title", hidden: true })).not.toBeNull();
    expect(api.deleteSession).toHaveBeenCalledTimes(1);
    await act(async () => deletion.resolve());
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/chat"));
    expect(screen.queryByRole("button", { name: "A conversation with a long title", hidden: true })).toBeNull();
  });

  it("does not redirect a different conversation visited during deletion", async () => {
    navigation.displayPathname = "/chat/session-1";
    const deletion = deferred();
    api.deleteSession.mockReturnValueOnce(deletion.promise);
    const view = render(sidebar());
    const { dialog } = await deleteDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    navigation.displayPathname = "/chat/another-session";
    view.rerender(sidebar());
    await act(async () => deletion.resolve());
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "A conversation with a long title", hidden: true })).toBeNull(),
    );
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it.each(["cancel", "delete"])("returns to the visible desktop control after a hidden-drawer %s", async (action) => {
    function layout(hidden: boolean) {
      return (
        <>
          <button id="desktop-session-collapse" type="button">
            Desktop sidebar control
          </button>
          <div hidden={hidden}>
            <ChatShellProvider>
              <SessionSidebar onClose={() => {}} />
            </ChatShellProvider>
          </div>
        </>
      );
    }
    const view = render(layout(false));
    const fallback = screen.getByRole("button", { name: "Desktop sidebar control" });
    const { dialog } = await deleteDialog();
    view.rerender(layout(true));
    fireEvent.click(within(dialog).getByRole("button", { name: action === "cancel" ? "Cancel" : "Delete" }));
    await waitFor(() => expect(document.activeElement).toBe(fallback));
    expect(document.body.style.overflow).toBe("");
  });

  it("does not navigate after the sidebar unmounts during deletion", async () => {
    navigation.displayPathname = "/chat/session-1";
    const deletion = deferred();
    api.deleteSession.mockReturnValueOnce(deletion.promise);
    const view = render(sidebar());
    const { dialog } = await deleteDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    view.unmount();
    await act(async () => deletion.resolve());
    expect(navigation.push).not.toHaveBeenCalled();
  });
});
