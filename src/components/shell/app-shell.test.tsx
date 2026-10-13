// @vitest-environment happy-dom
import { ChatFrame } from "@/src/components/chat/chat-frame";
import { ChatShellProvider, useChatShell, type ChatShellState } from "@/src/components/chat/chat-shell-context";
import { AppShell } from "@/src/components/shell/app-shell";
import { ShellNavigationProvider } from "@/src/components/shell/shell-navigation";
import { WorkspacePage } from "@/src/components/ui/workspace";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Heavy sub-trees are stubbed so the assertions target AppShell's composition
// (regions + #main-content + sheet/drawer), not the pane internals.
const auth = vi.hoisted(() => ({ status: "signedIn" }));
vi.mock("@/src/components/auth/app-auth", () => ({ useAppAuth: () => auth }));
vi.mock("@/src/components/providers", () => ({ useApi: () => ({ listSessions: async () => [] }) }));
vi.mock("@/src/components/map/map-panel", () => ({
  MapArea: () => (
    <WorkspacePage composition="canvas" title="Campus map">
      <div data-testid="map-area">
        <button type="button">Map task action</button>
      </div>
    </WorkspacePage>
  ),
}));
vi.mock("@/src/components/prereq-tree/prereq-tree-pane", () => ({ PrereqTreePane: () => null }));
vi.mock("@/src/components/calendar/calendar-pane", () => ({
  CalendarPane: () => (
    <WorkspacePage composition="canvas" title="Calendar">
      <div data-testid="calendar-pane" />
    </WorkspacePage>
  ),
}));
vi.mock("@/src/components/course-lookup/course-lookup-pane", () => ({ CourseLookupPane: () => null }));
const plannerReady = vi.hoisted(() => Promise.withResolvers<void>());
vi.mock("@/src/components/degree-planner/degree-planner-pane", async () => {
  await plannerReady.promise;
  return {
    DegreePlannerPane: () => (
      <WorkspacePage composition="canvas" title="Degree planner">
        <div data-testid="planner-pane" />
      </WorkspacePage>
    ),
  };
});
vi.mock("@/src/components/shell/session-sidebar", () => ({
  useSidebarCollapsed: () => [false, () => {}],
  BrandHeader: ({ trailing }: { trailing?: ReactNode }) => trailing,
  SessionSidebar: ({
    footer,
    onCollapse,
    onClose,
  }: {
    footer?: ReactNode;
    onCollapse?: () => void;
    onClose?: () => void;
  }) => (
    <div data-testid="session-list">
      {onClose && (
        <button type="button" onClick={onClose}>
          Close sessions
        </button>
      )}
      {onCollapse && (
        <button id="desktop-session-collapse" type="button" onClick={onCollapse}>
          Collapse sessions
        </button>
      )}
      {footer}
    </div>
  ),
}));
vi.mock("@/src/components/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/src/components/shell/user-menu", () => ({ UserMenu: () => null }));
vi.mock("@/src/components/ui/live-region", () => ({ LiveRegion: () => null }));
const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  usePathname: () => pathname.value,
  useParams: () => ({}),
}));

let viewportWidth = 390;
const mediaQueries = new Map<string, { media: MediaQueryList; listeners: Set<EventListener> }>();

function matchesWidth(query: string, width: number) {
  const match = query.match(/(min|max)-width: (\d+)px/);
  return match ? (match[1] === "min" ? width >= Number(match[2]) : width <= Number(match[2])) : false;
}

function resizeViewport(width: number) {
  act(() => {
    const previousWidth = viewportWidth;
    viewportWidth = width;
    for (const [query, { media, listeners }] of mediaQueries) {
      if (matchesWidth(query, previousWidth) === media.matches) continue;
      const event = new Event("change");
      Object.assign(event, { matches: media.matches, media: query });
      for (const listener of listeners) listener(event);
    }
  });
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
  vi.spyOn(Element.prototype, "animate").mockReturnValue({ cancel: () => {} } as Animation);
  Object.defineProperty(window, "sessionStorage", { value: storage, configurable: true, writable: true });
  Object.defineProperty(window, "localStorage", { value: storage, configurable: true, writable: true });
  Object.defineProperty(window, "matchMedia", {
    value: (query: string) => {
      let entry = mediaQueries.get(query);
      if (!entry) {
        const listeners = new Set<EventListener>();
        const media = {
          media: query,
          get matches() {
            return matchesWidth(query, viewportWidth);
          },
          addEventListener: (_type: string, listener: EventListener) => listeners.add(listener),
          removeEventListener: (_type: string, listener: EventListener) => listeners.delete(listener),
          addListener() {},
          removeListener() {},
        } as MediaQueryList;
        entry = { media, listeners };
        mediaQueries.set(query, entry);
      }
      return entry.media;
    },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  pathname.value = "/";
  mem.clear();
  vi.clearAllMocks();
  cleanup();
  auth.status = "signedIn";
  mediaQueries.clear();
  viewportWidth = 390;
  document.body.style.overflow = "";
});
afterAll(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
});

