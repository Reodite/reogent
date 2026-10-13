// @vitest-environment happy-dom
import { ChatPanel } from "@/src/components/chat/chat-panel";
import { ChatShellProvider, useChatShell, type ChatShellState } from "@/src/components/chat/chat-shell-context";
import type { ChatMessage, ToolCall } from "@/src/lib/api-types";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("motion/react", async (importOriginal) => {
  const original = await importOriginal<typeof import("motion/react")>();
  const React = await import("react");
  const motionProps = new Set([
    "animate",
    "custom",
    "exit",
    "initial",
    "layout",
    "layoutId",
    "onAnimationComplete",
    "transition",
    "variants",
    "whileDrag",
    "whileHover",
    "whileTap",
  ]);
  const staticElement = (tag: string) =>
    function StaticMotionElement({ children, ...props }: { children?: ReactNode } & Record<string, unknown>) {
      const domProps = Object.fromEntries(Object.entries(props).filter(([key]) => !motionProps.has(key)));
      return React.createElement(
        tag,
        {
          ...domProps,
          "data-motion": JSON.stringify({
            initial: props.initial,
            animate: props.animate,
            exit: props.exit,
            transition: props.transition,
          }),
        },
        children,
      );
    };

  return {
    ...original,
    AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
    motion: {
      create: original.motion.create,
      button: staticElement("button"),
      div: staticElement("div"),
      li: staticElement("li"),
      span: staticElement("span"),
    },
    useReducedMotion: () => true,
  };
});

// Hoisted mutable API so each test can program `chat`/`getSession` independently.
const api = vi.hoisted(() => ({
  chat: vi.fn(),
  getSession: vi.fn(async () => [] as ChatMessage[]),
  listSessions: vi.fn(async () => []),
  renameSession: vi.fn(async () => {}),
  deleteSession: vi.fn(async () => {}),
}));

vi.mock("@/src/components/providers", () => ({ useApi: () => api }));
vi.mock("@/src/components/auth/app-auth", () => ({ useAppAuth: () => ({ status: "signedIn" }) }));
vi.mock("@/src/components/prereq-tree/prereq-tree-pane", () => ({
  PrereqTreePane: function MockPrereqTreePane() {
    return null;
  },
}));
vi.mock("@/src/components/map/map-panel", () => ({
  MapArea: function MockMapArea() {
    return null;
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/chat",
  useParams: () => ({}),
}));

interface ChatResult {
  message: string;
  tool_calls: ToolCall[];
}
interface ChatCallbacks {
  onToolStart?: (name: string, input: Record<string, unknown>) => void;
  onToolEnd?: (name: string, result: unknown) => void;
}

/** An assistant history message with the given tool calls as activity blocks. */
function activityMsg(content: string, tools: ToolCall[]): ChatMessage {
  return {
    role: "assistant",
    content,
    activity: tools.map((t) => ({ type: "tool_call" as const, content: t.name, input: t.input, result: t.result })),
  };
}

const mem = new Map<string, string>();
const storage: Storage = {
  getItem: (k) => mem.get(k) ?? null,
  setItem: (k, v) => void mem.set(k, String(v)),
  removeItem: (k) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => Array.from(mem.keys())[i] ?? null,
  get length() {
    return mem.size;
  },
};

beforeAll(() => {
  Object.defineProperty(window, "sessionStorage", { value: storage, configurable: true, writable: true });
  Object.defineProperty(window, "localStorage", { value: storage, configurable: true, writable: true });
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
    }),
    configurable: true,
    writable: true,
  });
});
afterEach(() => {
  mem.clear();
  api.chat.mockReset();
  api.getSession.mockReset();
  api.getSession.mockResolvedValue([]);
  cleanup();
  shellRef.current = null;
});
afterAll(() => {
  sessionStorage.clear();
  localStorage.clear();
});

const shellRef: { current: ChatShellState | null } = { current: null };
function Capture() {
  shellRef.current = useChatShell();
  return null;
}

function renderPanel(sessionId: string | null = null) {
  return render(
    <ChatShellProvider>
      <ChatPanel sessionId={sessionId} />
      <Capture />
    </ChatShellProvider>,
  );
}

function courseCall(code: string): ToolCall {
  return {
    name: "show_widget",
    input: { type: "course" },
    result: {
      type: "course",
      result: {
        code,
        subject: code.slice(0, 4),
        number: code.slice(4),
        title: `${code} title`,
        description: "",
        credits: 3,
        prerequisite: null,
        corequisite: null,
        sections: [],
        terms: [],
        total_sections: 0,
      },
    },
  };
}
const tuitionCall: ToolCall = {
  name: "get_tuition",
  input: { program: "BSc" },
  result: { program: "BSc", amount_cad: 5000, student_type: "domestic", cohort_year: 2026 },
};

/** Program `chat` to stream the given tool calls (tool_start+tool_end) then resolve. */
function streamResponse(tools: ToolCall[]) {
  const result: ChatResult = { message: "ok", tool_calls: tools };
  api.chat.mockImplementation(async (_sid: string, _conv: ChatMessage[], cb: ChatCallbacks) => {
    for (const t of tools) {
      cb?.onToolStart?.(t.name, t.input);
      cb?.onToolEnd?.(t.name, t.result);
    }
    return result;
  });
}

