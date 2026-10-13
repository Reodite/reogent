// @vitest-environment happy-dom
import { ChatShellProvider, useChatShell, type ChatShellState } from "@/src/components/chat/chat-shell-context";
import { AnswerCanvas } from "@/src/components/shell/answer-canvas";
import { WorkspaceHostProvider } from "@/src/components/shell/workspace-host";
import type { CanvasView } from "@/src/shared/panes";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/src/components/providers", () => ({ useApi: () => ({ listSessions: async () => [] }) }));
vi.mock("@/src/components/auth/app-auth", () => ({ useAppAuth: () => ({ status: "signedOut" }) }));
const mapReady = vi.hoisted(() => Promise.withResolvers<void>());
vi.mock("@/src/components/map/map-panel", async () => {
  await mapReady.promise;
  return { MapArea: () => <div data-testid="map-area" /> };
});
vi.mock("@/src/components/prereq-tree/prereq-tree-pane", () => ({ PrereqTreePane: () => null }));
vi.mock("@/src/components/calendar/calendar-pane", () => ({
  CalendarPane: () => {
    throw new Error("Tool failed to load");
  },
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
  vi.restoreAllMocks();
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

function renderCanvas(view: CanvasView | null, titlebar = true) {
  shellRef.current = null;
  return render(
    <WorkspaceHostProvider host="tools" navigation={<button type="button">Open sidebar</button>}>
      <ChatShellProvider>
        <AnswerCanvas view={view} titlebar={titlebar} />
        <Capture />
      </ChatShellProvider>
    </WorkspaceHostProvider>,
  );
}

describe("AnswerCanvas", () => {
  it("idle (view null) renders nothing", () => {
    const { container } = renderCanvas(null);
    expect(container.querySelector("[data-pane]")).toBeNull();
  });

  it("an active non-map pane renders its header and component", async () => {
    const view = renderCanvas({ paneId: "course-lookup", state: { code: "" } });
    expect(view.getByRole("heading", { name: "Course lookup" })).toBeDefined();
    await view.findByTestId("course-setstate");
  });

  it("pane setState merges back into workspaceView state", async () => {
    const { findByTestId } = renderCanvas({ paneId: "course-lookup", state: { code: "" } });
    fireEvent.click(await findByTestId("course-setstate"));
    expect(shellRef.current?.workspaceView?.paneId).toBe("course-lookup");
    expect(shellRef.current?.workspaceView?.state).toEqual({ code: "CPSC 110" });
  });

  it("an unknown pane id renders nothing (no-op transition, not an error)", () => {
    const { container } = renderCanvas({ paneId: "nonexistent", state: {} });
    expect(container.querySelector("[data-pane]")).toBeNull();
  });

  it("keeps the map header and close action available while loading", async () => {
    const view = renderCanvas({ paneId: "map", state: {} });
    expect(view.getByRole("heading", { name: "Campus map" })).toBeDefined();
    expect(view.getByRole("button", { name: "Close" })).toBeDefined();
    expect(view.getByRole("status", { name: "Loading Campus map" })).toBeDefined();
    await act(async () => mapReady.resolve());
    await view.findByTestId("map-area");
    expect(view.queryByRole("status")).toBeNull();
  });

  it.each([true, false])("keeps navigation and reload available after pane failure (titlebar=%s)", async (titlebar) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const reload = vi.spyOn(window.location, "reload").mockImplementation(() => {});
    const view = renderCanvas({ paneId: "calendar", state: {} }, titlebar);
    expect((await view.findByRole("alert")).textContent).toContain("Calendar unavailable");
    expect(view.getByRole("button", { name: titlebar ? "Close" : "Open sidebar" })).toBeDefined();
    fireEvent.click(view.getByRole("button", { name: "Reload page" }));
    expect(reload).toHaveBeenCalledOnce();
  });
});