const capturedShell: { current: ChatShellState | null } = { current: null };
function CaptureShell() {
  capturedShell.current = useChatShell();
  return null;
}

function ShellFixture() {
  return (
    <ChatShellProvider>
      <CaptureShell />
      <AppShell>
        <ChatFrame header={<span>Conversation</span>} footer={null}>
          <div data-testid="chat-children" />
        </ChatFrame>
      </AppShell>
    </ChatShellProvider>
  );
}

function NavigatingShellFixture() {
  return (
    <ShellNavigationProvider>
      <ShellFixture />
    </ShellNavigationProvider>
  );
}

function renderShell(wide: boolean) {
  viewportWidth = wide ? 1440 : 390;
  return render(<ShellFixture />);
}

function modeLink(container: HTMLElement, label: string): HTMLAnchorElement {
  const link = Array.from(container.querySelectorAll<HTMLAnchorElement>("[data-mode-toggle]")).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!link) throw new Error(`Missing ${label} mode link`);
  return link;
}

it("gates private content during SSR, initialization and signout", () => {
  auth.status = "initializing";
  expect(renderToString(<ShellFixture />)).not.toContain("chat-children");
  const view = renderShell(true);
  expect(view.queryByTestId("chat-children")).toBeNull();
  auth.status = "signedIn";
  view.rerender(<ShellFixture />);
  expect(view.queryByTestId("chat-children")).not.toBeNull();
  auth.status = "signedOut";
  view.rerender(<ShellFixture />);
  expect(view.queryByTestId("chat-children")).toBeNull();
});

