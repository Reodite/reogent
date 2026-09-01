// @vitest-environment happy-dom
import { ChatShellProvider, useChatShell, type ChatShellState } from "@/src/components/chat/chat-shell-context";
import { LeftSidebar } from "@/src/components/shell/left-sidebar";
import { ModeToggle } from "@/src/components/shell/mode-toggle";
import { SHELL_MODE_STORAGE_KEY } from "@/src/lib/shell-mode";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/src/components/providers", () => ({ useApi: () => ({ listSessions: async () => [] }) }));
vi.mock("@/src/components/auth/app-auth", () => ({ useAppAuth: () => ({ status: "signedOut" }) }));
const pathname = vi.hoisted(() => ({ value: "/chat" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  usePathname: () => pathname.value,
  useParams: () => ({}),
}));
vi.mock("@/src/components/map/map-panel", () => ({
  MapArea: () => <div data-testid="map-area" />,
}));
vi.mock("@/src/components/prereq-tree/prereq-tree-pane", () => ({ PrereqTreePane: () => null }));
vi.mock("@/src/components/calendar/calendar-pane", () => ({ CalendarPane: () => null }));
vi.mock("@/src/components/course-lookup/course-lookup-pane", () => ({ CourseLookupPane: () => null }));
// Stand-in for SessionSidebar in AI mode: renders a marker plus the footer so the
// swap logic (and the footer-pinned ModeToggle) are what we assert, not the heavy
// session list internals.
vi.mock("@/src/components/shell/session-sidebar", () => ({
  BrandHeader: () => null,
  SessionSidebar: ({ footer }: { footer?: ReactNode }) => (
    <div data-testid="session-list" data-source="SessionList">
      {footer}
    </div>
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
  Object.defineProperty(window, "localStorage", { value: storagePolyfill, configurable: true, writable: true });
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
  pathname.value = "/chat";
  mem.clear();
  vi.clearAllMocks();
  cleanup();
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

function modeLink(container: HTMLElement, label: string): HTMLAnchorElement {
  const link = Array.from(container.querySelectorAll<HTMLAnchorElement>("[data-mode-toggle]")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!link) throw new Error(`Missing ${label} mode link`);
  return link;
}

describe("9.3 — ModeToggle + LeftSidebar (REQ-1.1, REQ-1.4, REQ-6.3)", () => {
  it("ModeToggle navigates by link and persists the selected mode", () => {
    const { container } = render(
      <ChatShellProvider>
        <ModeToggle />
        <Capture />
      </ChatShellProvider>,
    );
    const toolsLink = modeLink(container, "Tools");
    expect(toolsLink.getAttribute("href")).toBe("/tools/map");
    act(() => fireEvent.click(toolsLink));
    expect(shellRef.current?.mode).toBe("tools");
    expect(localStorage.getItem(SHELL_MODE_STORAGE_KEY)).toBe("tools");
    expect(toolsLink.getAttribute("aria-current")).toBe("page");
  });

  it("LeftSidebar shows SessionList in AI mode and ToolList in Tools mode", () => {
    const { container } = render(
      <ChatShellProvider>
        <LeftSidebar />
        <Capture />
      </ChatShellProvider>,
    );
    expect(container.querySelector('[data-testid="session-list"]')).not.toBeNull();
    expect(container.querySelector("[data-tool-list]")).toBeNull();
    act(() => fireEvent.click(modeLink(container, "Tools")));
    expect(container.querySelector('[data-testid="session-list"]')).toBeNull();
    expect(container.querySelector("[data-tool-list]")).not.toBeNull();
  });

  it("ToolList selection sets workspaceView to the tool's default view", () => {
    const { container } = render(
      <ChatShellProvider>
        <LeftSidebar />
        <Capture />
      </ChatShellProvider>,
    );
    act(() => fireEvent.click(modeLink(container, "Tools")));
    act(() => fireEvent.click(container.querySelector('[data-tool-id="prereq-tree"]') as HTMLElement));
    expect(shellRef.current?.workspaceView?.paneId).toBe("prereq-tree");
    expect(shellRef.current?.workspaceView?.state).toEqual({ root: "", query: "", selections: {}, softDisabled: {} });
  });

  it("the ModeToggle is reachable from both modes", () => {
    const { container } = render(
      <ChatShellProvider>
        <LeftSidebar />
      </ChatShellProvider>,
    );
    expect(modeLink(container, "AI").getAttribute("aria-current")).toBe("page");
    act(() => fireEvent.click(modeLink(container, "Tools")));
    expect(modeLink(container, "Tools").getAttribute("aria-current")).toBe("page");
  });

  it("marks shared schedule links as part of Schedule", () => {
    pathname.value = "/pulse/schedule/ABC123";
    localStorage.setItem(SHELL_MODE_STORAGE_KEY, "unity");

    const { getByRole } = render(
      <ChatShellProvider>
        <LeftSidebar />
      </ChatShellProvider>,
    );

    expect(getByRole("button", { name: "Schedule" }).getAttribute("aria-current")).toBe("page");
    expect(getByRole("button", { name: "Pulse" }).getAttribute("aria-current")).toBeNull();
  });
});
