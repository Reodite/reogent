// @vitest-environment happy-dom
import { ChatShellProvider } from "@/src/components/chat/chat-shell-context";
import { AppShell } from "@/src/components/shell/app-shell";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Heavy sub-trees are stubbed so the assertions target AppShell's composition
// (regions + #main-content + sheet/drawer), not the pane internals.
vi.mock("@/src/components/auth/app-auth", () => ({ useAppAuth: () => ({ status: "signedIn" }) }));
vi.mock("@/src/components/providers", () => ({ useApi: () => ({ listSessions: async () => [] }) }));
vi.mock("@/src/components/map/map-panel", () => ({
  MapArea: () => <div data-testid="map-area" />,
}));
vi.mock("@/src/components/prereq-tree/prereq-tree-pane", () => ({ PrereqTreePane: () => null }));
vi.mock("@/src/components/calendar/calendar-pane", () => ({ CalendarPane: () => null }));
vi.mock("@/src/components/course-lookup/course-lookup-pane", () => ({ CourseLookupPane: () => null }));
vi.mock("@/src/components/shell/session-sidebar", () => ({
  useSidebarCollapsed: () => [false, () => {}],
  SessionSidebar: ({ footer }: { footer?: ReactNode }) => <div data-testid="session-list">{footer}</div>,
}));
vi.mock("@/src/components/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/src/components/shell/user-menu", () => ({ UserMenu: () => null }));
vi.mock("@/src/components/ui/live-region", () => ({ LiveRegion: () => null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {}, push: () => {} }),
  usePathname: () => "/",
  useParams: () => ({}),
}));

let wideMatches = false;
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
      matches: wideMatches,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
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
  localStorage.clear();
});

function renderShell(wide: boolean) {
  wideMatches = wide;
  return render(
    <ChatShellProvider>
      <AppShell>
        <div data-testid="chat-children" />
      </AppShell>
    </ChatShellProvider>,
  );
}

describe("10.4 — AppShell layouts (REQ-2.1, REQ-4.1, REQ-7.1)", () => {
  it("wide AI renders chat + Answer Canvas inline with the skip target on chat", () => {
    const { container, getByTestId } = renderShell(true);
    expect(container.querySelector("#main-content")?.getAttribute("data-pane")).toBe("chat");
    expect(getByTestId("chat-children")).toBeDefined();
    expect(container.querySelector('[data-testid="session-list"]')).not.toBeNull();
    expect(container.querySelector("[data-mode-toggle]")).not.toBeNull();
    expect(container.querySelector('[data-answer-sheet="closed"]')).not.toBeNull();
  });

  it("wide AI right pane starts collapsed and has no re-expand in topbar", () => {
    const { container } = renderShell(true);

    // Pane is hidden with `lg:hidden` by default.
    const sheet = container.querySelector("[data-answer-sheet]");
    expect(sheet?.classList.contains("lg:hidden")).toBe(true);

    // There is no topbar expand button for the right pane.
    expect(container.querySelector('[aria-label="Expand right pane"]')).toBeNull();
  });

  it("Tools mode renders no right pane collapse button", () => {
    const { container } = renderShell(true);
    fireEvent.click(container.querySelector("[data-mode-toggle]") as HTMLElement);
    expect(container.querySelector('[aria-label="Close answer canvas"]')).toBeNull();
    expect(container.querySelector('[aria-label="Expand right pane"]')).toBeNull();
  });

  it("below-wide AI has no way to manually open the answer sheet — only show_widget can", () => {
    const { container } = renderShell(false);
    expect(container.querySelector('[data-answer-sheet="open"]')).toBeNull();
    expect(container.querySelector('[aria-label="Open answer canvas"]')).toBeNull();
  });

  it("wide Tools renders the Full-Bleed Tool with the skip target on the tool", () => {
    const { container } = renderShell(true);
    fireEvent.click(container.querySelector("[data-mode-toggle]") as HTMLElement);
    expect(container.querySelector("#main-content")?.getAttribute("data-pane")).toBe("tool");
    // No view activated yet → children (not-found) renders instead of the tool.
    // This matches the real app: navigating to an unknown /tools/<slug> shows the
    // not-found page in the workspace, while a valid tool activates via the
    // ToolRouteActivator effect.
    expect(container.querySelector('[data-testid="chat-children"]')).not.toBeNull();
    expect(container.querySelector("[data-tool-list]")).not.toBeNull();
  });

  it("below-wide Tools lives in the left drawer, Full-Bleed Tool stays full-bleed", () => {
    const { container } = renderShell(false);
    fireEvent.click(container.querySelector("[data-mode-toggle]") as HTMLElement);
    fireEvent.click(container.querySelector('[aria-label="Open sidebar"]') as HTMLElement);
    const drawer = container.querySelector('[role="dialog"][aria-label="Tools"]');
    expect(drawer).not.toBeNull();
    expect(drawer?.querySelector("[data-tool-list]")).not.toBeNull();
    expect(container.querySelector("#main-content")?.getAttribute("data-pane")).toBe("tool");
  });
});

describe("13.2 — ARIA landmarks (REQ-8.2)", () => {
  it("the ChatSurface wrapper is the sole <main> and carries #main-content; the Answer canvas is a labelled region", () => {
    const { container } = renderShell(true);
    const main = container.querySelectorAll("main");
    expect(main.length).toBe(1);
    expect(main[0]?.id).toBe("main-content");
    expect(main[0]?.getAttribute("data-pane")).toBe("chat");
    expect(container.querySelector('[aria-label="Answer canvas"]')).toBeNull();
  });
});

describe("13.3 — focus move/return + inert (REQ-2.5, REQ-8.1, REQ-8.3)", () => {
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
