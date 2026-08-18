// @vitest-environment happy-dom
import { ChatShellProvider, useChatShell, type ChatShellState } from "@/src/components/chat/chat-shell-context";
import { AnswerCanvas } from "@/src/components/shell/answer-canvas";
import type { CanvasView } from "@/src/components/shell/pane-registry";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/src/components/providers", () => ({ useApi: () => ({ listSessions: async () => [] }) }));
vi.mock("@/src/components/auth/app-auth", () => ({ useAppAuth: () => ({ status: "signedOut" }) }));
vi.mock("@/src/components/map/map-panel", () => ({
  MapArea: () => <div data-testid="map-area" />,
  MapBottomSheet: () => null,
}));
vi.mock("@/src/components/prereq-tree/prereq-tree-pane", () => ({ PrereqTreePane: () => null }));
vi.mock("@/src/components/calendar/calendar-pane", () => ({ CalendarPane: () => null }));
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

function renderCanvas(view: CanvasView | null) {
  shellRef.current = null;
  return render(
    <ChatShellProvider>
      <AnswerCanvas view={view} />
      <Capture />
    </ChatShellProvider>,
  );
}

describe("6.2 — AnswerCanvas (REQ-7.1, REQ-7.2)", () => {
  it("idle (view null) renders the map-first canvas", () => {
    const { container } = renderCanvas(null);
    const section = container.querySelector('[data-pane="map"]');
    expect(section).not.toBeNull();
    expect(section?.getAttribute("aria-label")).toBe("Answer canvas");
    expect(container.querySelector('[data-pane="course-lookup"]')).toBeNull();
  });

  it("an active non-map pane renders its header and component", () => {
    const { container } = renderCanvas({ paneId: "course-lookup", state: { code: "" } });
    const section = container.querySelector('[data-pane="course-lookup"]');
    expect(section).not.toBeNull();
    expect(section?.querySelector("h2")?.textContent).toBe("Course lookup");
  });

  it("pane setState merges back into workspaceView state (fixes the noopSetState bug)", () => {
    const { getByTestId } = renderCanvas({ paneId: "course-lookup", state: { code: "" } });
    act(() => {
      fireEvent.click(getByTestId("course-setstate"));
    });
    expect(shellRef.current?.workspaceView?.paneId).toBe("course-lookup");
    expect(shellRef.current?.workspaceView?.state).toEqual({ code: "CPSC 110" });
  });

  it("an unknown pane id falls back to the idle map (no-op transition, not an error)", () => {
    const { container } = renderCanvas({ paneId: "nonexistent", state: {} });
    expect(container.querySelector('[data-pane="map"]')).not.toBeNull();
  });

  it("an active map view renders the map canvas", () => {
    const { container } = renderCanvas({ paneId: "map", state: {} });
    expect(container.querySelector('[data-pane="map"]')).not.toBeNull();
  });
});
