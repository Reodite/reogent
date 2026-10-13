// @vitest-environment happy-dom
import { ChatShellProvider, useChatShell, type ChatShellState } from "@/src/components/chat/chat-shell-context";
import { ResponseWidget } from "@/src/components/chat/tool-renderers";
import type { CourseDoc, ToolCall } from "@/src/lib/api-types";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/src/components/providers", () => ({
  useApi: () => ({ listSessions: async () => [] }),
}));
vi.mock("@/src/components/auth/app-auth", () => ({
  useAppAuth: () => ({ status: "signedOut" }),
}));
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

const mem = new Map<string, string>();
const storagePolyfill: Storage = {
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
  Object.defineProperty(window, "sessionStorage", {
    value: storagePolyfill,
    configurable: true,
    writable: true,
  });
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
  vi.clearAllMocks();
  cleanup();
});
afterAll(() => {
  sessionStorage.clear();
});

const shellRef: { current: ChatShellState | null } = { current: null };
function Capture() {
  shellRef.current = useChatShell();
  return null;
}

const fullCourse: CourseDoc = {
  code: "CPSC 110",
  subject: "CPSC",
  number: "110",
  title: "Computation, Programs, and Programming",
  description: "Foundations of computation.",
  credits: 4,
  prerequisite: "CPSC 103",
  corequisite: null,
  sections: [],
  terms: [],
  total_sections: 0,
};

const getCourseCall: ToolCall = {
  name: "show_widget",
  input: { type: "course_detail", query: "CPSC 110" },
  result: { type: "course_detail", result: fullCourse },
  status: "ok",
} as unknown as ToolCall;

describe("Course widget prerequisite navigation", () => {
  it("rendering a get_course card with a prerequisite shows a Prereq Tree button whose click opens the tree rooted at the card's code", () => {
    shellRef.current = null;
    const { container } = render(
      <ChatShellProvider>
        <ResponseWidget call={getCourseCall} />
        <Capture />
      </ChatShellProvider>,
    );
    const affordance = container.querySelector('[data-action="open-prereq-tree"]') as HTMLButtonElement | null;
    expect(affordance).not.toBeNull();
    expect(affordance?.getAttribute("data-code")).toBe("CPSC 110");
    act(() => {
      if (affordance) fireEvent.click(affordance);
    });
    expect(shellRef.current?.activeChannel?.id).toBe("prereq-tree");
    expect(shellRef.current?.activeChannel?.state.root).toBe("CPSC 110");
    expect(shellRef.current?.activeChannel?.state.selections).toEqual({});
  });
});