/** Type into the composer and click send, then wait for the exchange to resolve. */
async function send(text: string) {
  const textarea = document.querySelector('textarea[aria-label="Message the assistant"]') as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: text } });
  const sendBtn = document.querySelector('button[aria-label="Send message"]') as HTMLButtonElement;
  fireEvent.click(sendBtn);
  // Wait for the request to fire, then flush the promise's .then (canvas drive).
  await waitFor(() => expect(api.chat).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 50));
}

describe("14.1 — agent stream drives the canvas (REQ-3.1, REQ-9.1)", () => {
  it("a mapped tool call loads its canvas view after the stream resolves", async () => {
    streamResponse([courseCall("CPSC 110")]);
    renderPanel(null);
    await send("what is CPSC 110");
    expect(shellRef.current?.workspaceView?.paneId).toBe("course-lookup");
    expect(shellRef.current?.workspaceView?.state.code).toBe("CPSC 110");
  });

  it("an unmapped-only turn leaves the existing canvas unchanged (REQ-3.6)", async () => {
    // Existing session whose last assistant turn already drove the canvas.
    api.getSession.mockResolvedValue([
      { role: "user", content: "CPSC 110?" },
      activityMsg("ok", [courseCall("CPSC 110")]),
    ]);
    renderPanel("sess-1");
    await waitFor(() => expect(shellRef.current?.workspaceView?.paneId).toBe("course-lookup"));
    // A follow-up unmapped turn on the SAME session must not clear the canvas.
    streamResponse([tuitionCall]);
    await send("tuition?");
    expect(shellRef.current?.workspaceView?.paneId).toBe("course-lookup");
    expect(shellRef.current?.workspaceView?.state.code).toBe("CPSC 110");
  });
});

describe("14.2 — reload re-activates the latest widget (REQ-3.8, REQ-9.5)", () => {
  it("re-activates the last mapped tool's view on session load", async () => {
    api.getSession.mockResolvedValue([
      { role: "user", content: "what is CPSC 110" },
      activityMsg("ok", [courseCall("CPSC 110")]),
    ]);
    renderPanel("sess-2");
    await waitFor(() => {
      expect(shellRef.current?.workspaceView?.paneId).toBe("course-lookup");
      expect(shellRef.current?.workspaceView?.state.code).toBe("CPSC 110");
    });
  });

  it("resets to the idle map when no assistant turn mapped to a view", async () => {
    api.getSession.mockResolvedValue([{ role: "user", content: "tuition?" }, activityMsg("ok", [tuitionCall])]);
    renderPanel("sess-3");
    await waitFor(() => expect(shellRef.current?.workspaceView).toBeNull());
  });
});

describe("14.3 — revisit an earlier widget + keyboard activation (REQ-3.4, REQ-3.5, REQ-8.1)", () => {
  it("uses explicit native controls to revisit earlier widgets", async () => {
    api.getSession.mockResolvedValue([
      { role: "user", content: "CPSC 110?" },
      activityMsg("ok", [courseCall("CPSC 110")]),
      { role: "user", content: "CPSC 320?" },
      activityMsg("ok", [courseCall("CPSC 320")]),
    ]);
    const { container } = renderPanel("sess-4");
    // Reload restores the last mapped tool (CPSC 320).
    await waitFor(() => expect(shellRef.current?.workspaceView?.state.code).toBe("CPSC 320"));

    const widgets = container.querySelectorAll('[data-widget="show_widget"]');
    expect(widgets.length).toBe(2);
    const earlier = widgets[0].querySelector<HTMLButtonElement>('[data-action="open-course-details"]');
    const later = widgets[1].querySelector<HTMLButtonElement>('[data-action="open-course-details"]');
    expect(earlier?.tagName).toBe("BUTTON");
    expect(later?.tagName).toBe("BUTTON");

    fireEvent.click(earlier as HTMLButtonElement);
    expect(shellRef.current?.workspaceView?.state.code).toBe("CPSC 110");

    later?.focus();
    fireEvent.click(later as HTMLButtonElement);
    expect(shellRef.current?.workspaceView?.state.code).toBe("CPSC 320");
    expect(document.activeElement).toBe(later);
  });
});

