// @vitest-environment happy-dom
import { ChatShellProvider, useChatShell, type ChatShellState } from "@/src/components/chat/chat-shell-context";
import { LeftSidebar } from "@/src/components/shell/left-sidebar";
import { ModeToggle } from "@/src/components/shell/mode-toggle";
import { SHELL_MODE_STORAGE_KEY } from "@/src/lib/shell-mode";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/src/components/providers", () => ({ useApi: () => ({ listSessions: async () => [] }) }));
const auth = vi.hoisted(() => ({ isGuest: false }));
vi.mock("@/src/components/auth/app-auth", () => ({
  useAppAuth: () => ({ status: "signedIn", isGuest: auth.isGuest }),
}));
const pathname = vi.hoisted(() => ({ value: "/chat" }));
const routerPush = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: routerPush }),
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
  auth.isGuest = false;
  mem.clear();
  routerPush.mockReset();
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
  it("ModeToggle persists intent and follows the committed route", () => {
    const view = render(
      <ChatShellProvider>
        <ModeToggle />
        <Capture />
      </ChatShellProvider>,
    );
    const toolsLink = modeLink(view.container, "Tools");
    expect(toolsLink.getAttribute("href")).toBe("/tools/map");
    act(() => fireEvent.click(toolsLink));
    expect(routerPush).toHaveBeenCalledWith("/tools/map");
    expect(localStorage.getItem(SHELL_MODE_STORAGE_KEY)).toBe("tools");

    pathname.value = "/tools/map";
    view.rerender(
      <ChatShellProvider>
        <ModeToggle />
        <Capture />
      </ChatShellProvider>,
    );
    expect(shellRef.current?.mode).toBe("tools");
    expect(modeLink(view.container, "Tools").getAttribute("aria-current")).toBe("page");
  });

  it("blocks modified and auxiliary activation for guest-locked destinations", () => {
    auth.isGuest = true;
    const view = render(
      <ChatShellProvider initialMode="tools">
        <ModeToggle />
      </ChatShellProvider>,
    );
    const aiLink = modeLink(view.container, "AI");
    const modifiedClick = new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true });
    const auxiliaryClick = new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 });

    aiLink.dispatchEvent(modifiedClick);
    aiLink.dispatchEvent(auxiliaryClick);

    expect(modifiedClick.defaultPrevented).toBe(true);
    expect(auxiliaryClick.defaultPrevented).toBe(true);
    expect(routerPush).not.toHaveBeenCalled();
  });

  it("allows the retained mode link to leave Settings", () => {
    const view = render(
      <ChatShellProvider>
        <ModeToggle />
        <Capture />
      </ChatShellProvider>,
    );
    fireEvent.click(modeLink(view.container, "Tools"));
    pathname.value = "/tools/map";
    view.rerender(
      <ChatShellProvider>
        <ModeToggle />
        <Capture />
      </ChatShellProvider>,
    );
    expect(shellRef.current?.mode).toBe("tools");

    pathname.value = "/settings";
    view.rerender(
      <ChatShellProvider>
        <ModeToggle />
        <Capture />
      </ChatShellProvider>,
    );
    localStorage.removeItem(SHELL_MODE_STORAGE_KEY);
    fireEvent.click(modeLink(view.container, "Tools"));

    expect(localStorage.getItem(SHELL_MODE_STORAGE_KEY)).toBe("tools");
  });

  it("LeftSidebar shows SessionList in AI mode and ToolList on the Tools route", () => {
    const view = render(
      <ChatShellProvider>
        <LeftSidebar />
        <Capture />
      </ChatShellProvider>,
    );
    expect(view.container.querySelector('[data-testid="session-list"]')).not.toBeNull();
    expect(view.container.querySelector("[data-tool-list]")).toBeNull();

    pathname.value = "/tools/map";
    view.rerender(
      <ChatShellProvider>
        <LeftSidebar />
        <Capture />
      </ChatShellProvider>,
    );
    expect(view.container.querySelector('[data-testid="session-list"]')).toBeNull();
    expect(view.container.querySelector("[data-tool-list]")).not.toBeNull();
  });

  it("ToolList selection navigates by URL and closes its host drawer", () => {
    const onClose = vi.fn();
    const view = render(
      <ChatShellProvider>
        <LeftSidebar onClose={onClose} />
        <Capture />
      </ChatShellProvider>,
    );
    pathname.value = "/tools/map";
    view.rerender(
      <ChatShellProvider>
        <LeftSidebar onClose={onClose} />
        <Capture />
      </ChatShellProvider>,
    );
    routerPush.mockClear();
    act(() => fireEvent.click(view.container.querySelector('[data-tool-id="prereq-tree"]') as HTMLElement));
    expect(routerPush).toHaveBeenCalledWith("/tools/prereq");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes its host drawer after cross-area and Unity navigation", () => {
    const onClose = vi.fn();
    const view = render(
      <ChatShellProvider>
        <LeftSidebar onClose={onClose} />
      </ChatShellProvider>,
    );

    act(() => fireEvent.click(modeLink(view.container, "Tools")));
    expect(onClose).toHaveBeenCalledOnce();

    pathname.value = "/pulse";
    view.rerender(
      <ChatShellProvider initialMode="unity">
        <LeftSidebar onClose={onClose} />
      </ChatShellProvider>,
    );
    act(() => fireEvent.click(view.getByRole("button", { name: "Creators" })));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("marks the pathname tool current without depending on workspace state", () => {
    pathname.value = "/tools/prereq/CPSC320";
    const { container } = render(
      <ChatShellProvider initialMode="tools">
        <LeftSidebar />
      </ChatShellProvider>,
    );

    expect(container.querySelector('[data-tool-id="prereq-tree"]')?.getAttribute("aria-current")).toBe("page");
    expect(container.querySelector('[data-tool-id="course-lookup"]')?.getAttribute("aria-current")).toBeNull();
  });

  it("the ModeToggle is reachable from both modes", () => {
    const view = render(
      <ChatShellProvider>
        <LeftSidebar />
      </ChatShellProvider>,
    );
    expect(modeLink(view.container, "AI").getAttribute("aria-current")).toBe("page");
    pathname.value = "/tools/map";
    view.rerender(
      <ChatShellProvider>
        <LeftSidebar />
      </ChatShellProvider>,
    );
    expect(modeLink(view.container, "Tools").getAttribute("aria-current")).toBe("page");
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
