// @vitest-environment happy-dom
import { ChatShellProvider, useChatShell, type ChatShellState } from "@/src/components/chat/chat-shell-context";
import type { ToolCall } from "@/src/lib/api-types";
import { act, cleanup, render } from "@testing-library/react";
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
vi.mock("@/src/components/course-lookup/course-lookup-pane", () => ({
  CourseLookupPane: function MockCourseLookupPane() {
    return <div data-mock-course />;
  },
}));
vi.mock("@/src/components/calendar/calendar-pane", () => ({
  CalendarPane: function MockCalendarPane() {
    return <div data-mock-calendar />;
  },
}));

beforeAll(() => {
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
  cleanup();
});
afterAll(() => {
  vi.clearAllMocks();
});

const shellRef: { current: ChatShellState | null } = { current: null };
function Capture() {
  shellRef.current = useChatShell();
  return null;
}

describe("workspaceView state", () => {
  const courseCall: ToolCall = {
    name: "show_widget",
    input: { type: "course" },
    result: { type: "course", result: { code: "CPSC 110" } },
  } as unknown as ToolCall;
  const tuitionCall: ToolCall = {
    name: "get_tuition",
    input: { program: "BSc" },
    result: { program: "BSc", amount_cad: 5000, student_type: "domestic", cohort_year: 2026 },
  } as ToolCall;

  it("activateCanvasView loads the canvas for a mapped tool call", () => {
    shellRef.current = null;
    render(
      <ChatShellProvider>
        <Capture />
      </ChatShellProvider>,
    );
    act(() => shellRef.current?.activateCanvasView(courseCall));
    expect(shellRef.current?.workspaceView?.paneId).toBe("course-lookup");
    expect(shellRef.current?.workspaceView?.state.code).toBe("CPSC 110");
  });

  it("keeps automatic sheet opening suppressed after dismissal", () => {
    render(
      <ChatShellProvider>
        <Capture />
      </ChatShellProvider>,
    );
    act(() => shellRef.current?.setUserDismissedPane(true));
    act(() => shellRef.current?.activateCanvasView(courseCall));
    expect(shellRef.current?.workspaceView?.paneId).toBe("course-lookup");
    expect(shellRef.current?.answerSheetOpen).toBe(false);
  });

  it("opens explicit channels without changing the channel setter identity", () => {
    render(
      <ChatShellProvider>
        <Capture />
      </ChatShellProvider>,
    );
    const activate = shellRef.current?.setActiveChannel;
    act(() => shellRef.current?.setUserDismissedPane(true));
    act(() => shellRef.current?.setActiveChannel("calendar", { cursor: "2026-10" }));
    expect(shellRef.current?.setActiveChannel).toBe(activate);
    expect(shellRef.current?.answerSheetOpen).toBe(true);
    expect(shellRef.current?.rightPaneCollapsed).toBe(false);
    expect(shellRef.current?.userDismissedPane).toBe(false);
    expect(shellRef.current?.workspaceView?.state.cursor).toBe("2026-10");
    act(() => shellRef.current?.setAnswerSheetOpen(false));
    act(() => shellRef.current?.setActiveChannel(null));
    expect(shellRef.current?.workspaceView).toBeNull();
    expect(shellRef.current?.answerSheetOpen).toBe(false);
  });

  it("activateCanvasView is a no-op for an unmapped tool", () => {
    shellRef.current = null;
    render(
      <ChatShellProvider>
        <Capture />
      </ChatShellProvider>,
    );
    act(() =>
      shellRef.current?.setWorkspaceView({
        paneId: "calendar",
        state: { cursor: "2026-01", kinds: ["academic", "holiday"] },
      }),
    );
    act(() => shellRef.current?.activateCanvasView(tuitionCall));
    expect(shellRef.current?.workspaceView?.paneId).toBe("calendar");
  });

  it("setWorkspaceView(null) clears the canvas and activeChannel mirrors it", () => {
    shellRef.current = null;
    render(
      <ChatShellProvider>
        <Capture />
      </ChatShellProvider>,
    );
    act(() => shellRef.current?.activateCanvasView(courseCall));
    act(() => shellRef.current?.setWorkspaceView(null));
    expect(shellRef.current?.workspaceView).toBeNull();
    expect(shellRef.current?.activeChannel).toBeNull();
  });

  it("activeChannel mirrors workspaceView as { id, state }", () => {
    shellRef.current = null;
    render(
      <ChatShellProvider>
        <Capture />
      </ChatShellProvider>,
    );
    act(() =>
      shellRef.current?.setWorkspaceView({ paneId: "prereq-tree", state: { root: "CPSC 320", selections: {} } }),
    );
    expect(shellRef.current?.activeChannel?.id).toBe("prereq-tree");
    expect(shellRef.current?.activeChannel?.state.root).toBe("CPSC 320");
  });

  it("activateCanvasView keeps identity across workspaceView changes", () => {
    shellRef.current = null;
    render(
      <ChatShellProvider>
        <Capture />
      </ChatShellProvider>,
    );
    const before = shellRef.current?.activateCanvasView;
    act(() => shellRef.current?.activateCanvasView(courseCall));
    expect(shellRef.current?.activateCanvasView).toBe(before);
  });

  it("setMode toggles between ai and tools", () => {
    shellRef.current = null;
    render(
      <ChatShellProvider>
        <Capture />
      </ChatShellProvider>,
    );
    expect(shellRef.current?.mode).toBe("ai");
    act(() => shellRef.current?.setMode("tools"));
    expect(shellRef.current?.mode).toBe("tools");
  });
});