describe("AppShell navigation", () => {
  it("preserves sidebar trigger focus when a lazy tool finishes loading", async () => {
    pathname.value = "/tools/planner";
    const view = renderShell(false);
    const trigger = view.getByRole("button", { name: "Open sidebar" });
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    await act(async () => plannerReady.resolve());
    await view.findByTestId("planner-pane");
    expect(document.activeElement).toBe(view.getByRole("button", { name: "Open sidebar" }));
  });

  it("inline AI renders chat + Answer Canvas with the skip target on chat", () => {
    const { container, getByTestId } = renderShell(true);
    expect(container.querySelector("#main-content")?.getAttribute("data-pane")).toBe("chat");
    expect(getByTestId("chat-children")).toBeDefined();
    expect(container.querySelector('[data-testid="session-list"]')).not.toBeNull();
    expect(container.querySelector("[data-mode-toggle]")).not.toBeNull();
    expect(container.querySelector('[data-answer-sheet="closed"]')).not.toBeNull();
  });

  it("loads the tool selected by its direct URL", async () => {
    pathname.value = "/tools/map";
    const view = renderShell(true);
    await view.findByTestId("map-area");

    pathname.value = "/tools/calendar";
    view.rerender(<ShellFixture />);
    await view.findByTestId("calendar-pane");
    expect(view.queryByTestId("map-area")).toBeNull();
  });

  it("preserves the active ChatPanel when native history mints its session URL", () => {
    pathname.value = "/chat";
    const view = renderShell(true);
    const chat = view.getByTestId("chat-children");

    pathname.value = "/chat/f1100000-0000-4000-8000-000000000001";
    view.rerender(<ShellFixture />);

    expect(view.getByTestId("chat-children")).toBe(chat);
  });

  it("replaces old chat with the intended tool before pathname commit", async () => {
    pathname.value = "/chat";
    const { container, findByTestId, queryByTestId } = render(<NavigatingShellFixture />);

    act(() => fireEvent.click(modeLink(container, "Tools")));

    expect(container.querySelector("#main-content")?.getAttribute("data-pane")).toBe("tool");
    await findByTestId("map-area");
    expect(queryByTestId("chat-children")).toBeNull();
    expect(container.querySelector("[data-shell-navigation-pending='/tools/map']")).not.toBeNull();
  });

  it("uses destination-shaped loading instead of Pulse when entering AI", () => {
    pathname.value = "/pulse";
    const { container, queryByTestId } = render(<NavigatingShellFixture />);

    act(() => fireEvent.click(modeLink(container, "AI")));

    expect(container.querySelector("#main-content")?.getAttribute("data-pane")).toBe("chat");
    expect(container.querySelector("[data-new-chat-loading]")).not.toBeNull();
    expect(container.querySelector("[data-answer-canvas-loading]")).not.toBeNull();
    expect(queryByTestId("chat-children")).toBeNull();
  });

  it("Tools mode renders no right pane collapse button", () => {
    const { container } = renderShell(true);
    fireEvent.click(modeLink(container, "Tools"));
    expect(container.querySelector('[aria-label="Close answer canvas"]')).toBeNull();
    expect(container.querySelector('[aria-label="Expand right pane"]')).toBeNull();
  });

  it("gates bottom navigation behind overlays and restores it on Settings", () => {
    const { container, getByRole, rerender } = renderShell(false);
    const menu = getByRole("button", { name: "Open sidebar" });
    expect(menu.getAttribute("aria-expanded")).toBe("false");
    expect(getByRole("link", { name: "Skip to main content" }).closest("nav")).not.toBeNull();
    const bottom = container.querySelector("[data-mobile-navigation]");
    expect(bottom?.querySelectorAll("[data-mode-toggle]")).toHaveLength(3);
    fireEvent.click(menu);
    expect(bottom?.hasAttribute("inert")).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(bottom?.hasAttribute("inert")).toBe(false);
    act(() => capturedShell.current?.setAnswerSheetOpen(true));
    expect(bottom?.hasAttribute("inert")).toBe(true);
    pathname.value = "/settings";
    rerender(<ShellFixture />);
    expect(container.querySelector("[data-answer-sheet]")).toBeNull();
    expect(bottom?.hasAttribute("inert")).toBe(false);
  });

  it("keeps navigation available when returning from Settings with a retained answer sheet", () => {
    pathname.value = "/chat";
    const view = render(<NavigatingShellFixture />);
    act(() => capturedShell.current?.setAnswerSheetOpen(true));
    pathname.value = "/settings";
    view.rerender(<NavigatingShellFixture />);
    fireEvent.click(modeLink(view.container, "AI"));
    expect(view.container.querySelector("[data-navigation-pending]")).not.toBeNull();
    expect(view.container.querySelector("[data-answer-sheet]")?.getAttribute("data-answer-sheet")).toBe("closed");
    expect(view.getByRole("button", { name: "Open sidebar" }).closest("[inert]")).toBeNull();
    expect(view.container.querySelector("[data-mobile-navigation]")?.hasAttribute("inert")).toBe(false);
  });

  it("keeps pending destination navigation available outside inert task controls", () => {
    pathname.value = "/chat";
    const { container, getByRole } = render(<NavigatingShellFixture />);
    fireEvent.click(modeLink(container, "Tools"));
    const menu = getByRole("button", { name: "Open sidebar" });
    expect(menu.closest("[inert]")).toBeNull();
    expect(getByRole("button", { name: "Map task action" }).closest("[inert]")).not.toBeNull();
    fireEvent.click(menu);
    expect(container.querySelector('[role="dialog"][aria-label="Tools"]')?.parentElement?.hasAttribute("inert")).toBe(
      false,
    );
  });

  it("mobile AI has no way to manually open the answer sheet — only show_widget can", () => {
    const { container } = renderShell(false);
    expect(container.querySelector('[data-answer-sheet="open"]')).toBeNull();
    expect(container.querySelector('[aria-label="Open answer canvas"]')).toBeNull();
  });

  it("renders Settings as a utility workspace without exposing the prior tool as current", () => {
    const view = renderShell(true);
    fireEvent.click(modeLink(view.container, "Tools"));
    fireEvent.click(view.container.querySelector('[data-tool-id="prereq-tree"]') as HTMLElement);

    pathname.value = "/settings";
    view.rerender(<ShellFixture />);

    expect(view.container.querySelectorAll("main")).toHaveLength(1);
    expect(view.container.querySelector("#main-content")?.getAttribute("data-pane")).toBe("settings");
    expect(view.container.querySelector("#main-content")?.getAttribute("data-shell-mode")).toBe("tools");
    expect(view.container.querySelector('[data-testid="chat-children"]')).not.toBeNull();
    expect(view.container.querySelector('[data-tool-id="prereq-tree"]')?.getAttribute("aria-current")).toBeNull();
    expect(view.container.querySelector("[data-answer-sheet]")).toBeNull();
  });

  it("opens the compact Tools drawer without replacing the active tool", () => {
    const { container } = renderShell(false);
    fireEvent.click(modeLink(container, "Tools"));
    const opener = container.querySelector('[aria-label="Open sidebar"]') as HTMLElement;
    fireEvent.click(opener);
    const drawer = container.querySelector('[role="dialog"][aria-label="Tools"]');
    expect(drawer).not.toBeNull();
    expect(drawer?.querySelector("[data-tool-list]")).not.toBeNull();
    expect(container.querySelector("#main-content")?.getAttribute("data-pane")).toBe("tool");
  });
});

