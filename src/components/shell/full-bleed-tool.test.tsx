// @vitest-environment happy-dom
import { ChatShellProvider, useChatShell, type ChatShellState } from "@/src/components/chat/chat-shell-context";
import { FullBleedTool } from "@/src/components/shell/full-bleed-tool";
import type { CanvasView } from "@/src/components/shell/pane-registry";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/src/components/providers", () => ({ useApi: () => ({ listSessions: async () => [] }) }));
vi.mock("@/src/components/auth/app-auth", () => ({ useAppAuth: () => ({ status: "signedOut" }) }));
vi.mock("@/src/components/map/map-panel", () => ({
  MapArea: () => <div data-testid="map-area" />,
}));
vi.mock("@/src/components/prereq-tree/prereq-tree-pane", () => ({ PrereqTreePane: () => null }));
vi.mock("@/src/components/calendar/calendar-pane", () => ({
  CalendarPane: () => <div data-testid="calendar-pane" />,
}));
vi.mock("@/src/components/course-lookup/course-lookup-pane", () => ({
  CourseLookupPane: ({ setState }: { state: { code: string }; setState: (s: Partial<{ code: string }>) => void }) => (
    <button type="button" data-testid="course-setstate" onClick={() => setState({ code: "CPSC 110" })}>
      set
    </button>
  ),
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
  Object.defineProperty(window, "sessionStorage", { value: storagePolyfill, configurable: true, writable: true });
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

function renderTool(view: CanvasView | null) {
  shellRef.current = null;
  return render(
    <ChatShellProvider>
      <FullBleedTool view={view} />
      <Capture />
    </ChatShellProvider>,
  );
}

describe("7.2 — FullBleedTool (REQ-4.3, REQ-4.4)", () => {
  it("defaults to the first registry entry (Campus Map) when view is null", () => {
    const { container } = renderTool(null);
    expect(container.querySelector('[data-pane="map"]')).not.toBeNull();
  });

  it("selecting another tool replaces the current one", () => {
    const { container, rerender } = renderTool({ paneId: "course-lookup", state: { code: "" } });
    expect(container.querySelector('[data-pane="course-lookup"]')).not.toBeNull();
    rerender(
      <ChatShellProvider>
        <FullBleedTool view={{ paneId: "calendar", state: { cursor: "2026-08", kinds: ["academic"] } }} />
        <Capture />
      </ChatShellProvider>,
    );
    expect(container.querySelector('[data-pane="course-lookup"]')).toBeNull();
    expect(container.querySelector('[data-pane="calendar"]')).not.toBeNull();
  });

  it("setState round-trips into workspaceView state", () => {
    const { getByTestId } = renderTool({ paneId: "course-lookup", state: { code: "" } });
    act(() => {
      fireEvent.click(getByTestId("course-setstate"));
    });
    expect(shellRef.current?.workspaceView?.paneId).toBe("course-lookup");
    expect(shellRef.current?.workspaceView?.state).toEqual({ code: "CPSC 110" });
  });
});
