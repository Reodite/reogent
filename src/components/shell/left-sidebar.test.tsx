// @vitest-environment happy-dom
import { ChatShellProvider, useChatShell, type ChatShellState } from "@/src/components/chat/chat-shell-context";
import { LeftSidebar } from "@/src/components/shell/left-sidebar";
import { ModeToggle } from "@/src/components/shell/mode-toggle";
import { ShellNavigationProvider } from "@/src/components/shell/shell-navigation";
import { SidebarListNav } from "@/src/components/shell/sidebar-list";
import {
  LAST_CHAT_PATH_KEY,
  LAST_TOOLS_PATH_KEY,
  LAST_UNITY_PATH_KEY,
  SHELL_MODE_STORAGE_KEY,
} from "@/src/lib/shell-mode";
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
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
  window.history.replaceState(null, "", "/");
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
  it.each(["/chat", "/tools/map", "/pulse"])(
    "centers the collapsed account without shrinking expanded modes at %s",
    async (path) => {
      pathname.value = path;
      const view = render(
        <ChatShellProvider>
          <LeftSidebar collapsed />
        </ChatShellProvider>,
      );
      await act(async () => {});
      expect(view.getByRole("button", { name: "Account menu" }).parentElement?.classList.contains("items-center")).toBe(
        true,
      );
      view.rerender(
        <ChatShellProvider>
          <LeftSidebar />
        </ChatShellProvider>,
      );
      expect(view.getByRole("button", { name: "Account menu" }).parentElement?.classList.contains("items-center")).toBe(
        false,
      );
    },
  );

  it.each([
    [false, "rounded-2xl", "p-2"],
    [true, "rounded-xl", "p-1"],
  ] as const)("derives the navigation well contour for collapsed=%s", (collapsed, radius, padding) => {
    const view = render(
      <SidebarListNav label="Tools" collapsed={collapsed}>
        <li>Campus map</li>
      </SidebarListNav>,
    );
    const well = view.getByRole("navigation", { name: "Tools" });
    expect(well.classList.contains(radius)).toBe(true);
    expect(well.classList.contains(padding)).toBe(true);
    expect(well.getAttribute("data-sidebar-list")).toBe(collapsed ? "collapsed" : "expanded");
  });

  it("renders bottom navigation as three labeled, flat links with the routed area current", () => {
    pathname.value = "/tools/map";
    const view = render(
      <ChatShellProvider>
        <ModeToggle presentation="bottom" collapsed />
      </ChatShellProvider>,
    );
    const nav = view.getByRole("navigation", { name: "Reodite areas" });
    expect(nav.getAttribute("data-mode-navigation")).toBe("bottom");
    expect(nav.hasAttribute("data-mobile-mode-navigation")).toBe(true);
    expect(nav.className).toBe("mobile-mode-bar");
    expect(view.getByRole("list").className).toContain("grid-cols-3");
    expect(view.getByRole("list").className).toContain("h-15");
    expect(view.getByRole("list").className).not.toMatch(/gap-1|px-2/);
    expect(nav.querySelector<HTMLElement>(".mobile-mode-indicator")?.style.transform).toBe("translateX(100%)");
    expect(view.getAllByRole("link")).toHaveLength(3);
    for (const label of ["AI", "Tools", "Unity"]) {
      const link = view.getByRole("link", { name: label });
      expect(link.textContent).toBe(label);
      expect(link.className).toContain("h-15");
      expect(link.className).toContain("flex-col");
      expect(link.className).toContain("gap-1");
      expect(link.className).toContain("text-xs");
      expect(link.classList.contains("relative")).toBe(true);
      expect(link.classList.contains("isolate")).toBe(true);
      expect(link.classList.contains("outline-none")).toBe(true);
      expect(link.className).not.toContain("active:bg-");
      expect(link.className).not.toContain("focus-visible:ring-");
      expect(link.className).not.toContain("neu-");
      expect(link.querySelector("svg")?.getAttribute("width")).toBe("22");
      expect(link.getAttribute("aria-current")).toBe(label === "Tools" ? "page" : null);
      expect(link.className).toContain(label === "Tools" ? "text-primary" : "text-muted");
    }
  });

  it.each([
    ["sidebar", false],
    ["sidebar", true],
    ["bottom", false],
  ] as const)("omits guest mode navigation for %s with collapsed=%s", (presentation, collapsed) => {
    auth.isGuest = true;
    pathname.value = "/tools/map";
    const view = render(
      <ChatShellProvider>
        <ModeToggle presentation={presentation} collapsed={collapsed} />
      </ChatShellProvider>,
    );
    expect(view.container.childElementCount).toBe(0);
    expect(view.queryByRole("navigation", { name: "Reodite areas" })).toBeNull();
    expect(view.queryByRole("tooltip")).toBeNull();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it.each([
    ["AI", "/chat", LAST_CHAT_PATH_KEY, "/settings"],
    ["AI", "/chat/session-123", LAST_CHAT_PATH_KEY, "/settings"],
    ["Tools", "/tools", LAST_TOOLS_PATH_KEY, "/settings"],
    ["Tools", "/tools/prereq/CPSC320", LAST_TOOLS_PATH_KEY, "/settings"],
    ["Unity", "/pulse", LAST_UNITY_PATH_KEY, "/settings"],
    ["Unity", "/pulse/schedule/ABC123", LAST_UNITY_PATH_KEY, "/settings"],
    ["AI", "/chat/session-123", LAST_CHAT_PATH_KEY, "/about"],
    ["Tools", "/tools/prereq/CPSC320", LAST_TOOLS_PATH_KEY, "/about"],
    ["Unity", "/pulse/schedule/ABC123", LAST_UNITY_PATH_KEY, "/about"],
  ])("remembers the actual %s route %s in %s and resumes it from %s", (label, path, key, utilityPath) => {
    pathname.value = path;
    window.history.replaceState(null, "", path);
    const content = (
      <ChatShellProvider>
        <ModeToggle presentation="bottom" />
      </ChatShellProvider>
    );
    const view = render(content);
    expect(sessionStorage.getItem(key)).toBe(path);
    fireEvent.click(view.getByRole("link", { name: label }));
    expect(routerPush).not.toHaveBeenCalled();

    pathname.value = utilityPath;
    window.history.replaceState(null, "", utilityPath);
    view.rerender(
      <ChatShellProvider>
        <ModeToggle presentation="bottom" />
      </ChatShellProvider>,
    );
    fireEvent.click(view.getByRole("link", { name: label }));
    expect(routerPush).toHaveBeenCalledWith(path);
    expect(sessionStorage.getItem(key)).toBe(path);
  });

  it.each([
    ["AI", LAST_CHAT_PATH_KEY, "/chatty", "/chat"],
    ["Tools", LAST_TOOLS_PATH_KEY, "/toolshed", "/tools/map"],
    ["Unity", LAST_UNITY_PATH_KEY, "/settings", "/pulse"],
    ["Unity", LAST_UNITY_PATH_KEY, "/pulse/creators", "/pulse"],
    ["Tools", LAST_TOOLS_PATH_KEY, "/tools/../settings", "/tools/map"],
  ])("uses the %s fallback for invalid stored path %s=%s", (label, key, stored, fallback) => {
    pathname.value = "/settings";
    window.history.replaceState(null, "", "/settings");
    sessionStorage.setItem(key, stored);
    const view = render(
      <ChatShellProvider>
        <ModeToggle presentation="bottom" />
      </ChatShellProvider>,
    );
    fireEvent.click(view.getByRole("link", { name: label }));
    expect(routerPush).toHaveBeenCalledWith(fallback);
  });

  it("shares restoration with the sidebar while keeping native modified-click hrefs", () => {
    pathname.value = "/settings";
    window.history.replaceState(null, "", "/settings");
    sessionStorage.setItem(LAST_TOOLS_PATH_KEY, "/tools/courses/CPSC110");
    const view = render(
      <ChatShellProvider>
        <ModeToggle />
      </ChatShellProvider>,
    );
    expect(view.getByRole("navigation").getAttribute("data-mode-navigation")).toBe("sidebar");
    const tools = view.getByRole("link", { name: "Tools" });
    expect(tools.getAttribute("href")).toBe("/tools/map");
    // Block Happy DOM's native navigation while checking modifier handling.
    tools.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(tools, { ctrlKey: true });
    expect(routerPush).not.toHaveBeenCalled();
    fireEvent.click(tools);
    expect(routerPush).toHaveBeenCalledWith("/tools/courses/CPSC110");
  });

  it("remembers actual paths rather than pending mode destinations", () => {
    window.history.replaceState(null, "", "/chat/actual-session");
    pathname.value = "/chat/actual-session";
    const view = render(
      <ShellNavigationProvider>
        <ChatShellProvider>
          <ModeToggle presentation="bottom" />
        </ChatShellProvider>
      </ShellNavigationProvider>,
    );
    fireEvent.click(view.getByRole("link", { name: "Tools" }));
    expect(view.getByRole("link", { name: "Tools" }).getAttribute("aria-current")).toBe("page");
    fireEvent.click(view.getByRole("link", { name: "Unity" }));
    expect(sessionStorage.getItem(LAST_CHAT_PATH_KEY)).toBe("/chat/actual-session");
    expect(sessionStorage.getItem(LAST_TOOLS_PATH_KEY)).toBeNull();
    expect(sessionStorage.getItem(LAST_UNITY_PATH_KEY)).toBeNull();
  });

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

  it("keeps collapsed mode names accessible for signed-in users", () => {
    const view = render(
      <ChatShellProvider>
        <ModeToggle collapsed />
      </ChatShellProvider>,
    );
    for (const label of ["AI", "Tools", "Unity"]) {
      expect(view.getByRole("link", { name: label }).textContent).toBe("");
    }
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

  it.each(["/tools/map", "/account", "/settings", "/about"])(
    "keeps the guest sidebar tools-only at %s despite a saved Unity mode",
    (path) => {
      auth.isGuest = true;
      pathname.value = path;
      localStorage.setItem(SHELL_MODE_STORAGE_KEY, "unity");
      const onClose = vi.fn();
      const view = render(
        <ChatShellProvider>
          <LeftSidebar onClose={onClose} />
        </ChatShellProvider>,
      );
      expect(view.getByRole("navigation", { name: "Tools" })).not.toBeNull();
      expect(view.queryByTestId("session-list")).toBeNull();
      expect(view.queryByRole("navigation", { name: "Community" })).toBeNull();
      expect(view.queryByRole("navigation", { name: "Reodite areas" })).toBeNull();
      expect(view.getByRole("button", { name: "Account menu" })).not.toBeNull();

      view.rerender(
        <ChatShellProvider>
          <LeftSidebar collapsed onClose={onClose} />
        </ChatShellProvider>,
      );
      expect(view.getByRole("navigation", { name: "Tools" }).getAttribute("data-sidebar-list")).toBe("collapsed");
      expect(view.container.querySelector("[data-mode-toggle]")).toBeNull();
      expect(view.getByRole("button", { name: "Account menu" })).not.toBeNull();
      fireEvent.click(view.container.querySelector('[data-tool-id="prereq-tree"]') as HTMLElement);
      expect(routerPush).toHaveBeenCalledWith("/tools/prereq");
      expect(onClose).toHaveBeenCalledOnce();
    },
  );

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
    const community = view.getByRole("navigation", { name: "Community" });
    expect(
      within(community)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Announcements", "Pulse", "Schedule"]);
    act(() => fireEvent.click(view.getByRole("button", { name: "Schedule" })));
    expect(routerPush).toHaveBeenLastCalledWith("/pulse/schedule");
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

  it.each(["/pulse/announcements", "/pulse/announcements/welcome"])(
    "puts Announcements first and marks it current at %s",
    (path) => {
      pathname.value = path;
      const onClose = vi.fn();
      const view = render(
        <ChatShellProvider initialMode="unity">
          <LeftSidebar onClose={onClose} />
        </ChatShellProvider>,
      );
      const nav = view.getByRole("navigation", { name: "Community" });
      const announcement = view.getByRole("button", { name: "Announcements" });
      expect(nav.querySelector("button")).toBe(announcement);
      expect(announcement.getAttribute("aria-current")).toBe("page");
      expect(view.getByRole("button", { name: "Pulse" }).getAttribute("aria-current")).toBeNull();
      fireEvent.click(announcement);
      expect(routerPush).toHaveBeenCalledWith("/pulse/announcements");
      expect(onClose).toHaveBeenCalledOnce();
    },
  );

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