describe("ARIA landmarks", () => {
  it("exposes one main skip target and no inactive answer region", () => {
    const { container } = renderShell(true);
    const main = container.querySelectorAll("main");
    expect(main.length).toBe(1);
    expect(main[0]?.id).toBe("main-content");
    expect(main[0]?.getAttribute("data-pane")).toBe("chat");
    expect(container.querySelector('[aria-label="Answer canvas"]')).toBeNull();
  });
});

describe("drawer focus and inert state", () => {
  it("loops drawer focus without reaching the underlying navigation", () => {
    const rects = vi
      .spyOn(HTMLElement.prototype, "getClientRects")
      .mockReturnValue([new DOMRect(0, 0, 44, 44)] as unknown as DOMRectList);
    try {
      const { container, getByRole } = renderShell(false);
      fireEvent.click(getByRole("button", { name: "Open sidebar" }));
      const drawer = container.querySelector('[role="dialog"][aria-label="Chat sessions"]');
      const first = drawer?.querySelector<HTMLButtonElement>("button");
      const last = drawer?.querySelector<HTMLAnchorElement>('a[aria-label="Unity"]');
      expect(first).not.toBeNull();
      expect(last).not.toBeNull();
      last?.focus();
      fireEvent.keyDown(document, { key: "Tab" });
      expect(document.activeElement).toBe(first);
      fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
      expect(document.activeElement).toBe(last);
    } finally {
      rects.mockRestore();
    }
  });

  it("closing the left drawer returns focus to the Open-sidebar button", () => {
    const { container } = renderShell(false);
    const opener = container.querySelector('[aria-label="Open sidebar"]') as HTMLButtonElement;
    fireEvent.click(opener);
    expect(container.querySelector('[role="dialog"]')?.parentElement?.hasAttribute("inert")).toBe(false);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(container.querySelector('[role="dialog"]')?.parentElement?.hasAttribute("inert")).toBe(true);
    expect(document.activeElement).toBe(opener);
  });
});