describe("ChatPanel focus ownership", () => {
  it("focuses a ready composer when the page has no focused control", async () => {
    const { getByRole } = renderPanel();
    const composer = getByRole("textbox", { name: "Message the assistant" });
    await waitFor(() => expect(document.activeElement).toBe(composer));
  });

  it("preserves restored sidebar focus when a new conversation mounts", async () => {
    const { getByRole } = render(<button type="button">New conversation</button>);
    const target = getByRole("button", { name: "New conversation" });
    target.focus();
    const panel = renderPanel();
    const composer = panel.getByRole("textbox", { name: "Message the assistant" }) as HTMLTextAreaElement;
    await waitFor(() => expect(composer.disabled).toBe(false));
    expect(document.activeElement).toBe(target);
  });

  it("preserves focus moved during history loading", async () => {
    const history = Promise.withResolvers<ChatMessage[]>();
    api.getSession.mockReturnValue(history.promise);
    const { getByRole } = render(<button type="button">Conversation actions</button>);
    const target = getByRole("button", { name: "Conversation actions" });
    const panel = renderPanel("held-history");
    target.focus();
    await act(async () => history.resolve([]));
    expect((panel.getByRole("textbox", { name: "Message the assistant" }) as HTMLTextAreaElement).disabled).toBe(false);
    expect(document.activeElement).toBe(target);
  });

  it.each(["sidebar", "page"])("finishes a response with focus owned by the %s", async (owner) => {
    const response = Promise.withResolvers<ChatResult>();
    api.chat.mockReturnValue(response.promise);
    const { getByRole } = render(<button type="button">Conversation actions</button>);
    const target = getByRole("button", { name: "Conversation actions" });
    const panel = renderPanel();
    await send("Hello");
    const composer = panel.getByRole("textbox", { name: "Message the assistant" }) as HTMLTextAreaElement;
    if (owner === "sidebar") target.focus();
    else composer.blur();
    await act(async () => response.resolve({ message: "Illustrative response", tool_calls: [] }));
    expect(composer.disabled).toBe(false);
    expect(document.activeElement).toBe(owner === "sidebar" ? target : composer);
  });

  it("focuses the composer for an explicit new-conversation action", async () => {
    const { getByRole } = render(<button type="button">New conversation</button>);
    const target = getByRole("button", { name: "New conversation" });
    const panel = renderPanel();
    target.focus();
    act(() => shellRef.current?.startNewChat());
    expect(document.activeElement).toBe(panel.getByRole("textbox", { name: "Message the assistant" }));
  });
});

describe("ChatPanel reset lifecycle", () => {
  it("loads saved history after a previous new-conversation request", async () => {
    const view = renderPanel();
    act(() => shellRef.current?.startNewChat());
    api.getSession.mockResolvedValue([
      { role: "user", content: "Saved question" },
      { role: "assistant", content: "Saved response" },
    ]);
    view.rerender(
      <ChatShellProvider>
        <ChatPanel key="restored" sessionId="saved-after-new" />
        <Capture />
      </ChatShellProvider>,
    );
    await waitFor(() => expect(api.getSession).toHaveBeenCalledWith("saved-after-new"));
    expect((await view.findByRole("log", { name: "Conversation" })).textContent).toContain("Saved question");
  });

  it("keeps the composer mounted and clears its submitted draft on first send", async () => {
    streamResponse([]);
    const view = renderPanel();
    const composer = view.getByRole("textbox", { name: "Message the assistant" });
    await send("Submitted draft");
    const current = view.getByRole("textbox", { name: "Message the assistant" }) as HTMLTextAreaElement;
    expect.soft(current).toBe(composer);
    expect.soft(current.value).toBe("");
    expect.soft(localStorage.getItem("reodite.chat-draft")).toBeNull();
  });

  it("handles repeated new-conversation requests in the mounted panel", async () => {
    streamResponse([]);
    const view = renderPanel();
    await send("First conversation");
    act(() => shellRef.current?.startNewChat());
    expect(view.queryByRole("log", { name: "Conversation" })).toBeNull();
    await send("Second conversation");
    act(() => shellRef.current?.startNewChat());
    expect(view.queryByRole("log", { name: "Conversation" })).toBeNull();
    expect(api.chat).toHaveBeenCalledTimes(2);
    expect(api.chat.mock.calls[0][0]).not.toBe(api.chat.mock.calls[1][0]);
  });
});

describe("ChatPanel reduced motion", () => {
  it("bounds empty suggestions locally while retaining wrapping and touch-sized pills", async () => {
    const { getByRole } = renderPanel();
    await act(async () => {});
    const suggestions = getByRole("navigation", { name: "Suggested questions" }).querySelectorAll("button");
    expect(suggestions.length).toBeGreaterThan(0);
    for (const suggestion of suggestions) {
      for (const className of ["min-w-0", "max-w-full", "whitespace-normal", "min-h-11", "shrink-0"]) {
        expect(suggestion.classList.contains(className)).toBe(true);
      }
    }
  });

  it("removes empty and typing presence without duration or vertical travel", async () => {
    api.chat.mockImplementation(() => new Promise(() => {}));
    const { container, getByRole } = renderPanel();
    const empty = getByRole("navigation", { name: "Suggested questions" }).closest("[data-motion]")!;
    expect(JSON.parse(empty.getAttribute("data-motion")!).transition.duration).toBe(0);
    await send("Hello");
    const typing = getByRole("status", { name: "The assistant is thinking" }).closest("[data-motion]")!;
    const animation = JSON.parse(typing.getAttribute("data-motion")!);
    expect(animation.animate.transition.duration).toBe(0);
    expect(animation.exit).toEqual({ opacity: 0, y: 0, transition: { duration: 0 } });
    expect(container.querySelector("textarea")).not.toBeNull();
  });
});
