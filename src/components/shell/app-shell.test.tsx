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
  VersionBadge: () => null,
}));
vi.mock("@/src/components/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/src/components/shell/user-menu", () => ({ UserMenu: () => null }));
vi.mock("@/src/components/ui/live-region", () => ({ LiveRegion: () => null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: () => {} }),
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

  it("below-wide AI opens the Answer Canvas as a sheet and inerts the chat", () => {
    const { container } = renderShell(false);
    fireEvent.click(container.querySelector('[aria-label="Open answer canvas"]') as HTMLElement);
    expect(container.querySelector("#main-content")?.getAttribute("data-pane")).toBe("chat");
    expect(container.querySelector('[data-answer-sheet="open"]')).not.toBeNull();
    expect(container.querySelector("[data-answer-scrim]")).not.toBeNull();
    expect(container.querySelector("#main-content")?.hasAttribute("inert")).toBe(true);
  });

  it("wide Tools renders the Full-Bleed Tool with the skip target on the tool", () => {
    const { container } = renderShell(true);
    fireEvent.click(container.querySelector("[data-mode-toggle]") as HTMLElement);
    expect(container.querySelector("#main-content")?.getAttribute("data-pane")).toBe("tool");
    expect(container.querySelector('[data-testid="chat-children"]')).toBeNull();
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