describe("sidebar responsive cleanup", () => {
  it.each([
    ["AI", "/chat", 1024],
    ["Unity", "/pulse", 1024],
    ["Tools", "/tools/map", 1280],
  ])("closes %s at its desktop breakpoint and restores desktop focus", (_mode, path, breakpoint) => {
    pathname.value = path;
    document.body.style.overflow = "auto";
    const { container, getByRole } = renderShell(false);
    const opener = getByRole("button", { name: "Open sidebar" });
    fireEvent.click(opener);
    expect(container.querySelector(".shell-body")?.hasAttribute("inert")).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");

    resizeViewport(Number(breakpoint) - 1);
    expect(container.querySelector(".shell-body")?.hasAttribute("inert")).toBe(true);
    resizeViewport(Number(breakpoint));

    expect(container.querySelector('[role="dialog"]')?.parentElement?.hasAttribute("inert")).toBe(true);
    expect(container.querySelector(".shell-body")?.hasAttribute("inert")).toBe(false);
    expect(opener.hasAttribute("inert")).toBe(false);
    expect(document.body.style.overflow).toBe("auto");
    expect(document.activeElement).toBe(container.querySelector("#desktop-session-collapse"));

    resizeViewport(390);
    expect(container.querySelector(".shell-body")?.hasAttribute("inert")).toBe(false);
    fireEvent.click(opener);
    expect(document.body.style.overflow).toBe("hidden");
    resizeViewport(1440);
    expect(container.querySelector(".shell-body")?.hasAttribute("inert")).toBe(false);
    expect(document.body.style.overflow).toBe("auto");
  });

  it.each(["/chat", "/pulse"])("closes an open Tools drawer when the mode changes to %s on desktop", (path) => {
    pathname.value = "/tools/map";
    viewportWidth = 1100;
    const view = render(<ShellFixture />);
    fireEvent.click(view.getByRole("button", { name: "Open sidebar" }));
    expect(view.container.querySelector(".shell-body")?.hasAttribute("inert")).toBe(true);

    pathname.value = path;
    view.rerender(<ShellFixture />);

    expect(view.container.querySelector(".shell-body")?.hasAttribute("inert")).toBe(false);
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(view.container.querySelector("#desktop-session-collapse"));
    expect(mediaQueries.get("(min-width: 1280px)")?.listeners.size).toBe(0);
  });

  it("updates the listener when an open compact drawer changes mode and cleans up on unmount", () => {
    pathname.value = "/chat";
    const view = renderShell(false);
    fireEvent.click(view.getByRole("button", { name: "Open sidebar" }));
    pathname.value = "/tools/map";
    view.rerender(<ShellFixture />);

    expect(mediaQueries.get("(min-width: 1024px)")?.listeners.size).toBe(0);
    expect(mediaQueries.get("(min-width: 1280px)")?.listeners.size).toBe(1);
    resizeViewport(1100);
    expect(view.container.querySelector(".shell-body")?.hasAttribute("inert")).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");

    view.unmount();
    expect(mediaQueries.get("(min-width: 1280px)")?.listeners.size).toBe(0);
    expect(document.body.style.overflow).toBe("");
  });

  it("leaves the drawer open when Escape is already prevented", () => {
    const { container, getByRole } = renderShell(false);
    fireEvent.click(getByRole("button", { name: "Open sidebar" }));
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    event.preventDefault();
    fireEvent(document, event);
    expect(container.querySelector(".shell-body")?.hasAttribute("inert")).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("leaves Escape to an open popup when its trigger retains focus", () => {
    const { container, getByRole } = renderShell(false);
    fireEvent.click(getByRole("button", { name: "Open sidebar" }));
    const trigger = document.createElement("button");
    trigger.setAttribute("aria-controls", "owned-account-popup");
    container.querySelector(".shell-sidebar-drawer")?.append(trigger);
    const popup = document.createElement("div");
    popup.id = "owned-account-popup";
    popup.setAttribute("data-floating-panel", "");
    document.body.append(popup);
    try {
      trigger.focus();
      fireEvent.keyDown(trigger, { key: "Escape" });
      expect(container.querySelector(".shell-body")?.hasAttribute("inert")).toBe(true);
    } finally {
      popup.remove();
    }
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(container.querySelector(".shell-body")?.hasAttribute("inert")).toBe(false);
  });

  it.each(["data-floating-panel", "data-dialog-root"])("leaves Escape to a portaled %s child", (attribute) => {
    const { container, getByRole } = renderShell(false);
    fireEvent.click(getByRole("button", { name: "Open sidebar" }));
    const panel = document.createElement("div");
    panel.setAttribute(attribute, "");
    const child = document.createElement("button");
    panel.append(child);
    document.body.append(panel);
    try {
      fireEvent.keyDown(child, { key: "Escape" });
      expect(container.querySelector(".shell-body")?.hasAttribute("inert")).toBe(true);
      expect(document.body.style.overflow).toBe("hidden");
    } finally {
      panel.remove();
    }
    fireEvent.keyDown(document, { key: "Escape" });
    expect(container.querySelector(".shell-body")?.hasAttribute("inert")).toBe(false);
  });
});
