// @vitest-environment happy-dom
import { ChatPanel } from "@/src/components/chat/chat-panel";
import { ChatShellProvider, useChatShell, type ChatShellState } from "@/src/components/chat/chat-shell-context";
import type { ChatMessage, ToolCall } from "@/src/lib/api-types";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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
    value: () => ({
      matches: false,
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
    name: "get_course",
    input: { course_code: code },
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
      { role: "assistant", content: "ok", toolCalls: [courseCall("CPSC 110")] },
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
      { role: "assistant", content: "ok", toolCalls: [courseCall("CPSC 110")] },
    ]);
    renderPanel("sess-2");
    await waitFor(() => {
      expect(shellRef.current?.workspaceView?.paneId).toBe("course-lookup");
      expect(shellRef.current?.workspaceView?.state.code).toBe("CPSC 110");
    });
  });

  it("resets to the idle map when no assistant turn mapped to a view", async () => {
    api.getSession.mockResolvedValue([
      { role: "user", content: "tuition?" },
      { role: "assistant", content: "ok", toolCalls: [tuitionCall] },
    ]);
    renderPanel("sess-3");
    await waitFor(() => expect(shellRef.current?.workspaceView).toBeNull());
  });
});

describe("14.3 — revisit an earlier widget + keyboard activation (REQ-3.4, REQ-3.5, REQ-8.1)", () => {
  it("activating an earlier widget switches the canvas; Enter on a widget also loads it", async () => {
    api.getSession.mockResolvedValue([
      { role: "user", content: "CPSC 110?" },
      { role: "assistant", content: "ok", toolCalls: [courseCall("CPSC 110")] },
      { role: "user", content: "CPSC 320?" },
      { role: "assistant", content: "ok", toolCalls: [courseCall("CPSC 320")] },
    ]);
    const { container } = renderPanel("sess-4");
    // Reload restores the last mapped tool (CPSC 320).
    await waitFor(() => expect(shellRef.current?.workspaceView?.state.code).toBe("CPSC 320"));

    // Revisit the earlier CPSC 110 widget (first get_course widget in the log).
    const widgets = container.querySelectorAll('[data-widget="get_course"]');
    expect(widgets.length).toBe(2);
    fireEvent.click(widgets[0] as HTMLElement);
    expect(shellRef.current?.workspaceView?.state.code).toBe("CPSC 110");

    // Keyboard-activate the later CPSC 320 widget via Enter; focus stays on it.
    const later = widgets[1] as HTMLElement;
    later.focus();
    fireEvent.keyDown(later, { key: "Enter" });
    expect(shellRef.current?.workspaceView?.state.code).toBe("CPSC 320");
    expect(document.activeElement).toBe(later);
  });
});
